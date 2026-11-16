import type { InfiniteData } from "@tanstack/react-query";
import { create } from "zustand";
import { queryClient } from "@/lib/queryClient";
import { tidalCatalogService, type Result } from "@/services/tidalCatalogService";
import type { Track, TrackPage } from "@/types/track";

// The v2 API exposes no per-track "liked" flag, so the like state is derived
// from the user's collection of liked track ids. The collection can hold
// thousands of ids, so it is walked once per session in the background (small
// identifier-only pages) and kept in a Set for O(1) lookups by TrackList.
type LikedStatus = "idle" | "loading" | "ready" | "error";

interface LikedStore {
  likedIds: Set<string>;
  status: LikedStatus;
  load: () => Promise<void>;
  // Adds the track to (or removes it from) the user's liked tracks on TIDAL.
  setLiked: (track: Track, liked: boolean) => Promise<Result<void>>;
  reset: () => void;
}

// Query key of the liked-tracks list shown by SongsView.
export const LIKED_TRACKS_QUERY_KEY = ["favorite-tracks"] as const;

// Keeps the already-loaded liked-tracks list in step with a like/unlike, so it
// does not have to be downloaded again (it can be thousands of tracks).
function updateLikedTracksList(track: Track, liked: boolean): void {
  queryClient.setQueryData<InfiniteData<TrackPage, string | null>>(
    LIKED_TRACKS_QUERY_KEY,
    (cached) => {
      if (!cached || cached.pages.length === 0) return cached;
      const pages = cached.pages.map((page) => ({
        ...page,
        tracks: page.tracks.filter((candidate) => candidate.id !== track.id),
      }));
      // The list is ordered by most recently liked.
      if (liked) pages[0] = { ...pages[0], tracks: [track, ...pages[0].tracks] };
      return { ...cached, pages };
    },
  );
}

function withLikedId(likedIds: Set<string>, trackId: string, liked: boolean): Set<string> {
  const next = new Set(likedIds);
  if (liked) next.add(trackId);
  else next.delete(trackId);
  return next;
}

// Module-level in-flight promise so concurrent callers (many TrackList rows)
// share a single walk.
let inFlight: Promise<void> | null = null;
let walkGeneration = 0;
// Likes and unlikes made in this session. The background walk reads pages that
// may predate them, so they are applied on top of whatever it finds.
const localChanges = new Map<string, boolean>();

function withLocalChanges(walkedIds: Set<string>): Set<string> {
  const merged = new Set(walkedIds);
  for (const [trackId, liked] of localChanges) {
    if (liked) merged.add(trackId);
    else merged.delete(trackId);
  }
  return merged;
}

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
        set({ likedIds: withLocalChanges(ids) });
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

  setLiked: async (track, liked) => {
    const wasLiked = get().likedIds.has(track.id);
    // Shown at once; undone below if TIDAL rejects the change.
    set({ likedIds: withLikedId(get().likedIds, track.id, liked) });
    const result = liked
      ? await tidalCatalogService.addTracksToLikes([track.id])
      : await tidalCatalogService.removeTracksFromLikes([track.id]);
    if (!result.success) {
      set({ likedIds: withLikedId(get().likedIds, track.id, wasLiked) });
      return result;
    }
    localChanges.set(track.id, liked);
    updateLikedTracksList(track, liked);
    return result;
  },

  // A walk still running at logout would repopulate the store with the previous
  // account's ids, so the generation counter makes it discard its results.
  reset: () => {
    walkGeneration += 1;
    inFlight = null;
    localChanges.clear();
    set({ likedIds: new Set(), status: "idle" });
  },
}));

export function useIsLiked(trackId: string): boolean {
  return useLikedStore((state) => state.likedIds.has(trackId));
}
