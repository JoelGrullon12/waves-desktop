import type { FavoriteTracksPage, LikedTrackIdsPage, Track, TrackPage } from "@/types/track";
import type {
  AlbumDetail,
  AlbumSummary,
  MixRelationName,
  MixSummary,
  PlaylistDetail,
  PlaylistSummary,
} from "@/types/media";

declare global {
  interface Window {
    api: {
      login: () => Promise<{ isAuthenticated: boolean; userId: string | null }>;
      logout: () => Promise<{ isAuthenticated: boolean }>;
      isAuthenticated: () => Promise<boolean>;
      getSessionCredentials: () => Promise<{
        access_token: string;
        client_id: string;
        user_id: string | null;
      } | null>;
      getAccessToken: () => Promise<string | null>;
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
      webLogin: () => Promise<{
        success: boolean;
        pending: boolean;
        authorizeUrl?: string;
        error?: string;
      }>;
      completeWebLogin: (
        pasted: string,
      ) => Promise<{ success: boolean; error?: string }>;
      webLogout: () => Promise<{ success: boolean }>;
      isWebSessionConnected: () => Promise<boolean>;
      getWebSessionCredentials: () => Promise<{
        client_id: string;
        access_token: string;
        user_id: string | null;
      } | null>;
      getWebPlaybackStream: (trackId: string) => Promise<string>;
    };
  }
}

export {};