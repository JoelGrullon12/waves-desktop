import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { dataDirectory } from "./appDataLocation";
import { DATABASE_SCHEMA, migrateDatabase } from "./databaseSchema";

// node:sqlite (DatabaseSync) ships inside Electron's own Node runtime, so there
// is nothing native to rebuild against the Castlabs fork's V8 ABI. It is the
// drop-in synchronous SQLite module with zero native build risk.

export const DATABASE_FILE = "waves-desktop.db";
// SQLite's side files, which must move together with the database.
export const DATABASE_FILES = [DATABASE_FILE, `${DATABASE_FILE}-wal`, `${DATABASE_FILE}-shm`, `${DATABASE_FILE}-journal`];

let databaseConnection: DatabaseSync | null = null;

export function initializeDatabase(): void {
  const databasePath =
    (process.env.LOCAL_SQLITE_PATH ?? "") ||
    path.join(dataDirectory(), DATABASE_FILE);

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  databaseConnection = new DatabaseSync(databasePath);
  try {
    fs.chmodSync(databasePath, 0o600);
  } catch {
    // Not a regular file (e.g. ":memory:") or a platform without POSIX modes.
  }
  databaseConnection.exec(DATABASE_SCHEMA);
  migrateDatabase(databaseConnection);
}

// Before the data folder moves.
export function closeDatabase(): void {
  databaseConnection?.close();
  databaseConnection = null;
}

// Whether the database lives in the data folder (and so moves with it), or
// LOCAL_SQLITE_PATH points somewhere else.
export function isDatabaseInDataDirectory(): boolean {
  return !(process.env.LOCAL_SQLITE_PATH ?? "");
}

export function getDatabase(): DatabaseSync {
  if (!databaseConnection) throw new Error("Database not initialized yet");
  return databaseConnection;
}
