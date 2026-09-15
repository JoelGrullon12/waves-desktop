import type { FavoriteTracksPage, Track } from "@/types/track";

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
      getAlbumTracks: (albumId: string) => Promise<Track[]>;
      getPlaylistTracks: (playlistId: string) => Promise<Track[]>;
      getFavoriteTracksPage: (cursor: string | null) => Promise<FavoriteTracksPage>;
      getTracksByIds: (trackIds: string[]) => Promise<Track[]>;
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