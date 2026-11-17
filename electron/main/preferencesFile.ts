import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { parseIni, serializeIni } from "./iniFile";

// Small key/value settings (volume, shuffle, repeat, thresholds, sort orders...)
// kept in a plain `settings.ini`, so they can be read and edited by hand.
// Values are stored as text; the renderer owns their meaning and parsing, and
// falls back to a default for any value it can not read.

export const SETTINGS_FILE = "settings.ini";

const HEADER_LINES = [
  "Waves settings. The app rewrites this file when a setting changes in it.",
  "Edit it while Waves is closed; a value it can not read falls back to its default.",
];

export class PreferencesFile {
  private values: Record<string, string> | null = null;

  constructor(private readonly filePath: string) {}

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  getAll(): Record<string, string> {
    return { ...this.load() };
  }

  get(key: string): string | null {
    return this.load()[key] ?? null;
  }

  set(key: string, value: string): void {
    const values = this.load();
    if (values[key] === value) return;
    values[key] = value;
    this.write(values);
  }

  setMany(entries: Record<string, string>): void {
    const values = this.load();
    Object.assign(values, entries);
    this.write(values);
  }

  delete(key: string): void {
    const values = this.load();
    if (!(key in values)) return;
    delete values[key];
    this.write(values);
  }

  private load(): Record<string, string> {
    if (this.values) return this.values;
    try {
      this.values = parseIni(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      // Missing or unreadable: start from the defaults.
      this.values = {};
    }
    return this.values;
  }

  // Written to a temporary file first and renamed, so a crash mid-write never
  // leaves a half-written settings file.
  private write(values: Record<string, string>): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, serializeIni(values, HEADER_LINES), "utf8");
    fs.renameSync(temporaryPath, this.filePath);
  }
}

// Earlier versions kept the settings in the `user_preferences` table. They are
// moved into the file once, when the file does not exist yet, and the rows are
// removed so a deleted settings file means "back to defaults".
// `excludedKeys` are values that now live elsewhere (secrets).
export function importDatabasePreferences(
  databaseConnection: DatabaseSync,
  preferences: PreferencesFile,
  excludedKeys: ReadonlySet<string> = new Set(),
): Record<string, string> {
  const rows = databaseConnection
    .prepare("SELECT preference_key, preference_value FROM user_preferences")
    .all() as Array<{ preference_key: string; preference_value: string }>;
  const imported = Object.fromEntries(rows.map((row) => [row.preference_key, row.preference_value]));
  const kept = Object.fromEntries(
    Object.entries(imported).filter(([key]) => !excludedKeys.has(key)),
  );
  if (!preferences.exists() && Object.keys(kept).length > 0) preferences.setMany(kept);
  databaseConnection.exec("DELETE FROM user_preferences");
  return imported;
}
