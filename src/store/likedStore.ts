import { create } from "zustand";
import { tidalCatalogService } from "@/services/tidalCatalogService";

// The v2 API exposes no per-track "liked" flag, so the like state is derived
// from the user's collection of liked track ids. The collection can hold
// thousands of ids, so it is walked once per session in the background (small
// identifier-only pages) and kept in a Set for O(1) lookups by TrackList.
type LikedStatus = "idle" | "loading" | "ready" | "error";

interface LikedStore {
  likedIds: Set<string>;
  status: LikedStatus;
  load: () => Promise<void>;
  reset: () => void;
}

// Module-level in-flight promise so concurrent callers (many TrackList rows)
// share a single walk.
let inFlight: Promise<void> | null = null;
let walkGeneration = 0;

export const useLikedStore = create<LikedStore>((set, get) => ({
  likedIds: new Set(),
  status: "idle",

  load: () => {
    if (inFlight) return inFlight;
    if (get().status === "ready") return Promise.resolve();

    set({ status: "loading" });
    const generation = walkGeneration;
    const run = (async () => {
      const ids = new Set<string>();
      let cursor: string | null = null;
      for (;;) {
        const result = await tidalCatalogService.getLikedTrackIdsPage(cursor);
        if (generation !== walkGeneration) return;
        if (!result.success) {
          set({ status: "error" });
          throw new Error(result.error);
        }
        for (const id of result.data.ids) ids.add(id);
        set({ likedIds: new Set(ids) });
        if (!result.data.nextCursor || result.data.nextCursor === cursor) break;
        cursor = result.data.nextCursor;
      }
      if (generation !== walkGeneration) return;
      set({ status: "ready" });
    })();
    inFlight = run;

    void run
      .catch(() => {
        // Allow a later load() to retry after a failure.
      })
      .finally(() => {
        if (generation === walkGeneration) inFlight = null;
      });

    return run;
  },

  // A walk still running at logout would repopulate the store with the previous
  // account's ids, so the generation counter makes it discard its results.
  reset: () => {
    walkGeneration += 1;
    inFlight = null;
    set({ likedIds: new Set(), status: "idle" });
  },
}));

export function useIsLiked(trackId: string): boolean {
  return useLikedStore((state) => state.likedIds.has(trackId));
}
