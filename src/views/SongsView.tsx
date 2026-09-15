import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, Play, Shuffle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TrackList } from "@/components/tracks/TrackList";
import { Button } from "@/components/ui/button";
import { formatTotalDuration } from "@/lib/format";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { useSongsStore } from "@/store/songsStore";
import { usePlayerStore } from "@/store/playerStore";
import type { PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

const SONGS_SOURCE: PlaybackSource = { sourceType: "songs", sourceId: "liked-tracks" };

// Enrichment fills only the fields the likes collection omits (album artwork).
// Batches are processed sequentially so the rows fill as they resolve.
const ENRICH_BATCH_SIZE = 50;

// The full liked library can be ~1500 tracks. Instead of mounting every row at
// once, only the first chunk renders; scrolling past the end reveals more rows
// from the already-loaded pages (a lightweight virtual scroll).
const INITIAL_VISIBLE_ROWS = 50;
const ROWS_PER_REVEAL = 50;

// Trade-off: by the time the user presses Play/Shuffle we want the FULL library
// queued, not just the rows rendered so far. Both buttons therefore wait for
// every page (and the enrichment) to finish, showing a spinner while doing so.
const ENRICHMENT_POLL_MS = 250;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function shuffleCopy(tracks: Track[]): Track[] {
  const copy = [...tracks];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function SongsView() {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const enrichedById = useSongsStore((state) => state.enrichedById);
  const mergeEnrichedBatch = useSongsStore((state) => state.mergeEnrichedBatch);
  const [isPreparing, setIsPreparing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_ROWS);

  const {
    data,
    status,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["favorite-tracks"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<{ tracks: Track[]; nextCursor: string | null }> => {
      const result = await tidalCatalogService.getFavoriteTracksPage(pageParam);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // The full liked library is expensive to paginate; re-navigating to this
    // screen within a session should reuse the pages already fetched.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Refs that always hold the latest values, so async loops that read them on
  // each iteration see fresh state without needing to re-render.
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

  // Enrich un-resolved tracks in sequential batches; ids are only marked
  // resolved when the request succeeds (missing tracks resolve to null), so a
  // transient failure is retried on the next effect run instead of being
  // silently dropped.
  const inFlightBatchRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const inFlight = inFlightBatchRef.current;
    const pending = slimTracks.filter((track) => !enrichedById.has(track.id) && !inFlight.has(track.id));
    if (pending.length === 0) return;

    const batch = pending.slice(0, ENRICH_BATCH_SIZE).map((track) => track.id);
    for (const id of batch) inFlight.add(id);

    void tidalCatalogService.getTracksByIds(batch).then((result) => {
      for (const id of batch) inFlight.delete(id);
      if (result.success) mergeEnrichedBatch(batch, result.data);
    });
  }, [slimTracks, enrichedById, mergeEnrichedBatch]);

  const displayTracks = useMemo(
    () => slimTracks.map((track) => enrichedById.get(track.id) ?? track),
    [slimTracks, enrichedById],
  );

  const displayTracksRef = useRef(displayTracks);
  displayTracksRef.current = displayTracks;

  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;

  // Background prefetch: as soon as there is another page, chain a fetch. The
  // effect re-fires when a fetch completes (isFetchingNextPage flips to false,
  // or hasNextPage changes), so requesting 50/page walks the whole library
  // (~30 requests for ~1500 likes, paced 300 ms in the main process) lazily in
  // the background while the user browses the already-visible rows.
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

  // The scroll sentinel has two independent jobs:
  //  1. Reveal more already-loaded rows: while the full library lives in the
  //     query cache but is only rendered up to `visibleCount`, scrolling just
  //     grows the visible window — this must NOT depend on pagination state,
  //     otherwise the list would stay stuck at the first chunk while the
  //     background prefetch is still walking the (large) library.
  //  2. Fetch the next page when there is one and no fetch is already in
  //     flight, so scrolling past an error/abort can resume the walk.
  // Both jobs run per intersection; React Query dedupes concurrent fetchNextPage
  // calls, and the isFetchingNextPageRef guard prevents piling up requests.
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
              // A failed fetch does not mark the query as errored here; the
              // prefetch effect / buttons surface the actual error. Resuming
              // on a later intersection is enough.
            });
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Waits until every page of the liked library is loaded. Reading the refs on
  // each iteration makes the loop track progress made elsewhere (the background
  // prefetch) instead of launching its own request burst. When no fetch is in
  // flight it drives one page fetch itself; a real fetch error (e.g. after
  // TIDAL's 429 retries are exhausted) rejects out of here and surfaces through
  // the buttons' error handling — no infinite wait.
  async function loadAllPages(): Promise<void> {
    for (;;) {
      if (!hasNextPageRef.current) return;
      if (isFetchingNextPageRef.current) {
        await sleep(ENRICHMENT_POLL_MS);
        continue;
      }
      await fetchNextPageRef.current();
    }
  }

  // Waits until every track seen so far has been enriched (or is a known miss).
  // Reads the store directly so it reflects batches merged by other callers.
  async function waitForEnrichment(): Promise<void> {
    for (;;) {
      const enriched = useSongsStore.getState().enrichedById;
      const pending = slimTracksRef.current.filter((track) => !enriched.has(track.id));
      if (pending.length === 0) return;
      await sleep(ENRICHMENT_POLL_MS);
    }
  }

  // Ensures the FULL library is ready before playback: finish any pending pages
  // and enrichment, then build the queue from the complete list (shuffled when
  // requested). The buttons show a spinner while this runs. A fetch error stops
  // the wait and the buttons show it instead of waiting forever.
  async function startLibraryPlayback(shuffle: boolean): Promise<void> {
    setIsPreparing(true);
    setLoadError(null);
    try {
      await loadAllPages();
      await waitForEnrichment();
      const allTracks = displayTracksRef.current;
      if (allTracks.length === 0) return;
      const queue = shuffle ? shuffleCopy(allTracks) : allTracks;
      await playQueue(queue, 0, SONGS_SOURCE);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load the library.");
    } finally {
      setIsPreparing(false);
    }
  }

  const isComplete = status === "success" && !hasNextPage;
  const totalDurationSeconds = useMemo(
    () => displayTracks.reduce((sum, track) => sum + (track.duration ?? 0), 0),
    [displayTracks],
  );

  const trackCount = displayTracks.length;
  const countLabel = `${trackCount} ${trackCount === 1 ? "song" : "songs"}`;
  const hasErrorWithoutData = status === "error" && !data;
  const visibleTracks = displayTracks.slice(0, visibleCount);

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Songs</h1>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {isComplete ? `${countLabel} · ${formatTotalDuration(totalDurationSeconds)}` : ""}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button
            onClick={() => void startLibraryPlayback(false)}
            disabled={displayTracks.length === 0 || isPreparing}
          >
            {isPreparing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {isPreparing ? "Loading library…" : "Play"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void startLibraryPlayback(true)}
            disabled={displayTracks.length === 0 || isPreparing}
          >
            {isPreparing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Shuffle className="size-4" aria-hidden />
            )}
            {isPreparing ? "Loading library…" : "Shuffle"}
          </Button>
        </div>

        {loadError && (
          <p role="alert" className="mt-3 max-w-2xl truncate text-sm text-destructive">
            Couldn't load the full library: {loadError}
          </p>
        )}
      </header>

      {status === "pending" && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}

      {hasErrorWithoutData && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {error.message}
        </p>
      )}

      {isComplete && displayTracks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Songs you like will appear here.
        </p>
      )}

      {displayTracks.length > 0 && (
        <div className="flex flex-col">
          <TrackList
            tracks={visibleTracks}
            queueTracks={displayTracks}
            source={SONGS_SOURCE}
            showLikeButton={false}
            allowRemoveFromLibrary
          />

          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          )}

          {status === "error" && (
            <p role="alert" className="py-4 text-center text-sm text-muted-foreground">
              Couldn't load more songs.
            </p>
          )}
        </div>
      )}

      {/* The sentinel must be in the DOM from the very first render: the
          observer effect above runs once (deps []) and bails out if the node
          is missing, which froze the list at the initial `visibleCount` rows on
          the first visit (re-entering mounted it and "fixed" it). It drives
          both "reveal more already-loaded rows" and "fetch the next page". */}
      <div ref={loadMoreRef} className="py-2" aria-hidden />
    </div>
  );
}