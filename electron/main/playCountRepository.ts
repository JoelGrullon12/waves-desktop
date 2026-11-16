import type { DatabaseSync } from "node:sqlite";
import type { PlayedTrack } from "../../src/types/player";
import { getDatabase } from "./database";
import type { PlayRow } from "./playSync";
import { handleTrusted } from "./secureIpc";
import { smartShuffleOrder } from "./smartShuffle";
import { requireNumberInRange, requireResourceId, requireResourceIdList } from "./validation";

// A whole liked library can be shuffled at once.
const MAX_SHUFFLED_TRACKS = 20_000;
const MAX_TOP_PLAYED = 500;
const MAX_STATS_WINDOW_DAYS = 3650;
// SQLite limits the number of `?` in one statement.
const SQL_PARAMETER_BATCH = 500;

// How many times each track was really played, plus the level it entered
// smart shuffle at.
//
// `play_count` only ever counts real plays. `baseline_count` exists because a
// track added to a well-worn playlist would otherwise start at zero and be
// picked first until it caught up with everything else (hundreds of plays).
// The first time a track is seen it gets a baseline (see registerTracks), so
// it joins the rotation at a typical level instead. Smart shuffle orders by
// `play_count + baseline_count`.
export class PlayCountRepository {
  constructor(private readonly databaseConnection: DatabaseSync) {}

  // Median level of the whole library; 0 while it is empty.
  libraryMedianLevel(): number {
    const { total } = this.databaseConnection
      .prepare("SELECT COUNT(*) AS total FROM track_plays")
      .get() as { total: number };
    if (total === 0) return 0;
    const row = this.databaseConnection
      .prepare(
        `SELECT play_count + baseline_count AS level FROM track_plays
         ORDER BY level LIMIT 1 OFFSET ?`,
      )
      .get(Math.floor((total - 1) / 2)) as { level: number };
    return row.level;
  }

  // Called with a whole list about to be shuffled. Tracks of the list not seen
  // before get their baseline: the median level of the tracks of this same
  // list that are already known, so a newcomer to an established playlist
  // joins at the level of its neighbors.
  //
  // When most of the list is new there is no "established" level to join: the
  // list itself is being seen for the first time, and giving it a baseline
  // taken from a handful of known tracks would erase the difference between
  // those (really played) and the rest (never played). Then everything new
  // starts at 0.
  registerTracks(trackIds: string[]): void {
    const uniqueIds = [...new Set(trackIds)];
    const knownLevels = this.shuffleLevels(uniqueIds);
    const newIds = uniqueIds.filter((trackId) => !knownLevels.has(trackId));
    if (newIds.length === 0) return;
    const isEstablishedList = knownLevels.size >= newIds.length;
    const baseline = isEstablishedList ? medianOf([...knownLevels.values()]) : 0;
    this.insertTracks(newIds, baseline);
  }

  private insertTracks(trackIds: string[], baseline: number): void {
    const insert = this.databaseConnection.prepare(
      "INSERT OR IGNORE INTO track_plays (track_id, play_count, baseline_count) VALUES (?, 0, ?)",
    );
    this.databaseConnection.exec("BEGIN");
    try {
      for (const trackId of trackIds) insert.run(trackId, baseline);
      this.databaseConnection.exec("COMMIT");
    } catch (error) {
      this.databaseConnection.exec("ROLLBACK");
      throw error;
    }
  }

  // Counts one real play and returns the track's new play count.
  incrementPlayCount(trackId: string, playedAt: Date = new Date()): number {
    // A track played before it ever appeared in a shuffled list joins at the
    // level of the library as a whole.
    if (!this.shuffleLevels([trackId]).has(trackId)) {
      this.insertTracks([trackId], this.libraryMedianLevel());
    }
    this.databaseConnection
      .prepare(
        "UPDATE track_plays SET play_count = play_count + 1, last_played_at = ? WHERE track_id = ?",
      )
      .run(playedAt.toISOString(), trackId);
    return this.playCounts([trackId]).get(trackId) ?? 0;
  }

  playCounts(trackIds: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    this.forEachRow(trackIds, "track_id, play_count", (row) =>
      counts.set(row["track_id"] as string, row["play_count"] as number),
    );
    return counts;
  }

  shuffleLevels(trackIds: string[]): Map<string, number> {
    const levels = new Map<string, number>();
    this.forEachRow(trackIds, "track_id, play_count + baseline_count AS level", (row) =>
      levels.set(row["track_id"] as string, row["level"] as number),
    );
    return levels;
  }

  // Most played tracks, optionally only those played since `since`.
  topPlayed(limit: number, since: Date | null): PlayedTrack[] {
    const rows = this.databaseConnection
      .prepare(
        `SELECT track_id, play_count, last_played_at FROM track_plays
         WHERE play_count > 0 AND (? IS NULL OR last_played_at >= ?)
         ORDER BY play_count DESC, last_played_at DESC LIMIT ?`,
      )
      .all(since?.toISOString() ?? null, since?.toISOString() ?? null, limit) as Array<{
      track_id: string;
      play_count: number;
      last_played_at: string | null;
    }>;
    return rows.map((row) => ({
      trackId: row.track_id,
      playCount: row.play_count,
      lastPlayedAt: row.last_played_at,
    }));
  }

  // Everything this device knows, for the cloud sync.
  allRows(): PlayRow[] {
    const rows = this.databaseConnection
      .prepare("SELECT track_id, play_count, baseline_count, last_played_at FROM track_plays")
      .all() as unknown as SyncedRowRecord[];
    return rows.map(playRowFromRecord);
  }

  row(trackId: string): PlayRow | null {
    const record = this.databaseConnection
      .prepare(
        "SELECT track_id, play_count, baseline_count, last_played_at FROM track_plays WHERE track_id = ?",
      )
      .get(trackId) as SyncedRowRecord | undefined;
    return record ? playRowFromRecord(record) : null;
  }

  // Writes rows already merged by the sync (see playSync.ts).
  applySyncedRows(rows: PlayRow[]): void {
    if (rows.length === 0) return;
    const upsert = this.databaseConnection.prepare(
      `INSERT INTO track_plays (track_id, play_count, baseline_count, last_played_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(track_id) DO UPDATE SET
         play_count = excluded.play_count,
         last_played_at = excluded.last_played_at`,
    );
    this.databaseConnection.exec("BEGIN");
    try {
      for (const row of rows) {
        upsert.run(row.trackId, row.playCount, row.baselineCount, row.lastPlayedAt);
      }
      this.databaseConnection.exec("COMMIT");
    } catch (error) {
      this.databaseConnection.exec("ROLLBACK");
      throw error;
    }
  }

  // The ids in smart-shuffle order; tracks seen for the first time are
  // registered (and get their baseline) on the way.
  smartShuffle(trackIds: string[]): string[] {
    this.registerTracks(trackIds);
    return smartShuffleOrder(trackIds, this.shuffleLevels(trackIds));
  }

  private forEachRow(
    trackIds: string[],
    columns: string,
    visit: (row: Record<string, unknown>) => void,
  ): void {
    const uniqueIds = [...new Set(trackIds)];
    for (let start = 0; start < uniqueIds.length; start += SQL_PARAMETER_BATCH) {
      const batch = uniqueIds.slice(start, start + SQL_PARAMETER_BATCH);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this.databaseConnection
        .prepare(`SELECT ${columns} FROM track_plays WHERE track_id IN (${placeholders})`)
        .all(...batch) as Array<Record<string, unknown>>;
      rows.forEach(visit);
    }
  }
}

interface SyncedRowRecord {
  track_id: string;
  play_count: number;
  baseline_count: number;
  last_played_at: string | null;
}

function playRowFromRecord(record: SyncedRowRecord): PlayRow {
  return {
    trackId: record.track_id,
    playCount: record.play_count,
    baselineCount: record.baseline_count,
    lastPlayedAt: record.last_played_at,
  };
}

// Lower median, so a list of two levels joins at the lower one.
function medianOf(levels: number[]): number {
  if (levels.length === 0) return 0;
  const sorted = [...levels].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

let playCountRepository: PlayCountRepository | null = null;

export function getPlayCountRepository(): PlayCountRepository {
  playCountRepository ??= new PlayCountRepository(getDatabase());
  return playCountRepository;
}

// Set by the cloud sync, which wants to hear about every counted play.
let onPlayCounted: ((trackId: string) => void) | null = null;

export function setPlayCountedListener(listener: (trackId: string) => void): void {
  onPlayCounted = listener;
}

export function registerStatsHandlers(): void {
  handleTrusted("stats:increment-play-count", (_event, trackId) => {
    const validTrackId = requireResourceId(trackId, "track id");
    const playCount = getPlayCountRepository().incrementPlayCount(validTrackId);
    onPlayCounted?.(validTrackId);
    return playCount;
  });
  handleTrusted("stats:get-smart-shuffle-order", (_event, trackIds) =>
    getPlayCountRepository().smartShuffle(
      requireResourceIdList(trackIds, "track ids", MAX_SHUFFLED_TRACKS),
    ),
  );
  handleTrusted("stats:get-play-counts", (_event, trackIds) =>
    Object.fromEntries(
      getPlayCountRepository().playCounts(
        requireResourceIdList(trackIds, "track ids", MAX_SHUFFLED_TRACKS),
      ),
    ),
  );
  handleTrusted("stats:get-top-played", (_event, limit, withinDays) => {
    const days =
      withinDays == null
        ? null
        : requireNumberInRange(withinDays, "day window", 1, MAX_STATS_WINDOW_DAYS);
    const since = days == null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return getPlayCountRepository().topPlayed(
      requireNumberInRange(limit, "limit", 1, MAX_TOP_PLAYED),
      since,
    );
  });
}
