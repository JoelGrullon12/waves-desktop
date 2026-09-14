import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { app } from "electron";

// node:sqlite (DatabaseSync) ships inside Electron's own Node runtime, so there
// is nothing native to rebuild against the Castlabs fork's V8 ABI. It is the
// drop-in synchronous SQLite module with zero native build risk.

let databaseConnection: DatabaseSync | null = null;

export function initializeDatabase(): void {
  const databasePath =
    (process.env.LOCAL_SQLITE_PATH ?? "") ||
    path.join(app.getPath("userData"), "waves-desktop.db");

  databaseConnection = new DatabaseSync(databasePath);
  databaseConnection.exec(`
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
  `);
}

export function getDatabase(): DatabaseSync {
  if (!databaseConnection) throw new Error("Database not initialized yet");
  return databaseConnection;
}
