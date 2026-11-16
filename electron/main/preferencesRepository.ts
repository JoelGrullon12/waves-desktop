import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "./database";
import { handleTrusted } from "./secureIpc";
import { requirePreferenceKey, requirePreferenceValue, requireResourceIdList } from "./validation";

// Small key/value settings (volume, shuffle, repeat, thresholds...). Values are
// stored as text; the renderer owns their meaning and serialization.
export class PreferencesRepository {
  constructor(private readonly databaseConnection: DatabaseSync) {}

  getAll(): Record<string, string> {
    const rows = this.databaseConnection
      .prepare("SELECT preference_key, preference_value FROM user_preferences")
      .all() as Array<{ preference_key: string; preference_value: string }>;
    return Object.fromEntries(rows.map((row) => [row.preference_key, row.preference_value]));
  }

  get(key: string): string | null {
    const row = this.databaseConnection
      .prepare("SELECT preference_value FROM user_preferences WHERE preference_key = ?")
      .get(key) as { preference_value: string } | undefined;
    return row?.preference_value ?? null;
  }

  set(key: string, value: string): void {
    this.databaseConnection
      .prepare(
        `INSERT INTO user_preferences (preference_key, preference_value) VALUES (?, ?)
         ON CONFLICT(preference_key) DO UPDATE SET preference_value = excluded.preference_value`,
      )
      .run(key, value);
  }
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
  const preferences = new PreferencesRepository(getDatabase());
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
