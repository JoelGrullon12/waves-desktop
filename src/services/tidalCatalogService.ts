import type {
  FavoriteTracksPage,
  LikedTrackIdsPage,
  Track,
  TrackPage,
} from "@/types/track";
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

// All catalog data crosses the IPC boundary, so every call follows the Result
// pattern agreed in AGENTS.md. Errors raised by the main process handlers
// contain a human readable message already.
export type Result<T> = { success: true; data: T } | { success: false; error: string };

// Electron wraps a main-process error as "Error invoking remote method '…':
// Error: <message>"; only the message is worth showing.
function readableError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, "");
}

async function asResult<Data>(call: () => Promise<Data>): Promise<Result<Data>> {
  try {
    return { success: true, data: await call() };
  } catch (error) {
    return { success: false, error: readableError(error) };
  }
}

export class TidalCatalogService {
  async searchTracks(query: string): Promise<Result<Track[]>> {
    try {
      const data = await window.api.searchTracks(query);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
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
      return { success: false, error: readableError(error) };
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
      return { success: false, error: readableError(error) };
    }
  }

  async getFavoriteTracksPage(cursor: string | null): Promise<Result<FavoriteTracksPage>> {
    try {
      const data = await window.api.getFavoriteTracksPage(cursor);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async getLikedTrackIdsPage(cursor: string | null): Promise<Result<LikedTrackIdsPage>> {
    try {
      const data = await window.api.getLikedTrackIdsPage(cursor);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async getTracksByIds(trackIds: string[]): Promise<Result<Track[]>> {
    try {
      const data = await window.api.getTracksByIds(trackIds);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async getUserPlaylists(): Promise<Result<PlaylistSummary[]>> {
    try {
      const data = await window.api.getUserPlaylists();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async getRecentAlbums(): Promise<Result<AlbumSummary[]>> {
    try {
      const data = await window.api.getRecentAlbums();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async getMixes(relationship: MixRelationName): Promise<Result<MixSummary[]>> {
    try {
      const data = await window.api.getMixes(relationship);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
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
      return { success: false, error: readableError(error) };
    }
  }

  async getAlbumDetail(albumId: string): Promise<Result<AlbumDetail>> {
    try {
      const data = await window.api.getAlbumDetail(albumId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async getPlaylistDetail(playlistId: string): Promise<Result<PlaylistDetail>> {
    try {
      const data = await window.api.getPlaylistDetail(playlistId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async getMixDetail(mixType: string, mixId: string): Promise<Result<MixSummary>> {
    try {
      const data = await window.api.getMixDetail(mixType, mixId);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async addTracksToLikes(trackIds: string[]): Promise<Result<void>> {
    try {
      await window.api.addTracksToLikes(trackIds);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async removeTracksFromLikes(trackIds: string[]): Promise<Result<void>> {
    try {
      await window.api.removeTracksFromLikes(trackIds);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<Result<void>> {
    try {
      await window.api.addTracksToPlaylist(playlistId, trackIds);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async createPlaylist(name: string): Promise<Result<PlaylistSummary>> {
    try {
      const data = await window.api.createPlaylist(name);
      return { success: true, data };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  async deletePlaylist(playlistId: string): Promise<Result<void>> {
    try {
      await window.api.deletePlaylist(playlistId);
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: readableError(error) };
    }
  }

  getReleasesFeed(): Promise<Result<AlbumSummary[]>> {
    return asResult(() => window.api.getReleasesFeed());
  }

  getArtistDetail(artistId: string): Promise<Result<ArtistCard>> {
    return asResult(() => window.api.getArtistDetail(artistId));
  }

  getArtistTracksPage(artistId: string, cursor: string | null): Promise<Result<TrackPage>> {
    return asResult(() => window.api.getArtistTracksPage(artistId, cursor));
  }

  getArtistAlbumsPage(artistId: string, cursor: string | null): Promise<Result<AlbumPage>> {
    return asResult(() => window.api.getArtistAlbumsPage(artistId, cursor));
  }

  getCollectionAlbumsPage(cursor: string | null): Promise<Result<AlbumPage>> {
    return asResult(() => window.api.getCollectionAlbumsPage(cursor));
  }

  getCollectionArtistsPage(cursor: string | null): Promise<Result<ArtistPage>> {
    return asResult(() => window.api.getCollectionArtistsPage(cursor));
  }

  searchCollections(query: string): Promise<Result<SearchResults>> {
    return asResult(() => window.api.searchCollections(query));
  }
}

export const tidalCatalogService = new TidalCatalogService();
