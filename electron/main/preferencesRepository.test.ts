import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The repositories only need a database connection; the module also registers
// IPC handlers, whose Electron-side imports are not available under Vitest.
vi.mock("./database", () => ({ getDatabase: () => null }));
vi.mock("./secureIpc", () => ({ handleTrusted: () => undefined }));

import { DATABASE_SCHEMA } from "./databaseSchema";
import { PreferencesRepository, QueueRepository } from "./preferencesRepository";

let databaseConnection: DatabaseSync;

beforeEach(() => {
  databaseConnection = new DatabaseSync(":memory:");
  databaseConnection.exec(DATABASE_SCHEMA);
});

describe("PreferencesRepository", () => {
  it("returns nothing for a fresh database", () => {
    const preferences = new PreferencesRepository(databaseConnection);
    expect(preferences.getAll()).toEqual({});
    expect(preferences.get("player.volume")).toBeNull();
  });

  it("stores values and overwrites them by key", () => {
    const preferences = new PreferencesRepository(databaseConnection);
    preferences.set("player.volume", "80");
    preferences.set("player.repeat", "all");
    preferences.set("player.volume", "35");
    expect(preferences.getAll()).toEqual({ "player.volume": "35", "player.repeat": "all" });
    expect(preferences.get("player.volume")).toBe("35");
  });
});

describe("QueueRepository", () => {
  it("keeps the order of the saved queue, duplicates included", () => {
    const queue = new QueueRepository(databaseConnection);
    queue.save(["30", "10", "20", "10"]);
    expect(queue.load()).toEqual(["30", "10", "20", "10"]);
  });

  it("replaces the previous queue on every save", () => {
    const queue = new QueueRepository(databaseConnection);
    queue.save(["1", "2", "3"]);
    queue.save(["9"]);
    expect(queue.load()).toEqual(["9"]);
    queue.save([]);
    expect(queue.load()).toEqual([]);
  });
});
