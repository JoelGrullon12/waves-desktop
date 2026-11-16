// Shared between the main process (which reads it from TIDAL's web player) and
// the renderer. Keep this file free of DOM and Node types.

export type EnginePlaybackState = "IDLE" | "PLAYING" | "NOT_PLAYING" | "STALLED";

// One reading of the web player, taken a couple of times per second.
export interface EngineSnapshot {
  // False while the web player is still loading or its internals were not found.
  ready: boolean;
  loggedIn: boolean;
  trackId: string | null;
  // Unique per queue entry of the web player, so replaying the same track is
  // still seen as a new playback.
  playbackId: string | null;
  playbackState: EnginePlaybackState;
  positionSeconds: number;
  // 0 until the web player knows the real duration of the current track.
  durationSeconds: number;
  volume: number;
  upcomingTrackIds: string[];
  audioQuality: string | null;
  bitDepth: number | null;
  sampleRate: number | null;
  codec: string | null;
  // Latest message the web player showed to the user (already localized).
  noticeId: number | null;
  noticeMessage: string | null;
}

export type EnginePlayFailure =
  // The web player internals could not be reached (TIDAL changed its page).
  | "engine-unavailable"
  | "not-logged-in"
  // TIDAL refuses to stream this track for this account or region.
  | "unavailable"
  | "timeout"
  // Another play request replaced this one before it started.
  | "superseded";

export type EnginePlayResult =
  // `playbackId` is the snapshot's playbackId of the playback that started.
  | { ok: true; playbackId: string | null }
  | { ok: false; reason: EnginePlayFailure };

// One row of the local listening statistics.
export interface PlayedTrack {
  trackId: string;
  playCount: number;
  lastPlayedAt: string | null;
}

// State of the cloud copy of the play counts.
export interface SyncStatus {
  // False when the TURSO_* environment values are missing.
  isConfigured: boolean;
  state: "disabled" | "idle" | "syncing" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  // Plays counted locally that have not reached the cloud yet.
  pendingTracks: number;
}
