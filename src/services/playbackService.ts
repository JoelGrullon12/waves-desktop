import {
  bootstrap,
  events,
  getAssetPosition,
  getPlaybackState,
  load,
  pause as pausePlayback,
  play as startPlayback,
  reset as resetPlayback,
  seek as seekTo,
  setCredentialsProvider,
  setNext,
  setStreamingWifiAudioQuality,
  setVolumeLevel,
  type EndedEvent,
  type Error as PlaybackError,
  type MediaProduct,
  type MediaProductTransition,
  type PlaybackState,
  type PlaybackStateChange,
  type StreamingPrivilegesRevokedEvent,
} from "@tidal-music/player";
import type { CredentialsProvider } from "@tidal-music/common";

// Thin, framework-agnostic wrapper around the TIDAL Web SDK. It owns event
// wiring and forwards SDK events to a single subscriber (the player store).
// The SDK emits no time-update events, so playback position is read via
// getAssetPosition() polling by the subscriber.

export type PlaybackEndReason = "completed" | "error" | "skip";

export interface PlaybackServiceClient {
  onTransition(mediaProduct: MediaProduct, duration: number): void;
  onPlaybackStateChange(state: PlaybackState): void;
  onEnded(reason: PlaybackEndReason): void;
  onError(error: PlaybackError): void;
  onStreamingPrivilegesRevoked(otherDevice: string): void;
}

// Desired streaming quality over WiFi. Defaults to LOW in the SDK, which is
// too low for a music player; HIGH is a sane default (320 kbps AAC).
const DEFAULT_WIFI_AUDIO_QUALITY = "HIGH" as const;

export class PlaybackService {
  private client: PlaybackServiceClient | null = null;

  initialize(credentialsProvider: CredentialsProvider, client: PlaybackServiceClient): void {
    this.client = client;

    bootstrap({
      outputDevices: false,
      players: [
        { itemTypes: ["track", "video"], player: "shaka" },
        { itemTypes: ["track", "video"], player: "browser" },
      ],
    });
    setCredentialsProvider(credentialsProvider);
    setStreamingWifiAudioQuality(DEFAULT_WIFI_AUDIO_QUALITY);

    events.addEventListener("media-product-transition", (event) => {
      const { mediaProduct, playbackContext } = (event as MediaProductTransition).detail;
      this.client?.onTransition(mediaProduct, playbackContext.actualDuration);
    });

    events.addEventListener("playback-state-change", (event) => {
      const { state } = (event as PlaybackStateChange).detail;
      this.client?.onPlaybackStateChange(state);
    });

    events.addEventListener("ended", (event) => {
      const { reason } = (event as EndedEvent).detail;
      this.client?.onEnded(reason);
    });

    events.addEventListener("error", (event) => {
      const detail = (event as CustomEvent<PlaybackError>).detail;
      if (detail) {
        this.client?.onError(detail);
      }
    });

    events.addEventListener("streaming-privileges-revoked", (event) => {
      const otherDevice = (event as StreamingPrivilegesRevokedEvent).detail;
      this.client?.onStreamingPrivilegesRevoked(otherDevice);
    });
  }

  stopListening(): void {
    this.client = null;
  }

  async startTrack(mediaProduct: MediaProduct, next?: MediaProduct): Promise<void> {
    await load(mediaProduct);
    if (next) {
      await setNext(next);
    }
    await startPlayback();
  }

  setNext(mediaProduct?: MediaProduct): Promise<void> {
    return setNext(mediaProduct);
  }

  async resume(): Promise<void> {
    await startPlayback();
  }

  pause(): void {
    pausePlayback();
  }

  async seek(seconds: number): Promise<void> {
    await seekTo(seconds);
  }

  setVolume(level: number): void {
    setVolumeLevel(level);
  }

  async reset(): Promise<void> {
    await resetPlayback();
  }

  getState(): PlaybackState {
    return getPlaybackState();
  }

  getPosition(): number {
    return getAssetPosition();
  }

  // Full-track playback on TIDAL is DRM-protected, and the SDK drives DRM
  // through navigator.requestMediaKeySystemAccess(). WebKitGTK (the webview
  // Tauri ships on Linux) does not implement EME, so this returns false there
  // and playback can never start.
  isDrmSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.requestMediaKeySystemAccess === "function"
    );
  }
}

export const playbackService = new PlaybackService();