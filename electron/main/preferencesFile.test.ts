import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA } from "./databaseSchema";
import { importDatabasePreferences, PreferencesFile } from "./preferencesFile";

let directory: string;
let filePath: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "waves-preferences-"));
  filePath = path.join(directory, "settings.ini");
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

describe("PreferencesFile", () => {
  it("returns nothing before anything is saved", () => {
    const preferences = new PreferencesFile(filePath);
    expect(preferences.exists()).toBe(false);
    expect(preferences.getAll()).toEqual({});
    expect(preferences.get("player.volume")).toBeNull();
  });

  it("stores values, overwrites them by key and writes a readable file", () => {
    const preferences = new PreferencesFile(filePath);
    preferences.set("player.volume", "80");
    preferences.set("player.repeat", "all");
    preferences.set("player.volume", "35");
    expect(preferences.getAll()).toEqual({ "player.volume": "35", "player.repeat": "all" });
    const text = fs.readFileSync(filePath, "utf8");
    expect(text).toContain("[player]\nrepeat = all\nvolume = 35\n");
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it("reads what an earlier instance wrote, including hand edits", () => {
    new PreferencesFile(filePath).set("ui.theme", "dark");
    fs.appendFileSync(filePath, "\n[stats]\nplayThresholdSeconds = 45\n");
    const reopened = new PreferencesFile(filePath);
    expect(reopened.getAll()).toEqual({ "ui.theme": "dark", "stats.playThresholdSeconds": "45" });
  });

  it("deletes a key", () => {
    const preferences = new PreferencesFile(filePath);
    preferences.setMany({ "a.one": "1", "a.two": "2" });
    preferences.delete("a.one");
    expect(new PreferencesFile(filePath).getAll()).toEqual({ "a.two": "2" });
  });
});

describe("importDatabasePreferences", () => {
  let databaseConnection: DatabaseSync;

  beforeEach(() => {
    databaseConnection = new DatabaseSync(":memory:");
    databaseConnection.exec(DATABASE_SCHEMA);
    const insert = databaseConnection.prepare(
      "INSERT INTO user_preferences (preference_key, preference_value) VALUES (?, ?)",
    );
    insert.run("player.volume", "70");
    insert.run("remote.pairingToken", "secret");
  });

  it("moves the rows into a new file, leaving out the excluded keys", () => {
    const preferences = new PreferencesFile(filePath);
    const imported = importDatabasePreferences(databaseConnection, preferences, new Set(["remote.pairingToken"]));
    expect(imported).toEqual({ "player.volume": "70", "remote.pairingToken": "secret" });
    expect(new PreferencesFile(filePath).getAll()).toEqual({ "player.volume": "70" });
    const remaining = databaseConnection.prepare("SELECT COUNT(*) AS total FROM user_preferences").get() as {
      total: number;
    };
    expect(remaining.total).toBe(0);
  });

  it("never overwrites an existing file", () => {
    const preferences = new PreferencesFile(filePath);
    preferences.set("player.volume", "20");
    importDatabasePreferences(databaseConnection, preferences);
    expect(new PreferencesFile(filePath).get("player.volume")).toBe("20");
  });
});
