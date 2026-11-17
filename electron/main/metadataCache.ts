import type { MetadataCacheStatus, TrackCollectionMembership } from "../../src/types/player";
import {
  getLikedTracksPage,
  getPlaylistTracksPage,
  getTracksByIds,
  getUserPlaylists,
  setLibraryHooks,
  type LibraryChange,
} from "./catalog";
import { getDatabase } from "./database";
import {
  LIKED_COLLECTION_ID,
  MetadataCacheRepository,
  type CachedSearchResult,
} from "./metadataCacheRepository";
import type { PreferencesFile } from "./preferencesFile";
import { getPreferences } from "./preferencesRepository";
import { handleTrusted } from "./secureIpc";
import { sleep } from "./tidalApiClient";
import type { Track } from "./tidalParsers";
import { requireBoolean, requireResourceIdList, requireSearchQuery } from "./validation";

// Keeps the local copy of the library (see metadataCacheRepository.ts) in step
// with TIDAL: one full refresh when the app starts or the user asks, and small
// updates whenever the app itself changes the library.
//
// It is off until the user turns it on in Settings: a full refresh walks every
// playlist, which is a lot of requests for a large library.

export const CACHE_STATUS_CHANNEL = "cache:status";

const ENABLED_PREFERENCE_KEY = "cache.enabled";
// Pause between playlists, on top of the pacing of each page request.
const PLAYLIST_PACING_MS = 300;
const MAX_SEARCH_RESULTS = 300;

type StatusListener = (status: MetadataCacheStatus) => void;

export class MetadataCache {
  private readonly repository: MetadataCacheRepository;
  private readonly preferences: PreferencesFile;
  private readonly listeners = new Set<StatusListener>();
  private isRefreshing = false;
  private progress: string | null = null;
  private lastError: string | null = null;

  constructor() {
    this.repository = new MetadataCacheRepository(getDatabase());
    this.preferences = getPreferences();
  }

  onStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isEnabled(): boolean {
    return this.preferences.get(ENABLED_PREFERENCE_KEY) === "true";
  }

  status(): MetadataCacheStatus {
    return {
      isEnabled: this.isEnabled(),
      isRefreshing: this.isRefreshing,
      progress: this.progress,
      error: this.lastError,
      ...this.repository.summary(),
    };
  }

  setEnabled(isEnabled: boolean): MetadataCacheStatus {
    this.preferences.set(ENABLED_PREFERENCE_KEY, isEnabled ? "true" : "false");
    // Turning it off also empties it, so nothing stale is shown if it is
    // turned on again much later.
    if (!isEnabled) this.repository.clear();
    this.publish();
    if (isEnabled) void this.refresh();
    return this.status();
  }

  // Copies the liked songs and every playlist again. Safe to call while one
  // is already running (the call is ignored).
  async refresh(): Promise<void> {
    if (this.isRefreshing || !this.isEnabled()) return;
    this.isRefreshing = true;
    this.lastError = null;
    try {
      this.report("Liked songs");
      this.repository.replaceCollection(LIKED_COLLECTION_ID, "liked", "Liked songs", await this.fetchLikedTracks());

      const playlists = await getUserPlaylists();
      for (const [index, playlist] of playlists.entries()) {
        if (!this.isEnabled()) return;
        this.report(`Playlist ${index + 1} of ${playlists.length}: ${playlist.title}`);
        await sleep(PLAYLIST_PACING_MS);
        this.repository.replaceCollection(
          playlist.id,
          "playlist",
          playlist.title,
          await this.fetchPlaylistTracks(playlist.id),
        );
      }
      this.repository.keepOnlyCollections([LIKED_COLLECTION_ID, ...playlists.map((playlist) => playlist.id)]);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error(`metadata-cache: refresh failed: ${this.lastError}`);
    } finally {
      this.isRefreshing = false;
      this.progress = null;
      this.publish();
    }
  }

  // The whole list when it is cached and the cache is on; null sends the
  // caller to TIDAL.
  cachedTracks(collectionId: string): Track[] | null {
    if (!this.isEnabled()) return null;
    return this.repository.collectionTracks(collectionId);
  }

  search(query: string): CachedSearchResult[] {
    return this.repository.search(query, MAX_SEARCH_RESULTS);
  }

  memberships(trackIds: string[]): Record<string, TrackCollectionMembership> {
    const playlists = this.repository.playlistsContaining(trackIds);
    return Object.fromEntries(
      trackIds.map((trackId) => [trackId, { playlists: playlists.get(trackId) ?? [] }]),
    );
  }

  // The app changed the library on TIDAL; mirror it so the copy stays right
  // without a full refresh.
  async applyChange(change: LibraryChange): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      if (change.type === "likes-removed") {
        this.repository.removeTracks(LIKED_COLLECTION_ID, change.trackIds);
      } else if (change.type === "playlist-deleted") {
        this.repository.removeCollection(change.playlistId);
      } else if (change.type === "playlist-created") {
        this.repository.replaceCollection(change.playlistId, "playlist", change.title, []);
      } else {
        const tracks = orderLike(change.trackIds, await getTracksByIds(change.trackIds));
        if (change.type === "likes-added") {
          this.repository.addTracks(LIKED_COLLECTION_ID, tracks, "start");
        } else {
          this.repository.addTracks(change.playlistId, tracks, "end");
        }
      }
      this.publish();
    } catch (error) {
      // The next full refresh puts it right.
      console.error(
        `metadata-cache: could not mirror ${change.type}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // The liked songs come without artwork (see AGENTS.md), so every track is
  // fetched again by id for its full data.
  private async fetchLikedTracks(): Promise<Track[]> {
    const slimTracks: Track[] = [];
    let cursor: string | null = null;
    do {
      const page = await getLikedTracksPage(cursor);
      slimTracks.push(...page.tracks);
      cursor = page.nextCursor;
      this.report(`Liked songs (${slimTracks.length})`);
    } while (cursor);
    const fullTracks = await getTracksByIds(slimTracks.map((track) => track.id));
    const fullById = new Map(fullTracks.map((track) => [track.id, track]));
    return slimTracks.map((track) => fullById.get(track.id) ?? track);
  }

  private async fetchPlaylistTracks(playlistId: string): Promise<Track[]> {
    const tracks: Track[] = [];
    let cursor: string | null = null;
    do {
      const page = await getPlaylistTracksPage(playlistId, cursor);
      tracks.push(...page.tracks);
      cursor = page.nextCursor;
    } while (cursor);
    return tracks;
  }

  private report(progress: string): void {
    this.progress = progress;
    this.publish();
  }

  private publish(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }
}

function orderLike(trackIds: string[], tracks: Track[]): Track[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  return trackIds.flatMap((trackId) => byId.get(trackId) ?? []);
}

let metadataCache: MetadataCache | null = null;

export function getMetadataCache(): MetadataCache {
  if (!metadataCache) metadataCache = new MetadataCache();
  return metadataCache;
}

export function registerMetadataCacheHandlers(): void {
  const cache = getMetadataCache();
  setLibraryHooks({
    cachedTracks: (collectionId) => cache.cachedTracks(collectionId),
    onChange: (change) => void cache.applyChange(change),
  });
  handleTrusted("cache:get-status", () => cache.status());
  handleTrusted("cache:set-enabled", (_event, isEnabled) =>
    cache.setEnabled(requireBoolean(isEnabled, "cache switch")),
  );
  handleTrusted("cache:refresh", () => {
    void cache.refresh();
    return cache.status();
  });
  handleTrusted("cache:search", (_event, query) => cache.search(requireSearchQuery(query)));
  handleTrusted("cache:get-memberships", (_event, trackIds) =>
    cache.memberships(requireResourceIdList(trackIds, "track ids")),
  );
}
