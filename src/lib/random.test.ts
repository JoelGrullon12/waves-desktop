import { afterEach, describe, expect, it, vi } from "vitest";
import { randomSubset, shuffleCopy } from "@/lib/random";

describe("shuffleCopy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a permutation without mutating the source list", () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const snapshot = [...source];

    const shuffled = shuffleCopy(source);

    expect(source).toEqual(snapshot);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(snapshot);
  });

  it("handles empty and single-item lists", () => {
    expect(shuffleCopy([])).toEqual([]);
    expect(shuffleCopy(["only"])).toEqual(["only"]);
  });

  it("is deterministic for a fixed random source", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    // With Math.random() === 0 every swap picks index 0, rotating the list.
    expect(shuffleCopy([1, 2, 3])).toEqual([2, 3, 1]);
  });
});

describe("randomSubset", () => {
  it("returns at most `count` distinct items", () => {
    const source = [1, 2, 3, 4, 5];

    const subset = randomSubset(source, 3);

    expect(subset).toHaveLength(3);
    expect(new Set(subset).size).toBe(3);
    for (const item of subset) expect(source).toContain(item);
  });

  it("returns every item when the source is shorter than `count`", () => {
    expect([...randomSubset([1, 2], 10)].sort()).toEqual([1, 2]);
  });
});
