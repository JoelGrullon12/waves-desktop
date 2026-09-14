import type { Track } from "@/types/track";

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
    };
  }
}

export {};