import { invoke } from "@tauri-apps/api/core";
import type { Track } from "@/types/track";

// All catalog data crosses the IPC boundary, so every call follows the Result
// pattern agreed in AGENTS.md. Errors surfaced by the Rust commands contain a
// human readable message already.
export type Result<T> = { success: true; data: T } | { success: false; error: string };

export class TidalCatalogService {
  async searchTracks(query: string): Promise<Result<Track[]>> {
    try {
      const data = await invoke<Track[]>("cmd_search_tracks", { query });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getAlbumTracks(albumId: string): Promise<Result<Track[]>> {
    try {
      const data = await invoke<Track[]>("cmd_get_album_tracks", { albumId });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<Result<Track[]>> {
    try {
      const data = await invoke<Track[]>("cmd_get_playlist_tracks", { playlistId });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

export const tidalCatalogService = new TidalCatalogService();