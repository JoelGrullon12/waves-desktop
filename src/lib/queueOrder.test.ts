import { describe, expect, it } from "vitest";
import {
  indexAfterSkip,
  indexAfterTrackEnds,
  indexBefore,
  indexToPlaceNext,
  insertedAfterCurrent,
  isRepeatMode,
  movedItem,
  nextRepeatMode,
  withoutIndex,
} from "@/lib/queueOrder";

describe("repeat modes", () => {
  it("cycles off, one extra play, repeat track, repeat queue", () => {
    expect(nextRepeatMode("off")).toBe("one-once");
    expect(nextRepeatMode("one-once")).toBe("one");
    expect(nextRepeatMode("one")).toBe("all");
    expect(nextRepeatMode("all")).toBe("off");
  });

  it("recognizes stored values", () => {
    expect(isRepeatMode("one-once")).toBe(true);
    expect(isRepeatMode("twice")).toBe(false);
    expect(isRepeatMode(null)).toBe(false);
  });
});

describe("indexAfterTrackEnds", () => {
  it("moves on and stops at the end without repeat", () => {
    expect(indexAfterTrackEnds(3, 0, "off")).toBe(1);
    expect(indexAfterTrackEnds(3, 2, "off")).toBeNull();
  });

  it("stays on the track for both repeat-one modes", () => {
    expect(indexAfterTrackEnds(3, 1, "one")).toBe(1);
    expect(indexAfterTrackEnds(3, 1, "one-once")).toBe(1);
    expect(indexAfterTrackEnds(3, 2, "one")).toBe(2);
  });

  it("wraps around when repeating the queue", () => {
    expect(indexAfterTrackEnds(3, 2, "all")).toBe(0);
  });

  it("has nothing to play in an idle or empty queue", () => {
    expect(indexAfterTrackEnds(3, null, "all")).toBeNull();
    expect(indexAfterTrackEnds(0, 0, "one")).toBeNull();
  });
});

describe("indexAfterSkip and indexBefore", () => {
  it("lets the user leave a repeated track", () => {
    expect(indexAfterSkip(3, 1, "one")).toBe(2);
    expect(indexAfterSkip(3, 1, "one-once")).toBe(2);
  });

  it("wraps only when repeating the queue", () => {
    expect(indexAfterSkip(3, 2, "off")).toBeNull();
    expect(indexAfterSkip(3, 2, "all")).toBe(0);
    expect(indexBefore(3, 0, "off")).toBeNull();
    expect(indexBefore(3, 0, "all")).toBe(2);
    expect(indexBefore(3, 2, "off")).toBe(1);
  });
});

describe("withoutIndex", () => {
  it("keeps pointing at the same track when an earlier one is removed", () => {
    expect(withoutIndex(["a", "b", "c"], 2, 0)).toEqual({ items: ["b", "c"], currentIndex: 1 });
  });

  it("points at the following track when the current one is removed", () => {
    expect(withoutIndex(["a", "b", "c"], 1, 1)).toEqual({ items: ["a", "c"], currentIndex: 1 });
    expect(withoutIndex(["a", "b"], 1, 1)).toEqual({ items: ["a"], currentIndex: 0 });
  });

  it("leaves an empty queue idle", () => {
    expect(withoutIndex(["a"], 0, 0)).toEqual({ items: [], currentIndex: null });
  });

  it("ignores positions outside the queue", () => {
    expect(withoutIndex(["a"], 0, 5)).toEqual({ items: ["a"], currentIndex: 0 });
  });
});

describe("insertedAfterCurrent", () => {
  it("inserts right after the current track", () => {
    expect(insertedAfterCurrent(["a", "b", "c"], 0, ["x", "y"])).toEqual(["a", "x", "y", "b", "c"]);
  });

  it("starts an idle queue", () => {
    expect(insertedAfterCurrent([], null, ["x"])).toEqual(["x"]);
  });
});

describe("movedItem", () => {
  it("follows the current track when it is the one moved", () => {
    expect(movedItem(["a", "b", "c"], 0, 0, 2)).toEqual({ items: ["b", "c", "a"], currentIndex: 2 });
  });

  it("shifts the current position when tracks cross it", () => {
    expect(movedItem(["a", "b", "c"], 1, 0, 2)).toEqual({ items: ["b", "c", "a"], currentIndex: 0 });
    expect(movedItem(["a", "b", "c"], 1, 2, 0)).toEqual({ items: ["c", "a", "b"], currentIndex: 2 });
  });

  it("leaves the queue alone for invalid moves", () => {
    const items = ["a", "b"];
    expect(movedItem(items, 0, 0, 0).items).toBe(items);
    expect(movedItem(items, 0, 0, 9).items).toBe(items);
  });
});

describe("indexToPlaceNext", () => {
  it("moves a later track to right after the current one", () => {
    expect(indexToPlaceNext(7, 2)).toBe(3);
    expect(movedItem(["a", "b", "c", "d", "e", "f", "g", "h"], 2, 7, 3)).toEqual({
      items: ["a", "b", "c", "h", "d", "e", "f", "g"],
      currentIndex: 2,
    });
  });

  it("moves an earlier track to right after the current one", () => {
    expect(indexToPlaceNext(0, 3)).toBe(3);
    expect(movedItem(["a", "b", "c", "d", "e"], 3, 0, 3)).toEqual({
      items: ["b", "c", "d", "a", "e"],
      currentIndex: 2,
    });
  });

  it("does nothing for the current track, the next one or without a current track", () => {
    expect(indexToPlaceNext(3, 3)).toBeNull();
    expect(indexToPlaceNext(4, 3)).toBeNull();
    expect(indexToPlaceNext(4, null)).toBeNull();
  });
});
