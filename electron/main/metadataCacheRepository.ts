import type { DatabaseSync } from "node:sqlite";
import { searchTerms, trackMatchesTerms } from "../../src/lib/textSearch";
import type { Track } from "./tidalParsers";

// Local copy of the reference data of the user's library: which tracks are in
// the liked songs and in each playlist, with their titles, artists, albums and
// artwork addresses. It lets lists open without waiting for TIDAL and makes
// "which playlists is this track in" answerable at all.
//
// Only reference data is kept. Nothing about streams or licences is stored;
// playback always asks TIDAL.

// Must match the id catalog.ts asks for when it serves the liked songs.
export const LIKED_COLLECTION_ID = "liked";

export interface CachedPlaylistReference {
  id: string;
  title: string;
}

export interface CachedSearchResult {
  track: Track;
  isLiked: boolean;
  playlists: CachedPlaylistReference[];
}

export interface CacheSummary {
  trackCount: number;
  playlistCount: number;
  likedTrackCount: number;
  // When the oldest collection was last refreshed; null for an empty cache.
  refreshedAt: string | null;
}

interface CollectionRow {
  collection_id: string;
  kind: string;
  title: string;
}

export class MetadataCacheRepository {
  // Parsed tracks, loaded on first search and dropped on every write.
  private tracksById: Map<string, Track> | null = null;

  constructor(private readonly databaseConnection: DatabaseSync) {}

  // Replaces one collection (the liked songs or a playlist) with `tracks`, in
  // order.
  replaceCollection(collectionId: string, kind: "liked" | "playlist", title: string, tracks: Track[]): void {
    const upsertTrack = this.databaseConnection.prepare(
      `INSERT INTO cached_tracks (track_id, payload) VALUES (?, ?)
       ON CONFLICT(track_id) DO UPDATE SET payload = excluded.payload`,
    );
    const insertItem = this.databaseConnection.prepare(
      "INSERT INTO cached_collection_items (collection_id, position, track_id) VALUES (?, ?, ?)",
    );
    this.inTransaction(() => {
      this.databaseConnection
        .prepare(
          `INSERT INTO cached_collections (collection_id, kind, title, refreshed_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(collection_id) DO UPDATE SET
             kind = excluded.kind, title = excluded.title, refreshed_at = excluded.refreshed_at`,
        )
        .run(collectionId, kind, title, new Date().toISOString());
      this.databaseConnection
        .prepare("DELETE FROM cached_collection_items WHERE collection_id = ?")
        .run(collectionId);
      tracks.forEach((track, position) => {
        upsertTrack.run(track.id, JSON.stringify(track));
        insertItem.run(collectionId, position, track.id);
      });
    });
  }

  // Drops the playlists that are no longer in the user's library, then the
  // tracks nothing refers to any more.
  keepOnlyCollections(collectionIds: string[]): void {
    const keep = new Set(collectionIds);
    const stale = this.collections().filter((collection) => !keep.has(collection.collection_id));
    this.inTransaction(() => {
      for (const collection of stale) this.deleteCollection(collection.collection_id);
      this.databaseConnection.exec(
        `DELETE FROM cached_tracks WHERE track_id NOT IN
           (SELECT track_id FROM cached_collection_items)`,
      );
    });
  }

  removeCollection(collectionId: string): void {
    this.inTransaction(() => this.deleteCollection(collectionId));
  }

  renameCollection(collectionId: string, title: string): void {
    this.databaseConnection
      .prepare("UPDATE cached_collections SET title = ? WHERE collection_id = ?")
      .run(title, collectionId);
  }

  // null when the collection was never cached (so the caller asks TIDAL).
  collectionTracks(collectionId: string): Track[] | null {
    const exists = this.databaseConnection
      .prepare("SELECT 1 FROM cached_collections WHERE collection_id = ?")
      .get(collectionId);
    if (!exists) return null;
    const rows = this.databaseConnection
      .prepare(
        `SELECT cached_tracks.payload FROM cached_collection_items
         JOIN cached_tracks ON cached_tracks.track_id = cached_collection_items.track_id
         WHERE cached_collection_items.collection_id = ?
         ORDER BY cached_collection_items.position`,
      )
      .all(collectionId) as unknown as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as Track);
  }

  // Newly liked tracks go first (the list is newest first); a playlist grows
  // at its end.
  addTracks(collectionId: string, tracks: Track[], where: "start" | "end"): void {
    const current = this.collectionTracks(collectionId);
    if (current === null) return;
    const addedIds = new Set(tracks.map((track) => track.id));
    const kept = where === "start" ? current.filter((track) => !addedIds.has(track.id)) : current;
    const collection = this.collection(collectionId);
    if (!collection) return;
    this.replaceCollection(
      collectionId,
      collection.kind === "liked" ? "liked" : "playlist",
      collection.title,
      where === "start" ? [...tracks, ...kept] : [...kept, ...tracks],
    );
  }

  removeTracks(collectionId: string, trackIds: string[]): void {
    const current = this.collectionTracks(collectionId);
    const collection = this.collection(collectionId);
    if (current === null || !collection) return;
    const removed = new Set(trackIds);
    this.replaceCollection(
      collectionId,
      collection.kind === "liked" ? "liked" : "playlist",
      collection.title,
      current.filter((track) => !removed.has(track.id)),
    );
  }

  // For each track, the playlists it is in.
  playlistsContaining(trackIds: string[]): Map<string, CachedPlaylistReference[]> {
    const wanted = new Set(trackIds);
    const byTrack = new Map<string, CachedPlaylistReference[]>();
    for (const row of this.playlistMemberships()) {
      if (!wanted.has(row.track_id)) continue;
      const playlists = byTrack.get(row.track_id) ?? [];
      // A track can be in the same playlist more than once.
      if (!playlists.some((playlist) => playlist.id === row.collection_id)) {
        playlists.push({ id: row.collection_id, title: row.title });
      }
      byTrack.set(row.track_id, playlists);
    }
    return byTrack;
  }

  // Tracks of the whole library (liked songs and playlists) matching every
  // word of the query, liked songs first.
  search(query: string, limit: number): CachedSearchResult[] {
    const terms = searchTerms(query);
    if (terms.length === 0) return [];
    const likedIds = new Set(
      (
        this.databaseConnection
          .prepare("SELECT track_id FROM cached_collection_items WHERE collection_id = ?")
          .all(LIKED_COLLECTION_ID) as unknown as Array<{ track_id: string }>
      ).map((row) => row.track_id),
    );
    const matches = [...this.allTracks().values()].filter((track) => trackMatchesTerms(track, terms));
    matches.sort((left, right) => Number(likedIds.has(right.id)) - Number(likedIds.has(left.id)));
    const limited = matches.slice(0, limit);
    const playlists = this.playlistsContaining(limited.map((track) => track.id));
    return limited.map((track) => ({
      track,
      isLiked: likedIds.has(track.id),
      playlists: playlists.get(track.id) ?? [],
    }));
  }

  summary(): CacheSummary {
    const count = (sql: string): number =>
      (this.databaseConnection.prepare(sql).get() as { total: number }).total;
    const oldest = this.databaseConnection
      .prepare("SELECT MIN(refreshed_at) AS oldest FROM cached_collections")
      .get() as { oldest: string | null };
    return {
      trackCount: count("SELECT COUNT(*) AS total FROM cached_tracks"),
      playlistCount: count("SELECT COUNT(*) AS total FROM cached_collections WHERE kind = 'playlist'"),
      likedTrackCount: count(
        `SELECT COUNT(*) AS total FROM cached_collection_items WHERE collection_id = '${LIKED_COLLECTION_ID}'`,
      ),
      refreshedAt: oldest.oldest,
    };
  }

  clear(): void {
    this.inTransaction(() => {
      this.databaseConnection.exec(
        "DELETE FROM cached_collection_items; DELETE FROM cached_collections; DELETE FROM cached_tracks;",
      );
    });
  }

  private collections(): CollectionRow[] {
    return this.databaseConnection
      .prepare("SELECT collection_id, kind, title FROM cached_collections")
      .all() as unknown as CollectionRow[];
  }

  private collection(collectionId: string): CollectionRow | undefined {
    return this.collections().find((row) => row.collection_id === collectionId);
  }

  private deleteCollection(collectionId: string): void {
    this.databaseConnection
      .prepare("DELETE FROM cached_collection_items WHERE collection_id = ?")
      .run(collectionId);
    this.databaseConnection
      .prepare("DELETE FROM cached_collections WHERE collection_id = ?")
      .run(collectionId);
  }

  private playlistMemberships(): Array<{ track_id: string; collection_id: string; title: string }> {
    return this.databaseConnection
      .prepare(
        `SELECT cached_collection_items.track_id, cached_collections.collection_id, cached_collections.title
         FROM cached_collection_items
         JOIN cached_collections ON cached_collections.collection_id = cached_collection_items.collection_id
         WHERE cached_collections.kind = 'playlist'
         ORDER BY cached_collections.title`,
      )
      .all() as unknown as Array<{ track_id: string; collection_id: string; title: string }>;
  }

  private allTracks(): Map<string, Track> {
    if (!this.tracksById) {
      const rows = this.databaseConnection
        .prepare("SELECT track_id, payload FROM cached_tracks")
        .all() as unknown as Array<{ track_id: string; payload: string }>;
      this.tracksById = new Map(rows.map((row) => [row.track_id, JSON.parse(row.payload) as Track]));
    }
    return this.tracksById;
  }

  private inTransaction(work: () => void): void {
    this.tracksById = null;
    this.databaseConnection.exec("BEGIN");
    try {
      work();
      this.databaseConnection.exec("COMMIT");
    } catch (error) {
      this.databaseConnection.exec("ROLLBACK");
      throw error;
    }
  }
}
