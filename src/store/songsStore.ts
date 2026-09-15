import { create } from "zustand";
import type { Track } from "@/types/track";

interface SongsStore {
  // Track id -> enriched track from the catalog API. A null value means the id
  // was already resolved without a result (e.g. the API no longer returns that
  // track), so it must not be requested again.
  enrichedById: Map<string, Track | null>;
  mergeEnrichedBatch: (requestedIds: string[], tracks: Track[]) => void;
}

export const useSongsStore = create<SongsStore>((set) => ({
  enrichedById: new Map(),

  mergeEnrichedBatch: (requestedIds, tracks) =>
    set((state) => {
      const next = new Map(state.enrichedById);
      for (const id of requestedIds) next.set(id, null);
      for (const track of tracks) next.set(track.id, track);
      return { enrichedById: next };
    }),
}));