import { describe, expect, it } from "vitest";
import { isWorthSyncing, mergePlayRows, planSync, type PlayRow } from "./playSync";

function row(trackId: string, playCount: number, lastPlayedAt: string | null = null, baselineCount = 0): PlayRow {
  return { trackId, playCount, baselineCount, lastPlayedAt };
}

describe("mergePlayRows", () => {
  it("keeps the higher count and the later date", () => {
    expect(mergePlayRows(row("a", 3, "2026-11-01"), row("a", 5, "2026-10-01"))).toEqual(
      row("a", 5, "2026-11-01"),
    );
  });

  it("takes whichever side exists", () => {
    expect(mergePlayRows(undefined, row("a", 2, "2026-11-01", 4))).toEqual(row("a", 2, "2026-11-01", 4));
    expect(mergePlayRows(row("a", 1), undefined)).toEqual(row("a", 1));
  });

  it("never replaces the local baseline", () => {
    expect(mergePlayRows(row("a", 1, null, 7), row("a", 1, null, 99)).baselineCount).toBe(7);
  });
});

describe("planSync", () => {
  it("pulls tracks only the cloud has and pushes tracks only this device has", () => {
    const plan = planSync([row("local", 2, "2026-11-01")], [row("cloud", 4, "2026-11-02")]);
    expect(plan.toLocal).toEqual([row("cloud", 4, "2026-11-02")]);
    expect(plan.toRemote).toEqual([row("local", 2, "2026-11-01")]);
  });

  it("moves each track toward the side that is ahead", () => {
    const plan = planSync(
      [row("a", 10, "2026-11-05"), row("b", 1, "2026-11-01")],
      [row("a", 7, "2026-11-01"), row("b", 6, "2026-11-09")],
    );
    expect(plan.toLocal).toEqual([row("b", 6, "2026-11-09")]);
    expect(plan.toRemote).toEqual([row("a", 10, "2026-11-05")]);
  });

  it("does nothing when both sides agree", () => {
    const rows = [row("a", 3, "2026-11-01"), row("b", 0, null, 5)];
    expect(planSync(rows, rows)).toEqual({ toLocal: [], toRemote: [] });
  });

  it("does not send tracks that were never played and have no baseline", () => {
    const plan = planSync([row("unplayed", 0), row("leveled", 0, null, 12)], []);
    expect(plan.toRemote).toEqual([row("leveled", 0, null, 12)]);
  });

  it("leaves a differing cloud baseline alone when the counts agree", () => {
    const plan = planSync([row("a", 3, "2026-11-01", 2)], [row("a", 3, "2026-11-01", 9)]);
    expect(plan).toEqual({ toLocal: [], toRemote: [] });
  });
});

describe("isWorthSyncing", () => {
  it("is false only for a row that says nothing", () => {
    expect(isWorthSyncing(row("a", 0))).toBe(false);
    expect(isWorthSyncing(row("a", 1))).toBe(true);
    expect(isWorthSyncing(row("a", 0, null, 3))).toBe(true);
  });
});
