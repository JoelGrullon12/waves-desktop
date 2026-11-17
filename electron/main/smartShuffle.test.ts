import { describe, expect, it } from "vitest";
import { smartShuffleOrder } from "./smartShuffle";

// Deterministic stand-in for Math.random.
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("smartShuffleOrder", () => {
  it("plays the least played tracks first", () => {
    const levels = new Map([
      ["a", 5],
      ["b", 0],
      ["c", 2],
    ]);
    expect(smartShuffleOrder(["a", "b", "c"], levels)).toEqual(["b", "c", "a"]);
  });

  it("treats unknown tracks as never played", () => {
    const order = smartShuffleOrder(["known", "new"], new Map([["known", 3]]));
    expect(order).toEqual(["new", "known"]);
  });

  it("keeps every track exactly once, duplicates included", () => {
    const ids = ["a", "b", "a", "c"];
    const order = smartShuffleOrder(ids, new Map(), seededRandom(7));
    expect([...order].sort()).toEqual([...ids].sort());
  });

  it("shuffles inside a group but never across groups", () => {
    const low = ["l1", "l2", "l3", "l4", "l5", "l6"];
    const high = ["h1", "h2", "h3", "h4", "h5", "h6"];
    const levels = new Map([...low.map((id) => [id, 1] as const), ...high.map((id) => [id, 9] as const)]);
    const first = smartShuffleOrder([...high, ...low], levels, seededRandom(1));
    const second = smartShuffleOrder([...high, ...low], levels, seededRandom(2));

    expect([...first.slice(0, 6)].sort()).toEqual(low);
    expect([...first.slice(6)].sort()).toEqual(high);
    expect(first).not.toEqual(second);
  });

  it("returns an empty order for no tracks", () => {
    expect(smartShuffleOrder([], new Map())).toEqual([]);
  });
});
