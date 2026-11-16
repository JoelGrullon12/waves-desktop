import { deriveEngineEvents } from "@/lib/engineEvents";
import { PlaybackFailure } from "@/lib/playbackErrors";
import type { EnginePlaybackState, EngineSnapshot } from "@/types/player";

// Renderer side of the playback engine. The audio comes from TIDAL's own web
// player, which the main process runs in a hidden window and reads a couple of
// times per second (electron/main/tidalWebPlayer.ts). This service sends it
// commands over IPC and turns its readings into events for one subscriber (the
// player store).
//
// The web player only ever holds the current track and the one queued after
// it: Waves owns the real queue.

export type PlaybackState = EnginePlaybackState;

export interface AudioFormat {
  audioQuality: string | null;
  bitDepth: number | null;
  sampleRate: number | null;
  codec: string | null;
}

export interface PlaybackServiceClient {
  // A track started sounding: one the app asked for, or the queued one the web
  // player moved on to by itself.
  onTransition(trackId: string, durationSeconds: number): void;
  onPlaybackStateChange(state: PlaybackState): void;
  onProgress(positionSeconds: number, durationSeconds: number, format: AudioFormat): void;
  // The current track played to its end and nothing was queued after it.
  onEnded(): void;
  onNotice(message: string): void;
}

// Applying the volume is retried while the web player disagrees, but not on
// every reading.
const VOLUME_RETRY_INTERVAL_MS = 2000;

export class PlaybackService {
  private client: PlaybackServiceClient | null = null;
  private stopListeningToEngine: (() => void) | null = null;
  private previousSnapshot: EngineSnapshot | null = null;
  private requestedTrackId: string | null = null;
  private playRequestsInFlight = 0;
  private pauseRequested = false;
  // Playback the subscriber was last told about, so it is never announced twice.
  private announcedPlaybackId: string | null = null;
  private desiredVolume: number | null = null;
  private lastVolumeAttemptAt = 0;

  initialize(client: PlaybackServiceClient): void {
    this.client = client;
    // A new subscriber knows nothing yet: the next reading is reported in full.
    this.previousSnapshot = null;
    this.announcedPlaybackId = null;
    this.stopListeningToEngine?.();
    this.stopListeningToEngine = window.api.onPlayerState((snapshot) =>
      this.handleSnapshot(snapshot),
    );
  }

  stopListening(): void {
    this.stopListeningToEngine?.();
    this.stopListeningToEngine = null;
    this.client = null;
  }

  // Resolves once the track is sounding; rejects with a PlaybackFailure.
  async startTrack(trackId: string): Promise<void> {
    this.pauseRequested = false;
    this.requestedTrackId = trackId;
    this.playRequestsInFlight += 1;
    try {
      const result = await window.api.playerPlay(trackId);
      if (!result.ok) throw new PlaybackFailure(result.reason);
      // The web player sometimes starts the track it already had loaded
      // without creating a new playback, so no transition shows up in the
      // readings; the subscriber still has to hear that the track started.
      if (result.playbackId !== null && result.playbackId === this.previousSnapshot?.playbackId) {
        if (this.announcedPlaybackId !== result.playbackId) {
          this.announcedPlaybackId = result.playbackId;
          this.client?.onTransition(trackId, this.previousSnapshot.durationSeconds);
        }
      }
    } finally {
      this.playRequestsInFlight -= 1;
    }
  }

  // Queues the track the web player moves on to when the current one ends, so
  // the change has no gap. Returns false when it could not be queued; the
  // store then starts the next track itself when `onEnded` fires.
  async setNext(trackId: string | null): Promise<boolean> {
    return await window.api.playerSetNext(trackId);
  }

  async resume(): Promise<void> {
    this.pauseRequested = false;
    await window.api.playerResume();
  }

  async pause(): Promise<void> {
    this.pauseRequested = true;
    await window.api.playerPause();
  }

  async seek(seconds: number): Promise<void> {
    await window.api.playerSeek(seconds);
  }

  // Level is 0-100, the same scale the web player uses.
  setVolume(level: number): void {
    this.desiredVolume = level;
    this.lastVolumeAttemptAt = Date.now();
    void window.api.playerSetVolume(level);
  }

  async reset(): Promise<void> {
    this.pauseRequested = true;
    this.requestedTrackId = null;
    await window.api.playerStop();
  }

  getPosition(): number {
    return this.previousSnapshot?.positionSeconds ?? 0;
  }

  private handleSnapshot(snapshot: EngineSnapshot): void {
    const events = deriveEngineEvents(this.previousSnapshot, snapshot, {
      pauseRequested: this.pauseRequested,
      onlyAcceptTrackId: this.playRequestsInFlight > 0 ? this.requestedTrackId : null,
    });
    this.previousSnapshot = snapshot;
    this.keepVolumeInSync(snapshot);

    for (const event of events) {
      if (event.type === "transition") {
        this.requestedTrackId = event.trackId;
        this.announcedPlaybackId = snapshot.playbackId;
        this.client?.onTransition(event.trackId, event.durationSeconds);
      } else if (event.type === "state") {
        this.client?.onPlaybackStateChange(event.state);
      } else if (event.type === "ended") {
        this.client?.onEnded();
      } else {
        this.client?.onNotice(event.message);
      }
    }

    if (snapshot.ready && snapshot.trackId !== null && snapshot.trackId === this.requestedTrackId) {
      this.client?.onProgress(snapshot.positionSeconds, snapshot.durationSeconds, {
        audioQuality: snapshot.audioQuality,
        bitDepth: snapshot.bitDepth,
        sampleRate: snapshot.sampleRate,
        codec: snapshot.codec,
      });
    }
  }

  // The web player remembers its own volume between runs and may load after
  // the app set one, so the app's volume is re-applied until both agree.
  private keepVolumeInSync(snapshot: EngineSnapshot): void {
    if (!snapshot.ready || this.desiredVolume === null) return;
    if (Math.round(snapshot.volume) === Math.round(this.desiredVolume)) return;
    if (Date.now() - this.lastVolumeAttemptAt < VOLUME_RETRY_INTERVAL_MS) return;
    this.lastVolumeAttemptAt = Date.now();
    void window.api.playerSetVolume(this.desiredVolume);
  }
}

export const playbackService = new PlaybackService();
