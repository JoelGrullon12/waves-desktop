import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { needsEnrichment, useTrackEnrichment } from "@/hooks/useTrackEnrichment";
import type { Result } from "@/services/tidalCatalogService";
import { usePlayerStore } from "@/store/playerStore";
import type { PlaybackSource } from "@/store/queueStore";
import { useSongsStore } from "@/store/songsStore";
import type { Track, TrackPage } from "@/types/track";

// Lightweight virtual scroll: the full collection lives in the query cache but
// only the first chunk renders; scrolling past the end reveals more rows. Keeps
// mounting a ~1500-row list cheap while pages are still loading in background.
const INITIAL_VISIBLE_ROWS = 50;
const ROWS_PER_REVEAL = 50;

// Poll interval used while waiting for the background prefetch/enrichment to
// finish before starting playback.
const PREPARE_POLL_MS = 250;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface UseTrackCollectionOptions {
  queryKey: readonly unknown[];
  fetchPage: (cursor: string | null) => Promise<Result<TrackPage>>;
  source: PlaybackSource;
  // Liked tracks come from a reduced collection that omits artwork; album,
  // playlist and mix items already embed everything, so they skip enrichment.
  enrich?: boolean;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
}

export function useTrackCollection({
  queryKey,
  fetchPage,
  source,
  enrich = false,
  enabled = true,
  staleTime = 5 * 60 * 1000,
  gcTime = 30 * 60 * 1000,
}: UseTrackCollectionOptions) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const [isPreparing, setIsPreparing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);

  const { data, status, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: [...queryKey],
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam }): Promise<TrackPage> => {
        const result = await fetchPage(pageParam);
        if (!result.success) throw new Error(result.error);
        return result.data;
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled,
      staleTime,
      gcTime,
    });

  // Refs that always hold the latest values, so async loops read fresh state.
  const hasNextPageRef = useRef(hasNextPage);
  hasNextPageRef.current = hasNextPage;
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  isFetchingNextPageRef.current = isFetchingNextPage;
  const fetchNextPageRef = useRef(fetchNextPage);
  fetchNextPageRef.current = fetchNextPage;

  const slimTracks = useMemo(() => {
    const seen = new Set<string>();
    const tracks: Track[] = [];
    for (const page of data?.pages ?? []) {
      for (const track of page.tracks) {
        if (seen.has(track.id)) continue;
        seen.add(track.id);
        tracks.push(track);
      }
    }
    return tracks;
  }, [data]);

  const slimTracksRef = useRef(slimTracks);
  slimTracksRef.current = slimTracks;

  const displayTracks = useTrackEnrichment(slimTracks, enrich);

  const displayTracksRef = useRef(displayTracks);
  displayTracksRef.current = displayTracks;

  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;

  // Background prefetch: as soon as there is another page, chain a fetch. The
  // effect re-fires when a fetch completes, so the whole collection is walked
  // lazily while the user browses the already-visible rows.
  useEffect(() => {
    if (hasNextPageRef.current && !isFetchingNextPage) {
      void (async () => {
        try {
          await fetchNextPageRef.current();
        } catch {
          // A failed page stops the prefetch chain; the scroll sentinel can
          // retry on sight, and the buttons report the error themselves.
        }
      })();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  // The scroll sentinel reveals more already-loaded rows and retries the next
  // page fetch when one is still pending (e.g. after an error).
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (visibleCountRef.current < displayTracksRef.current.length) {
            setVisibleCount((count) => count + ROWS_PER_REVEAL);
          }
          if (hasNextPageRef.current && !isFetchingNextPageRef.current) {
            void fetchNextPageRef.current().catch(() => {
              // Errors surface through the prefetch effect / buttons.
            });
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Waits until every page is loaded, driving one fetch at a time when nothing
  // else is in flight. A real fetch error rejects out of here.
  async function loadAllPages(): Promise<void> {
    for (;;) {
      if (!hasNextPageRef.current) return;
      if (isFetchingNextPageRef.current) {
        await sleep(PREPARE_POLL_MS);
        continue;
      }
      await fetchNextPageRef.current();
    }
  }

  // Waits until every track seen so far has been enriched (or is a known miss).
  async function waitForEnrichment(): Promise<void> {
    if (!enrich) return;
    for (;;) {
      const enriched = useSongsStore.getState().enrichedById;
      const pending = slimTracksRef.current.filter(
        (track) => needsEnrichment(track) && !enriched.has(track.id),
      );
      if (pending.length === 0) return;
      await sleep(PREPARE_POLL_MS);
    }
  }

  // Ensures the FULL collection is ready before playback: finish any pending
  // pages and enrichment, then build the queue from the complete list.
  async function startPlayback(shuffle: boolean): Promise<void> {
    setIsPreparing(true);
    setLoadError(null);
    try {
      await loadAllPages();
      await waitForEnrichment();
      const allTracks = displayTracksRef.current;
      if (allTracks.length === 0) return;
      await playQueue(allTracks, 0, source, { shuffle });
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Failed to load tracks.");
    } finally {
      setIsPreparing(false);
    }
  }

  const isComplete = status === "success" && !hasNextPage;
  const totalDurationSeconds = useMemo(
    () => displayTracks.reduce((sum, track) => sum + (track.duration ?? 0), 0),
    [displayTracks],
  );
  const visibleTracks = displayTracks.slice(0, visibleCount);

  return {
    status,
    error,
    isComplete,
    isFetchingNextPage,
    displayTracks,
    visibleTracks,
    totalDurationSeconds,
    isPreparing,
    loadError,
    startPlayback,
    loadMoreRef,
  };
}
