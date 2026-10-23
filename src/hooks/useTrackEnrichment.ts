import { useEffect, useMemo, useRef } from "react";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { useSongsStore } from "@/store/songsStore";
import type { Track } from "@/types/track";

// Some collections (liked songs) embed reduced track/album resources with no
// artwork. This hook fills the missing fields by fetching the canonical tracks
// for the given ids, one batch at a time, and returns the tracks with whatever
// enrichment is already cached merged in.
const ENRICH_BATCH_SIZE = 50;

export function useTrackEnrichment(tracks: Track[], enabled = true): Track[] {
  const enrichedById = useSongsStore((state) => state.enrichedById);
  const mergeEnrichedBatch = useSongsStore((state) => state.mergeEnrichedBatch);
  const inFlightBatchRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    const inFlight = inFlightBatchRef.current;
    const pending = tracks.filter(
      (track) => !enrichedById.has(track.id) && !inFlight.has(track.id),
    );
    if (pending.length === 0) return;

    const batch = pending.slice(0, ENRICH_BATCH_SIZE).map((track) => track.id);
    for (const id of batch) inFlight.add(id);

    void tidalCatalogService.getTracksByIds(batch).then((result) => {
      for (const id of batch) inFlight.delete(id);
      // A failed batch is recorded as misses (tracks keep their slim data)
      // so nothing waiting on enrichment, like Play, hangs forever on it.
      mergeEnrichedBatch(batch, result.success ? result.data : []);
    });
  }, [tracks, enrichedById, mergeEnrichedBatch, enabled]);

  return useMemo(
    () => tracks.map((track) => enrichedById.get(track.id) ?? track),
    [tracks, enrichedById],
  );
}
