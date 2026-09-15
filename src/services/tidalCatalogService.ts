import type { FavoriteTracksPage, Track } from "@/types/track";

// All catalog data crosses the IPC boundary, so every call follows the Result
// pattern agreed in AGENTS.md. Errors raised by the main process handlers
// contain a human readable message already.
export type Result<T> = { success: true; data: T } | { success: false; error: string };

export class TidalCatalogService {
  async searchTracks(query: string): Promise<Result<Track[]>> {
    try {
      const data = await window.api.searchTracks(query);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getAlbumTracks(albumId: string): Promise<Result<Track[]>> {
    try {
      const data = await window.api.getAlbumTracks(albumId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<Result<Track[]>> {
    try {
      const data = await window.api.getPlaylistTracks(playlistId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getFavoriteTracksPage(cursor: string | null): Promise<Result<FavoriteTracksPage>> {
    try {
      const data = await window.api.getFavoriteTracksPage(cursor);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getTracksByIds(trackIds: string[]): Promise<Result<Track[]>> {
    try {
      const data = await window.api.getTracksByIds(trackIds);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

export const tidalCatalogService = new TidalCatalogService();