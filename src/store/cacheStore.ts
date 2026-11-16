import { create } from "zustand";
import { queryClient } from "@/lib/queryClient";
import { LIKED_TRACKS_QUERY_KEY } from "@/store/likedStore";
import type { MetadataCacheStatus } from "@/types/player";

// State of the local copy of the library, pushed by the main process. Lists
// that can be served from that copy are loaded again whenever it changes
// hands (turned on or off, or a refresh finished).

interface CacheStore {
  status: MetadataCacheStatus | null;
  connect: () => () => void;
  setEnabled: (isEnabled: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

function reloadCachedLists(): void {
  void queryClient.invalidateQueries({ queryKey: LIKED_TRACKS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ["media-tracks", "playlist"] });
  void queryClient.invalidateQueries({ queryKey: ["cache-search"] });
  void queryClient.invalidateQueries({ queryKey: ["cache-memberships"] });
}

export const useCacheStore = create<CacheStore>((set, get) => {
  const accept = (next: MetadataCacheStatus) => {
    const previous = get().status;
    set({ status: next });
    if (!previous) return;
    const finishedRefresh = previous.isRefreshing && !next.isRefreshing;
    if (finishedRefresh || previous.isEnabled !== next.isEnabled) reloadCachedLists();
  };
  return {
    status: null,
    connect: () => {
      void window.api.getCacheStatus().then(accept).catch(() => {});
      return window.api.onCacheStatus(accept);
    },
    setEnabled: async (isEnabled) => accept(await window.api.setCacheEnabled(isEnabled)),
    refresh: async () => accept(await window.api.refreshCache()),
  };
});

// True when lists and search can use the local copy.
export function useIsCacheReady(): boolean {
  return useCacheStore((state) => Boolean(state.status?.isEnabled && state.status.refreshedAt));
}
