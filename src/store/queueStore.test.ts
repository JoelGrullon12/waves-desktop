import { beforeEach, describe, expect, it } from "vitest";
import { useQueueStore } from "@/store/queueStore";
import type { Track } from "@/types/track";

function trackWithId(id: string): Track {
  return { id, title: `Track ${id}`, duration: 100, artists: [], isPlayable: true };
}

const source = { sourceType: "playlist", sourceId: "p1" };

function loadQueue(ids: string[], startIndex: number): void {
  useQueueStore.getState().setQueue(ids.map(trackWithId), startIndex, source);
}

function currentIds(): string[] {
  return useQueueStore.getState().tracks.map((track) => track.id);
}

describe("queueStore", () => {
  beforeEach(() => {
    useQueueStore.getState().clear();
  });

  it("sets the queue, current index and source", () => {
    loadQueue(["a", "b", "c"], 1);

    const state = useQueueStore.getState();
    expect(currentIds()).toEqual(["a", "b", "c"]);
    expect(state.currentIndex).toBe(1);
    expect(state.source).toEqual(source);
  });

  it("returns null track/index when nothing is queued", () => {
    const state = useQueueStore.getState();

    expect(state.nextIndex()).toBeNull();
    expect(state.previousIndex()).toBeNull();
    expect(state.getTrackAt(0)).toBeNull();
  });

  it("navigates to the next and previous indexes within bounds", () => {
    loadQueue(["a", "b", "c"], 1);

    expect(useQueueStore.getState().nextIndex()).toBe(2);
    expect(useQueueStore.getState().previousIndex()).toBe(0);
  });

  it("returns null past either end of the queue", () => {
    loadQueue(["a", "b"], 1);
    expect(useQueueStore.getState().nextIndex()).toBeNull();

    useQueueStore.getState().jumpTo(0);
    expect(useQueueStore.getState().previousIndex()).toBeNull();
  });

  describe("removeAt", () => {
    it("shifts the current index back when removing an earlier track", () => {
      loadQueue(["a", "b", "c", "d"], 2);

      useQueueStore.getState().removeAt(0);

      expect(currentIds()).toEqual(["b", "c", "d"]);
      expect(useQueueStore.getState().currentIndex).toBe(1);
    });

    it("keeps the current index when removing a later track", () => {
      loadQueue(["a", "b", "c", "d"], 1);

      useQueueStore.getState().removeAt(3);

      expect(currentIds()).toEqual(["a", "b", "c"]);
      expect(useQueueStore.getState().currentIndex).toBe(1);
    });

    it("moves to the following track when removing the current one", () => {
      loadQueue(["a", "b", "c"], 1);

      useQueueStore.getState().removeAt(1);

      expect(currentIds()).toEqual(["a", "c"]);
      expect(useQueueStore.getState().currentIndex).toBe(1);
    });

    it("clamps to the last track when removing the current last track", () => {
      loadQueue(["a", "b", "c"], 2);

      useQueueStore.getState().removeAt(2);

      expect(useQueueStore.getState().currentIndex).toBe(1);
    });
  });

  it("clear empties the queue", () => {
    loadQueue(["a"], 0);

    useQueueStore.getState().clear();

    const state = useQueueStore.getState();
    expect(state.tracks).toEqual([]);
    expect(state.currentIndex).toBeNull();
    expect(state.source).toBeNull();
  });
});
