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
  // False until a Turso database is set in Settings (or TURSO_* in .env).
  isConfigured: boolean;
  state: "disabled" | "idle" | "syncing" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  // Plays counted locally that have not reached the cloud yet.
  pendingTracks: number;
}

// Where the Turso settings come from. The token never leaves the main process.
export interface SyncConfigInfo {
  source: "env" | "stored" | null;
  databaseUrl: string | null;
}

export type SyncConfigResult = { success: true; status: SyncStatus } | { success: false; error: string };

// Folder where Waves keeps settings.ini, the database and the secrets.
export interface AppDataInfo {
  directory: string;
  defaultDirectory: string;
  isDefault: boolean;
}

export type AppDataMoveResult =
  | { success: true; usedExistingData: boolean }
  | { success: false; error: string };

// --- Phone remote (see electron/main/remoteControl.ts) ---

export type RemoteCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "previous" }
  | { type: "set_volume"; value: number }
  | { type: "seek"; value: number };

export interface RemoteState {
  trackId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  volume: number;
}

export interface RemoteControlInfo {
  isEnabled: boolean;
  isRunning: boolean;
  port: number;
  // REMOTE_CONTROL_WEBSOCKET_PORT in .env decides the port; Settings can not.
  isPortFromEnvironment: boolean;
  // Address a phone on the same network opens; null when no network is up.
  url: string | null;
  connectedClients: number;
  error: string | null;
}

// Local copy of the library's reference data (liked songs and playlists).
export interface MetadataCacheStatus {
  isEnabled: boolean;
  isRefreshing: boolean;
  // What the running refresh is copying; null when idle.
  progress: string | null;
  error: string | null;
  trackCount: number;
  playlistCount: number;
  likedTrackCount: number;
  refreshedAt: string | null;
}

export interface PlaylistReference {
  id: string;
  title: string;
}

export interface TrackCollectionMembership {
  playlists: PlaylistReference[];
}
