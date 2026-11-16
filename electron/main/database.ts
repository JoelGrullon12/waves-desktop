import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { DATABASE_SCHEMA, migrateDatabase } from "./databaseSchema";

// node:sqlite (DatabaseSync) ships inside Electron's own Node runtime, so there
// is nothing native to rebuild against the Castlabs fork's V8 ABI. It is the
// drop-in synchronous SQLite module with zero native build risk.

let databaseConnection: DatabaseSync | null = null;

export function initializeDatabase(): void {
  const databasePath =
    (process.env.LOCAL_SQLITE_PATH ?? "") ||
    path.join(app.getPath("userData"), "waves-desktop.db");

  databaseConnection = new DatabaseSync(databasePath);
  try {
    fs.chmodSync(databasePath, 0o600);
  } catch {
    // Not a regular file (e.g. ":memory:") or a platform without POSIX modes.
  }
  databaseConnection.exec(DATABASE_SCHEMA);
  migrateDatabase(databaseConnection);
}

export function getDatabase(): DatabaseSync {
  if (!databaseConnection) throw new Error("Database not initialized yet");
  return databaseConnection;
}
