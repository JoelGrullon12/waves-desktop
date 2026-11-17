import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { dataDirectory } from "./appDataLocation";
import { migrateLegacySecrets } from "./appSecrets";
import { getDatabase } from "./database";
import { importDatabasePreferences, PreferencesFile, SETTINGS_FILE } from "./preferencesFile";
import { handleTrusted } from "./secureIpc";
import { requirePreferenceKey, requirePreferenceValue, requireResourceIdList } from "./validation";

let preferencesFile: PreferencesFile | null = null;

// The settings file in the data folder (see preferencesFile.ts).
export function getPreferences(): PreferencesFile {
  preferencesFile ??= new PreferencesFile(path.join(dataDirectory(), SETTINGS_FILE));
  return preferencesFile;
}

// Kept out of settings.ini: the phone remote's pairing token is a secret.
const LEGACY_REMOTE_TOKEN_KEY = "remote.pairingToken";

// Startup step, after the database is open: moves the settings and secrets of
// earlier versions to where they live now.
export function initializePreferences(): void {
  const imported = importDatabasePreferences(
    getDatabase(),
    getPreferences(),
    new Set([LEGACY_REMOTE_TOKEN_KEY]),
  );
  migrateLegacySecrets(imported[LEGACY_REMOTE_TOKEN_KEY] ?? null);
}

// The play queue as it was when the app closed, so playback can pick up where
// it left off. Only track ids are kept; their metadata is fetched again.
export class QueueRepository {
  constructor(private readonly databaseConnection: DatabaseSync) {}

  save(trackIds: string[]): void {
    const addedAt = new Date().toISOString();
    this.databaseConnection.exec("BEGIN");
    try {
      this.databaseConnection.exec("DELETE FROM queued_tracks");
      const insert = this.databaseConnection.prepare(
        "INSERT INTO queued_tracks (position, track_id, added_at) VALUES (?, ?, ?)",
      );
      trackIds.forEach((trackId, position) => insert.run(position, trackId, addedAt));
      this.databaseConnection.exec("COMMIT");
    } catch (error) {
      this.databaseConnection.exec("ROLLBACK");
      throw error;
    }
  }

  load(): string[] {
    const rows = this.databaseConnection
      .prepare("SELECT track_id FROM queued_tracks ORDER BY position")
      .all() as Array<{ track_id: string }>;
    return rows.map((row) => row.track_id);
  }
}

export function registerPreferencesHandlers(): void {
  const preferences = getPreferences();
  const queue = new QueueRepository(getDatabase());

  handleTrusted("preferences:get-all", () => preferences.getAll());
  handleTrusted("preferences:set", (_event, key, value) =>
    preferences.set(requirePreferenceKey(key), requirePreferenceValue(value)),
  );
  handleTrusted("queue:save", (_event, trackIds) =>
    queue.save(requireResourceIdList(trackIds, "track ids")),
  );
  handleTrusted("queue:load", () => queue.load());
}
