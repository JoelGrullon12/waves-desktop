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
`;
