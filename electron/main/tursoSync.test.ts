import { createClient, type Client } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./database", () => ({ getDatabase: () => null }));
vi.mock("./secureIpc", () => ({ handleTrusted: () => undefined }));
vi.mock("./appSecrets", () => ({ readAppSecrets: () => ({}), updateAppSecrets: () => undefined }));

import { DATABASE_SCHEMA, migrateDatabase } from "./databaseSchema";
import { PlayCountRepository } from "./playCountRepository";
import { TursoSync } from "./tursoSync";

// A second device is simulated with its own local database syncing against
// the same in-memory "cloud".
function createDevice(remote: Client | null): { repository: PlayCountRepository; sync: TursoSync } {
  const databaseConnection = new DatabaseSync(":memory:");
  databaseConnection.exec(DATABASE_SCHEMA);
  migrateDatabase(databaseConnection);
  const repository = new PlayCountRepository(databaseConnection);
  return { repository, sync: new TursoSync(remote, repository) };
}

let remote: Client;

beforeEach(() => {
  remote = createClient({ url: ":memory:" });
});

describe("TursoSync", () => {
  it("stays disabled and harmless without a cloud database", async () => {
    const device = createDevice(null);
    device.repository.incrementPlayCount("a");
    await device.sync.pushTrack("a");
    expect((await device.sync.syncEverything()).state).toBe("disabled");
    expect(device.sync.getStatus().isConfigured).toBe(false);
  });

  it("carries plays from one device to another", async () => {
    const desktop = createDevice(remote);
    desktop.repository.incrementPlayCount("a", new Date("2026-11-01T10:00:00Z"));
    desktop.repository.incrementPlayCount("a", new Date("2026-11-02T10:00:00Z"));
    expect((await desktop.sync.syncEverything()).state).toBe("idle");

    const laptop = createDevice(remote);
    await laptop.sync.syncEverything();
    expect(laptop.repository.playCounts(["a"]).get("a")).toBe(2);
    expect(laptop.repository.row("a")?.lastPlayedAt).toBe("2026-11-02T10:00:00.000Z");
  });

  it("pushes each counted play and keeps the higher count on both sides", async () => {
    const desktop = createDevice(remote);
    const laptop = createDevice(remote);
    await desktop.sync.syncEverything();

    desktop.repository.incrementPlayCount("a");
    await desktop.sync.pushTrack("a");
    laptop.repository.incrementPlayCount("a");
    laptop.repository.incrementPlayCount("a");
    laptop.repository.incrementPlayCount("a");
    await laptop.sync.pushTrack("a");

    await desktop.sync.syncEverything();
    expect(desktop.repository.playCounts(["a"]).get("a")).toBe(3);
    expect(desktop.sync.getStatus().pendingTracks).toBe(0);
  });

  it("keeps a failed play pending and sends it at the next sync", async () => {
    const failing = {
      execute: () => Promise.reject(new Error("offline")),
      batch: () => Promise.reject(new Error("offline")),
    } as unknown as Client;
    const databaseConnection = new DatabaseSync(":memory:");
    databaseConnection.exec(DATABASE_SCHEMA);
    migrateDatabase(databaseConnection);
    const repository = new PlayCountRepository(databaseConnection);

    const offline = new TursoSync(failing, repository);
    repository.incrementPlayCount("a");
    await offline.pushTrack("a");
    expect(offline.getStatus()).toMatchObject({ state: "error", lastError: "offline", pendingTracks: 1 });

    const online = new TursoSync(remote, repository);
    await online.syncEverything();
    const cloud = await remote.execute("SELECT play_count FROM track_plays WHERE track_id = 'a'");
    expect(Number(cloud.rows[0]["play_count"])).toBe(1);
  });

  it("does not upload tracks that were only registered", async () => {
    const desktop = createDevice(remote);
    desktop.repository.registerTracks(["never", "played"]);
    desktop.repository.incrementPlayCount("played");
    await desktop.sync.syncEverything();
    const cloud = await remote.execute("SELECT track_id FROM track_plays");
    expect(cloud.rows.map((row) => row["track_id"])).toEqual(["played"]);
  });
});
