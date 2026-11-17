import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The repositories only need a database connection; the module also registers
// IPC handlers, whose Electron-side imports are not available under Vitest.
vi.mock("./database", () => ({ getDatabase: () => null }));
vi.mock("./secureIpc", () => ({ handleTrusted: () => undefined }));
vi.mock("./appDataLocation", () => ({ dataDirectory: () => "" }));
vi.mock("./appSecrets", () => ({ migrateLegacySecrets: () => undefined }));

import { DATABASE_SCHEMA } from "./databaseSchema";
import { QueueRepository } from "./preferencesRepository";

let databaseConnection: DatabaseSync;

beforeEach(() => {
  databaseConnection = new DatabaseSync(":memory:");
  databaseConnection.exec(DATABASE_SCHEMA);
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
