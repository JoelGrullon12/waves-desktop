import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./database", () => ({ getDatabase: () => null }));
vi.mock("./secureIpc", () => ({ handleTrusted: () => undefined }));

import { DATABASE_SCHEMA, migrateDatabase } from "./databaseSchema";
import { PlayCountRepository } from "./playCountRepository";

let databaseConnection: DatabaseSync;
let repository: PlayCountRepository;

function playTimes(trackId: string, times: number): void {
  for (let count = 0; count < times; count++) repository.incrementPlayCount(trackId);
}

beforeEach(() => {
  databaseConnection = new DatabaseSync(":memory:");
  databaseConnection.exec(DATABASE_SCHEMA);
  migrateDatabase(databaseConnection);
  repository = new PlayCountRepository(databaseConnection);
});

describe("migrateDatabase", () => {
  it("adds the baseline column once and can run again", () => {
    expect(() => migrateDatabase(databaseConnection)).not.toThrow();
    const columns = databaseConnection.prepare("PRAGMA table_info(track_plays)").all() as Array<{
      name: string;
    }>;
    expect(columns.filter((column) => column.name === "baseline_count")).toHaveLength(1);
  });
});

describe("PlayCountRepository", () => {
  it("counts plays and remembers when the last one happened", () => {
    expect(repository.incrementPlayCount("a", new Date("2026-11-01T10:00:00Z"))).toBe(1);
    expect(repository.incrementPlayCount("a", new Date("2026-11-02T10:00:00Z"))).toBe(2);
    expect(repository.playCounts(["a", "missing"])).toEqual(new Map([["a", 2]]));
    expect(repository.topPlayed(5, null)[0]).toEqual({
      trackId: "a",
      playCount: 2,
      lastPlayedAt: "2026-11-02T10:00:00.000Z",
    });
  });

  it("starts a list seen for the first time at level zero", () => {
    repository.registerTracks(["a", "b"]);
    expect(repository.shuffleLevels(["a", "b"])).toEqual(
      new Map([
        ["a", 0],
        ["b", 0],
      ]),
    );
  });

  it("lets a newcomer to an established list join at its median level without faking plays", () => {
    const playlist = ["a", "b", "c"];
    repository.registerTracks(playlist);
    playTimes("a", 2);
    playTimes("b", 10);
    playTimes("c", 30);

    repository.registerTracks([...playlist, "new"]);

    expect(repository.shuffleLevels(["new"]).get("new")).toBe(10);
    expect(repository.playCounts(["new"]).get("new")).toBe(0);
    // A real play adds to the baseline it entered with.
    expect(repository.incrementPlayCount("new")).toBe(1);
    expect(repository.shuffleLevels(["new"]).get("new")).toBe(11);
  });

  it("uses the level of the list being shuffled, not of the rest of the library", () => {
    repository.registerTracks(["worn1", "worn2", "fresh1", "fresh2"]);
    playTimes("worn1", 300);
    playTimes("worn2", 300);
    playTimes("fresh1", 3);
    playTimes("fresh2", 5);

    repository.registerTracks(["fresh1", "fresh2", "newcomer"]);

    expect(repository.shuffleLevels(["newcomer"]).get("newcomer")).toBe(3);
  });

  it("keeps played tracks ahead of a mostly new list instead of leveling everything", () => {
    playTimes("played", 2);
    const list = ["played", "n1", "n2", "n3", "n4"];

    expect(repository.smartShuffle(list).at(-1)).toBe("played");
    expect(repository.shuffleLevels(["n1"]).get("n1")).toBe(0);
  });

  it("gives a track first seen by playing it the level of the library", () => {
    repository.registerTracks(["a", "b", "c"]);
    playTimes("a", 100);
    playTimes("b", 100);
    playTimes("c", 100);

    expect(repository.incrementPlayCount("stranger")).toBe(1);
    expect(repository.shuffleLevels(["stranger"]).get("stranger")).toBe(101);
  });

  it("never changes the baseline of a track it already knows", () => {
    repository.registerTracks(["old", "a", "b"]);
    playTimes("a", 50);
    playTimes("b", 60);
    repository.registerTracks(["old", "a", "b"]);
    expect(repository.shuffleLevels(["old"]).get("old")).toBe(0);
  });

  it("orders smart shuffle from least to most played", () => {
    repository.registerTracks(["often", "sometimes"]);
    playTimes("often", 9);
    playTimes("sometimes", 3);
    const order = repository.smartShuffle(["often", "sometimes"]);
    expect(order).toEqual(["sometimes", "often"]);
  });

  it("limits the top played list to a time window and leaves out unplayed tracks", () => {
    repository.incrementPlayCount("old", new Date("2026-01-01T00:00:00Z"));
    repository.incrementPlayCount("old", new Date("2026-01-02T00:00:00Z"));
    repository.incrementPlayCount("recent", new Date("2026-11-10T00:00:00Z"));
    repository.registerTracks(["never"]);

    expect(repository.topPlayed(10, null).map((row) => row.trackId)).toEqual(["old", "recent"]);
    expect(
      repository.topPlayed(10, new Date("2026-11-01T00:00:00Z")).map((row) => row.trackId),
    ).toEqual(["recent"]);
    expect(repository.topPlayed(1, null)).toHaveLength(1);
  });

  it("handles more ids than fit in one SQL statement", () => {
    const ids = Array.from({ length: 1200 }, (_, index) => `t${index}`);
    repository.registerTracks(ids);
    expect(repository.shuffleLevels(ids).size).toBe(1200);
    expect(repository.smartShuffle(ids)).toHaveLength(1200);
  });
});
