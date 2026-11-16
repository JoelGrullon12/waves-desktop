import type {
  FavoriteTracksPage,
  LikedTrackIdsPage,
  Track,
  TrackPage,
} from "@/types/track";
import type {
  AlbumDetail,
  AlbumSummary,
  MixRelationName,
  MixSummary,
  PlaylistDetail,
  PlaylistSummary,
} from "@/types/media";

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

  async getAlbumTracksPage(
    albumId: string,
    cursor: string | null,
  ): Promise<Result<TrackPage>> {
    try {
      const data = await window.api.getAlbumTracksPage(albumId, cursor);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getPlaylistTracksPage(
    playlistId: string,
    cursor: string | null,
  ): Promise<Result<TrackPage>> {
    try {
      const data = await window.api.getPlaylistTracksPage(playlistId, cursor);
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

  async getLikedTrackIdsPage(cursor: string | null): Promise<Result<LikedTrackIdsPage>> {
    try {
      const data = await window.api.getLikedTrackIdsPage(cursor);
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

  async getUserPlaylists(): Promise<Result<PlaylistSummary[]>> {
    try {
      const data = await window.api.getUserPlaylists();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getRecentAlbums(): Promise<Result<AlbumSummary[]>> {
    try {
      const data = await window.api.getRecentAlbums();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getMixes(relationship: MixRelationName): Promise<Result<MixSummary[]>> {
    try {
      const data = await window.api.getMixes(relationship);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getMixTracksPage(
    mixType: string,
    mixId: string,
    cursor: string | null,
  ): Promise<Result<TrackPage>> {
    try {
      const data = await window.api.getMixTracksPage(mixType, mixId, cursor);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getAlbumDetail(albumId: string): Promise<Result<AlbumDetail>> {
    try {
      const data = await window.api.getAlbumDetail(albumId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getPlaylistDetail(playlistId: string): Promise<Result<PlaylistDetail>> {
    try {
      const data = await window.api.getPlaylistDetail(playlistId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async getMixDetail(mixType: string, mixId: string): Promise<Result<MixSummary>> {
    try {
      const data = await window.api.getMixDetail(mixType, mixId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async addTracksToLikes(trackIds: string[]): Promise<Result<void>> {
    try {
      await window.api.addTracksToLikes(trackIds);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async removeTracksFromLikes(trackIds: string[]): Promise<Result<void>> {
    try {
      await window.api.removeTracksFromLikes(trackIds);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<Result<void>> {
    try {
      await window.api.addTracksToPlaylist(playlistId, trackIds);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async createPlaylist(name: string): Promise<Result<PlaylistSummary>> {
    try {
      const data = await window.api.createPlaylist(name);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async deletePlaylist(playlistId: string): Promise<Result<void>> {
    try {
      await window.api.deletePlaylist(playlistId);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

export const tidalCatalogService = new TidalCatalogService();
