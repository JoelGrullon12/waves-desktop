import { BrowserWindow } from "electron";
import type { EnginePlayResult, EngineSnapshot } from "../../src/types/player";
import { handleTrusted } from "./secureIpc";
import { buildEngineCall, MEDIA_KEY_MARKER, type EngineMethod } from "./tidalWebPlayerScript";
import {
  optionalResourceId,
  requireNumberInRange,
  requireResourceId,
} from "./validation";
import { isWebSessionConnected, TIDAL_WEB_PARTITION } from "./webSessionAuth";

// Playback engine: TIDAL's own web player running in a hidden window.
//
// TIDAL's audio CDN only serves full tracks to pages on tidal.com (any other
// origin gets HTTP 403, error 54113), so the app can not stream with the SDK
// from its own renderer. Instead the web player is loaded as-is, signed in
// through the partition shared with the sign-in window, and told what to play.
// Waves keeps its own queue; the web player only ever holds the current track
// and the one that follows it.
//
// The window keeps its real user agent and fingerprint (see AGENTS.md: TIDAL's
// device check hangs otherwise).

const WEB_PLAYER_URL = "https://tidal.com/";
const STATE_POLL_INTERVAL_MS = 500;
const READY_POLL_INTERVAL_MS = 250;
const READY_TIMEOUT_MS = 45_000;
const MAX_SEEK_SECONDS = 24 * 60 * 60;
const SHOW_ENGINE_WINDOW = process.env["WAVES_SHOW_ENGINE"] === "1";

export const PLAYER_STATE_CHANNEL = "player:state";
export const PLAYER_MEDIA_KEY_CHANNEL = "player:media-key";

export type MediaKeyCommand = "next" | "previous";
type MediaKeyListener = (command: MediaKeyCommand) => void;

type SnapshotListener = (snapshot: EngineSnapshot) => void;

const NOT_READY_SNAPSHOT: EngineSnapshot = {
  ready: false,
  loggedIn: false,
  trackId: null,
  playbackId: null,
  playbackState: "IDLE",
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 0,
  upcomingTrackIds: [],
  audioQuality: null,
  bitDepth: null,
  sampleRate: null,
  codec: null,
  noticeId: null,
  noticeMessage: null,
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class TidalWebPlayer {
  private engineWindow: BrowserWindow | null = null;
  private readiness: Promise<BrowserWindow> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  // Kept for the timeout message: tells a slow page apart from a broken script.
  private lastReadError: string | null = null;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly mediaKeyListeners = new Set<MediaKeyListener>();

  // Next / previous pressed on the keyboard or in the system media panel.
  onMediaKey(listener: MediaKeyListener): () => void {
    this.mediaKeyListeners.add(listener);
    return () => this.mediaKeyListeners.delete(listener);
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Loads the web player ahead of the first play so that play starts quickly.
  warmUp(): void {
    if (!isWebSessionConnected()) return;
    this.ensureReady().catch((error) =>
      console.error(`web-player: warm-up failed: ${error instanceof Error ? error.message : error}`),
    );
  }

  async play(trackId: string): Promise<EnginePlayResult> {
    if (!isWebSessionConnected()) return { ok: false, reason: "not-logged-in" };
    try {
      return await this.call<EnginePlayResult>("play", trackId);
    } catch (error) {
      console.error(`web-player: play failed: ${error instanceof Error ? error.message : error}`);
      return { ok: false, reason: "engine-unavailable" };
    }
  }

  async setNext(trackId: string | null): Promise<boolean> {
    if (!this.engineWindow) return false;
    return await this.callQuietly("setNext", trackId);
  }

  async pause(): Promise<boolean> {
    if (!this.engineWindow) return false;
    return await this.callQuietly("pause");
  }

  async resume(): Promise<boolean> {
    return await this.callQuietly("resume");
  }

  async seek(seconds: number): Promise<boolean> {
    if (!this.engineWindow) return false;
    return await this.callQuietly("seek", seconds);
  }

  async setVolume(level: number): Promise<boolean> {
    // The volume is applied again by the renderer once the engine is ready, so
    // a call made before that does not need to load the web player.
    if (!this.engineWindow) return false;
    return await this.callQuietly("setVolume", level);
  }

  async stop(): Promise<boolean> {
    if (!this.engineWindow) return false;
    return await this.callQuietly("stop");
  }

  // Closes the web player (e.g. when the TIDAL session is disconnected).
  shutDown(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    const windowToClose = this.engineWindow;
    this.engineWindow = null;
    this.readiness = null;
    if (windowToClose && !windowToClose.isDestroyed()) windowToClose.destroy();
    this.publish(NOT_READY_SNAPSHOT);
  }

  private publish(snapshot: EngineSnapshot): void {
    for (const listener of this.listeners) listener(snapshot);
  }

  private async callQuietly(method: EngineMethod, ...methodArguments: unknown[]): Promise<boolean> {
    try {
      return Boolean(await this.call<unknown>(method, ...methodArguments));
    } catch (error) {
      console.error(
        `web-player: ${method} failed: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }

  private async call<Result>(method: EngineMethod, ...methodArguments: unknown[]): Promise<Result> {
    const readyWindow = await this.ensureReady();
    return (await readyWindow.webContents.executeJavaScript(
      buildEngineCall(method, ...methodArguments),
      true,
    )) as Result;
  }

  private ensureReady(): Promise<BrowserWindow> {
    if (!this.readiness) {
      this.readiness = this.createReadyWindow().catch((error) => {
        // Let the next command try again from scratch.
        this.shutDown();
        throw error;
      });
    }
    return this.readiness;
  }

  private async createReadyWindow(): Promise<BrowserWindow> {
    const createdWindow = new BrowserWindow({
      width: 1100,
      height: 760,
      show: SHOW_ENGINE_WINDOW,
      title: "TIDAL web player (Waves engine)",
      webPreferences: {
        partition: TIDAL_WEB_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        // Same reason as the sign-in window: Linux runs with --no-sandbox.
        sandbox: process.platform !== "linux",
        // The window is never visible; without these Chromium would slow its
        // timers down and refuse to start audio without a click.
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    this.engineWindow = createdWindow;
    createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    createdWindow.webContents.on("console-message", (event) => {
      if (!event.message.startsWith(MEDIA_KEY_MARKER)) return;
      const command = event.message.slice(MEDIA_KEY_MARKER.length);
      if (command !== "next" && command !== "previous") return;
      for (const listener of this.mediaKeyListeners) listener(command);
    });
    createdWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error(`web-player: page process gone (${details.reason})`);
      if (this.engineWindow === createdWindow) this.shutDown();
    });
    createdWindow.on("closed", () => {
      if (this.engineWindow === createdWindow) this.shutDown();
    });

    await createdWindow.loadURL(WEB_PLAYER_URL);

    const startedAt = Date.now();
    while (Date.now() - startedAt < READY_TIMEOUT_MS) {
      if (createdWindow.isDestroyed()) throw new Error("The TIDAL web player window was closed.");
      const snapshot = await this.readSnapshot(createdWindow);
      if (snapshot.ready) {
        console.info(
          `web-player: ready after ${Date.now() - startedAt} ms (signed in: ${snapshot.loggedIn})`,
        );
        this.startPolling(createdWindow);
        return createdWindow;
      }
      await delay(READY_POLL_INTERVAL_MS);
    }
    throw new Error(
      `Timed out waiting for the TIDAL web player to load (${this.lastReadError ?? "its player state never appeared"}).`,
    );
  }

  private async readSnapshot(targetWindow: BrowserWindow): Promise<EngineSnapshot> {
    try {
      const snapshot = (await targetWindow.webContents.executeJavaScript(
        buildEngineCall("snapshot"),
        true,
      )) as Partial<EngineSnapshot> | null;
      return snapshot?.ready ? (snapshot as EngineSnapshot) : NOT_READY_SNAPSHOT;
    } catch (error) {
      // The page is navigating or reloading; the next poll tries again.
      this.lastReadError = error instanceof Error ? error.message : String(error);
      return NOT_READY_SNAPSHOT;
    }
  }

  private startPolling(targetWindow: BrowserWindow): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.isPolling || targetWindow.isDestroyed()) return;
      this.isPolling = true;
      void this.readSnapshot(targetWindow)
        .then((snapshot) => {
          if (this.engineWindow === targetWindow) this.publish(snapshot);
        })
        .finally(() => {
          this.isPolling = false;
        });
    }, STATE_POLL_INTERVAL_MS);
  }
}

export const tidalWebPlayer = new TidalWebPlayer();

export function registerPlayerHandlers(): void {
  handleTrusted("player:play", (_event, trackId) =>
    tidalWebPlayer.play(requireResourceId(trackId, "track id")),
  );
  handleTrusted("player:set-next", (_event, trackId) =>
    tidalWebPlayer.setNext(optionalResourceId(trackId, "track id")),
  );
  handleTrusted("player:pause", () => tidalWebPlayer.pause());
  handleTrusted("player:resume", () => tidalWebPlayer.resume());
  handleTrusted("player:seek", (_event, seconds) =>
    tidalWebPlayer.seek(requireNumberInRange(seconds, "seek position", 0, MAX_SEEK_SECONDS)),
  );
  handleTrusted("player:set-volume", (_event, level) =>
    tidalWebPlayer.setVolume(requireNumberInRange(level, "volume", 0, 100)),
  );
  handleTrusted("player:stop", () => tidalWebPlayer.stop());
}
