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
}

// Module-level in-flight promise so concurrent callers (many TrackList rows)
// share a single walk.
let inFlight: Promise<void> | null = null;

export const useLikedStore = create<LikedStore>((set, get) => ({
  likedIds: new Set(),
  status: "idle",

  load: () => {
    if (inFlight) return inFlight;
    if (get().status === "ready") return Promise.resolve();

    set({ status: "loading" });
    const run = (async () => {
      const ids = new Set<string>();
      let cursor: string | null = null;
      for (;;) {
        const result = await tidalCatalogService.getLikedTrackIdsPage(cursor);
        if (!result.success) {
          set({ status: "error" });
          throw new Error(result.error);
        }
        for (const id of result.data.ids) ids.add(id);
        set({ likedIds: new Set(ids) });
        if (!result.data.nextCursor || result.data.nextCursor === cursor) break;
        cursor = result.data.nextCursor;
      }
      set({ status: "ready" });
    })();
    inFlight = run;

    void run
      .catch(() => {
        // Allow a later load() to retry after a failure.
      })
      .finally(() => {
        inFlight = null;
      });

    return run;
  },
}));

export function useIsLiked(trackId: string): boolean {
  return useLikedStore((state) => state.likedIds.has(trackId));
}
