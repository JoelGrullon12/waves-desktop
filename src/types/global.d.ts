import type { CachedSearchResult } from "@/types/track";
import type {
  AppDataInfo,
  AppDataMoveResult,
  EnginePlayResult,
  EngineSnapshot,
  PlayedTrack,
  MetadataCacheStatus,
  RemoteCommand,
  RemoteControlInfo,
  RemoteState,
  TrackCollectionMembership,
  SyncConfigInfo,
  SyncConfigResult,
  SyncStatus,
} from "@/types/player";
import type { FavoriteTracksPage, LikedTrackIdsPage, Track, TrackPage } from "@/types/track";
import type {
  AlbumDetail,
  AlbumPage,
  AlbumSummary,
  ArtistCard,
  ArtistPage,
  SearchResults,
  MixRelationName,
  MixSummary,
  PlaylistDetail,
  PlaylistSummary,
} from "@/types/media";

declare global {
  interface Window {
    api: {
      getCredentialsStatus: () => Promise<{
        configured: boolean;
        source: "env" | "stored" | null;
      }>;
      saveCredentials: (
        clientId: string,
        clientSecret: string,
      ) => Promise<{ success: boolean; error?: string }>;
      // Removes the credentials saved in the app (.env ones stay in use).
      clearCredentials: () => Promise<{ configured: boolean; source: "env" | "stored" | null }>;
      // Folder with settings.ini, the database and the secrets. Changing it
      // opens a folder picker and restarts the app.
      getAppDataInfo: () => Promise<AppDataInfo>;
      openAppDataFolder: () => Promise<{ success: boolean; error?: string }>;
      changeAppDataLocation: () => Promise<AppDataMoveResult | null>;
      useDefaultAppDataLocation: () => Promise<AppDataMoveResult>;
      login: () => Promise<{ isAuthenticated: boolean; userId: string | null }>;
      logout: () => Promise<{ isAuthenticated: boolean }>;
      isAuthenticated: () => Promise<boolean>;
      searchTracks: (query: string) => Promise<Track[]>;
      getAlbumTracksPage: (albumId: string, cursor: string | null) => Promise<TrackPage>;
      getPlaylistTracksPage: (
        playlistId: string,
        cursor: string | null,
      ) => Promise<TrackPage>;
      getFavoriteTracksPage: (cursor: string | null) => Promise<FavoriteTracksPage>;
      getLikedTrackIdsPage: (cursor: string | null) => Promise<LikedTrackIdsPage>;
      getTracksByIds: (trackIds: string[]) => Promise<Track[]>;
      getUserPlaylists: () => Promise<PlaylistSummary[]>;
      getRecentAlbums: () => Promise<AlbumSummary[]>;
      getMixes: (relationship: MixRelationName) => Promise<MixSummary[]>;
      getMixTracksPage: (
        mixType: string,
        mixId: string,
        cursor: string | null,
      ) => Promise<TrackPage>;
      getAlbumDetail: (albumId: string) => Promise<AlbumDetail>;
      getPlaylistDetail: (playlistId: string) => Promise<PlaylistDetail>;
      getMixDetail: (mixType: string, mixId: string) => Promise<MixSummary>;
      getReleasesFeed: () => Promise<AlbumSummary[]>;
      getArtistDetail: (artistId: string) => Promise<ArtistCard>;
      getArtistTracksPage: (artistId: string, cursor: string | null) => Promise<TrackPage>;
      getArtistAlbumsPage: (artistId: string, cursor: string | null) => Promise<AlbumPage>;
      getCollectionAlbumsPage: (cursor: string | null) => Promise<AlbumPage>;
      getCollectionArtistsPage: (cursor: string | null) => Promise<ArtistPage>;
      // Albums, artists and playlists; tracks come from `searchTracks`.
      searchCollections: (query: string) => Promise<SearchResults>;
      // Writes to the user's TIDAL library.
      addTracksToLikes: (trackIds: string[]) => Promise<void>;
      removeTracksFromLikes: (trackIds: string[]) => Promise<void>;
      addTracksToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>;
      createPlaylist: (name: string) => Promise<PlaylistSummary>;
      deletePlaylist: (playlistId: string) => Promise<void>;
      // Local settings (settings.ini) and the saved play queue (SQLite).
      getPreferences: () => Promise<Record<string, string>>;
      setPreference: (key: string, value: string) => Promise<void>;
      saveQueue: (trackIds: string[]) => Promise<void>;
      loadQueue: () => Promise<string[]>;
      // Local listening statistics (SQLite).
      incrementPlayCount: (trackId: string) => Promise<number>;
      // The same ids ordered for smart shuffle: least played first, random within ties.
      getSmartShuffleOrder: (trackIds: string[]) => Promise<string[]>;
      getPlayCounts: (trackIds: string[]) => Promise<Record<string, number>>;
      // `withinDays` null means all time.
      getTopPlayed: (limit: number, withinDays: number | null) => Promise<PlayedTrack[]>;
      // Cloud copy of the play counts (Turso).
      getSyncStatus: () => Promise<SyncStatus>;
      runSyncNow: () => Promise<SyncStatus>;
      getSyncConfig: () => Promise<SyncConfigInfo>;
      // Checks the database answers before saving.
      saveSyncConfig: (databaseUrl: string, authToken: string) => Promise<SyncConfigResult>;
      clearSyncConfig: () => Promise<SyncConfigResult>;
      // Phone remote served on the local network.
      getRemoteControlInfo: () => Promise<RemoteControlInfo>;
      setRemoteControlEnabled: (enabled: boolean) => Promise<RemoteControlInfo>;
      regenerateRemoteControlToken: () => Promise<RemoteControlInfo>;
      setRemoteControlPort: (port: number) => Promise<RemoteControlInfo>;
      publishRemoteState: (state: RemoteState) => Promise<void>;
      onRemoteCommand: (listener: (command: RemoteCommand) => void) => () => void;
      // Local copy of the library (liked songs and playlists), off by default.
      getCacheStatus: () => Promise<MetadataCacheStatus>;
      setCacheEnabled: (isEnabled: boolean) => Promise<MetadataCacheStatus>;
      refreshCache: () => Promise<MetadataCacheStatus>;
      searchCache: (query: string) => Promise<CachedSearchResult[]>;
      getCacheMemberships: (trackIds: string[]) => Promise<Record<string, TrackCollectionMembership>>;
      onCacheStatus: (listener: (status: MetadataCacheStatus) => void) => () => void;
      // Playback engine (TIDAL's web player in a hidden window).
      playerPlay: (trackId: string) => Promise<EnginePlayResult>;
      playerSetNext: (trackId: string | null) => Promise<boolean>;
      playerPause: () => Promise<boolean>;
      playerResume: () => Promise<boolean>;
      playerSeek: (seconds: number) => Promise<boolean>;
      playerSetVolume: (level: number) => Promise<boolean>;
      playerStop: () => Promise<boolean>;
      onPlayerState: (listener: (snapshot: EngineSnapshot) => void) => () => void;
      // Next / previous media keys, which the page of the engine receives.
      onPlayerMediaKey: (listener: (command: "next" | "previous") => void) => () => void;
      webLogin: () => Promise<{ success: boolean; error?: string }>;
      webLogout: () => Promise<{ success: boolean }>;
      isWebSessionConnected: () => Promise<boolean>;
    };
  }
}

export {};