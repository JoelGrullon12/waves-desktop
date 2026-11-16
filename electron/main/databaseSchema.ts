// Kept apart from database.ts (which needs Electron's `app`) so repositories
// can be unit-tested against an in-memory database with the real schema.
export const DATABASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS track_plays (
    track_id        TEXT PRIMARY KEY,
    play_count      INTEGER NOT NULL DEFAULT 0,
    last_played_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    preference_key   TEXT PRIMARY KEY,
    preference_value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS queued_tracks (
    position    INTEGER PRIMARY KEY,
    track_id    TEXT NOT NULL,
    added_at    TEXT NOT NULL
  );

  -- Local copy of the library's reference data (see metadataCacheRepository.ts).
  CREATE TABLE IF NOT EXISTS cached_tracks (
    track_id  TEXT PRIMARY KEY,
    payload   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_collections (
    collection_id  TEXT PRIMARY KEY,
    kind           TEXT NOT NULL,
    title          TEXT NOT NULL,
    refreshed_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cached_collection_items (
    collection_id  TEXT NOT NULL,
    position       INTEGER NOT NULL,
    track_id       TEXT NOT NULL,
    PRIMARY KEY (collection_id, position)
  );

  CREATE INDEX IF NOT EXISTS cached_collection_items_by_track
    ON cached_collection_items (track_id);
`;

interface MigratableDatabase {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[] };
}

// Changes to tables that already exist on the user's disk. Each step checks
// whether it is needed, so running it on every start is safe.
export function migrateDatabase(databaseConnection: MigratableDatabase): void {
  const trackPlayColumns = databaseConnection
    .prepare("PRAGMA table_info(track_plays)")
    .all() as Array<{ name: string }>;
  if (!trackPlayColumns.some((column) => column.name === "baseline_count")) {
    // Level a track enters smart shuffle at (see playCountRepository.ts).
    databaseConnection.exec(
      "ALTER TABLE track_plays ADD COLUMN baseline_count INTEGER NOT NULL DEFAULT 0",
    );
  }
}
