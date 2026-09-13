import { create } from "zustand";
import type { CredentialsProvider } from "@tidal-music/common";
import type { PlaybackState } from "@tidal-music/player";
import { errorMessage, logToTerminal } from "@/lib/logger";
import { mediaProductFor } from "@/lib/mediaProduct";
import {
  playbackService,
  type PlaybackServiceClient,
} from "@/services/playbackService";
import { useQueueStore, type PlaybackSource } from "@/store/queueStore";
import { useSessionStore } from "@/store/sessionStore";
import type { Track } from "@/types/track";

const POSITION_POLL_INTERVAL_MS = 500;
const DEFAULT_VOLUME = 80;
const PREVIOUS_RESTART_THRESHOLD_S = 3;

interface PlayerStore {
  isInitialized: boolean;
  isPlaying: boolean;
  playbackState: PlaybackState | null;
  currentTrack: Track | null;
  position: number;
  duration: number;
  volume: number;
  error: string | null;
  isQueueOpen: boolean;
  init: () => void;
  playQueue: (tracks: Track[], startIndex: number, source: PlaybackSource) => Promise<void>;
  playTrackAt: (index: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setVolume: (level: number) => void;
  stopAndReset: () => Promise<void>;
  setQueueOpen: (open: boolean) => void;
}

function buildCredentialsProvider(): CredentialsProvider {
  return {
    bus: () => {},
    getCredentials: async () => {
      const credentials = await useSessionStore.getState().getSessionCredentials();
      return {
        clientId: credentials.client_id,
        token: credentials.access_token,
        userId: credentials.user_id != null ? String(credentials.user_id) : undefined,
        requestedScopes: [],
      };
    },
  };
}

function scheduleNextTrack(): void {
  const queue = useQueueStore.getState();
  const nextIndex = queue.nextIndex();
  const nextTrack = nextIndex != null ? queue.getTrackAt(nextIndex) : null;
  void playbackService.setNext(
    nextTrack && queue.source ? mediaProductFor(nextTrack, queue.source) : undefined,
  );
}

function findQueueIndex(referenceId: string | undefined): number {
  const queue = useQueueStore.getState();
  if (referenceId != null) {
    const index = queue.tracks.findIndex((track) => String(track.id) === referenceId);
    if (index >= 0) return index;
  }
  return queue.currentIndex ?? 0;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const createStoreClient = (): PlaybackServiceClient => ({
    onTransition: (active, duration) => {
      logToTerminal("info", `media-product-transition: ${active.productId}`);
      const index = findQueueIndex(active.referenceId);
      const queue = useQueueStore.getState();
      const track = queue.getTrackAt(index);
      queue.jumpTo(index);
      if (track) {
        set({ currentTrack: track, duration: duration || track.duration, position: 0 });
      }
      scheduleNextTrack();
    },
    onPlaybackStateChange: (playbackState) => {
      logToTerminal("info", `playback-state: ${playbackState}`);
      set({ playbackState, isPlaying: playbackState === "PLAYING", error: null });
    },
    onEnded: (reason) => {
      logToTerminal("info", `ended: ${reason}`);
      if (reason === "error") {
        set({ isPlaying: false, error: "Playback ended unexpectedly." });
      }
    },
    onError: (error) => {
      logToTerminal(
        "error",
        `playback error ${error.errorId} (${error.errorCode}): ${JSON.stringify(error)}`,
      );
      set({ error: `Playback error (${error.errorId}, ${error.errorCode}).`, isPlaying: false });
    },
    onStreamingPrivilegesRevoked: (otherDevice) => {
      set({
        error: `Streaming privileges revoked${otherDevice ? ` by another device (${otherDevice})` : ""}.`,
        isPlaying: false,
      });
    },
  });

  return {
    isInitialized: false,
    isPlaying: false,
    playbackState: null,
    currentTrack: null,
    position: 0,
    duration: 0,
    volume: DEFAULT_VOLUME,
    error: null,
    isQueueOpen: false,

    init: () => {
      if (get().isInitialized) return;
      playbackService.initialize(buildCredentialsProvider(), createStoreClient());
      playbackService.setVolume(get().volume);
      set({ isInitialized: true });

      // WebKitGTK (Tauri's Linux webview) does not implement EME, so DRM
      // protected tracks can never decode. Fail fast with a clear message
      // instead of silently rejecting inside the SDK.
      if (!playbackService.isDrmSupported()) {
        const message =
          "El webview de Linux (WebKitGTK) no soporta DRM/Widevine, así que no se puede reproducir audio completo. Podés reproducir desde una versión del navegador.";
        logToTerminal("error", message);
        set({ error: message, isPlaying: false });
        return;
      }

      window.setInterval(() => {
        if (get().playbackState === "PLAYING") {
          set({ position: playbackService.getPosition() });
        }
      }, POSITION_POLL_INTERVAL_MS);
    },

    playQueue: async (tracks, startIndex, source) => {
      const track = tracks[startIndex];
      if (!track) return;
      useQueueStore.getState().setQueue(tracks, startIndex, source);
      set({ currentTrack: track, error: null, isQueueOpen: false });
      const next = tracks[startIndex + 1];
      try {
        await playbackService.startTrack(
          mediaProductFor(track, source),
          next ? mediaProductFor(next, source) : undefined,
        );
      } catch (error) {
        logToTerminal("error", `startTrack failed: ${errorMessage(error)}`);
        set({ error: `No se pudo iniciar la reproducción: ${errorMessage(error)}`, isPlaying: false });
      }
    },

    playTrackAt: async (index) => {
      const queue = useQueueStore.getState();
      const track = queue.getTrackAt(index);
      if (!track || !queue.source) return;
      queue.jumpTo(index);
      set({ currentTrack: track, error: null });
      const next = queue.getTrackAt(index + 1);
      try {
        await playbackService.startTrack(
          mediaProductFor(track, queue.source),
          next ? mediaProductFor(next, queue.source) : undefined,
        );
      } catch (error) {
        logToTerminal("error", `startTrack failed: ${errorMessage(error)}`);
        set({ error: `No se pudo iniciar la reproducción: ${errorMessage(error)}`, isPlaying: false });
      }
    },

    togglePlay: async () => {
      const state = get();
      if (!state.currentTrack) return;
      if (state.isPlaying) {
        playbackService.pause();
        set({ isPlaying: false });
      } else {
        try {
          await playbackService.resume();
        } catch (error) {
          logToTerminal("error", `resume failed: ${errorMessage(error)}`);
          set({ error: `No se pudo reanudar: ${errorMessage(error)}`, isPlaying: false });
        }
      }
    },

    next: async () => {
      const nextIndex = useQueueStore.getState().nextIndex();
      if (nextIndex != null) {
        await get().playTrackAt(nextIndex);
      }
    },

    previous: async () => {
      const state = get();
      if (state.position > PREVIOUS_RESTART_THRESHOLD_S) {
        await playbackService.seek(0);
        set({ position: 0 });
        return;
      }
      const previousIndex = useQueueStore.getState().previousIndex();
      if (previousIndex != null) {
        await get().playTrackAt(previousIndex);
      }
    },

    seek: async (seconds) => {
      await playbackService.seek(seconds);
      set({ position: seconds });
    },

    setVolume: (level) => {
      const clamped = Math.max(0, Math.min(100, level));
      playbackService.setVolume(clamped);
      set({ volume: clamped });
    },

    stopAndReset: async () => {
      await playbackService.reset();
      useQueueStore.getState().clear();
      set({
        currentTrack: null,
        playbackState: "IDLE",
        isPlaying: false,
        position: 0,
        duration: 0,
        error: null,
        isQueueOpen: false,
      });
    },

    setQueueOpen: (open) => set({ isQueueOpen: open }),
  };
});