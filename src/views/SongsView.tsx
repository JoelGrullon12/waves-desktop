import { Loader2, Play, Shuffle } from "lucide-react";
import { TrackList } from "@/components/tracks/TrackList";
import { Button } from "@/components/ui/button";
import { useTrackCollection } from "@/hooks/useTrackCollection";
import { formatTotalDuration } from "@/lib/format";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { PlaybackSource } from "@/store/queueStore";

const SONGS_SOURCE: PlaybackSource = {
  sourceType: "songs",
  sourceId: "liked-tracks",
  sourceTitle: "Songs",
  sourcePath: "/songs",
};

export function SongsView() {
  const collection = useTrackCollection({
    queryKey: ["favorite-tracks"],
    source: SONGS_SOURCE,
    // Liked tracks come from a reduced collection that omits album artwork.
    enrich: true,
    fetchPage: (cursor) => tidalCatalogService.getFavoriteTracksPage(cursor),
  });

  const {
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
  } = collection;

  const trackCount = displayTracks.length;
  const countLabel = `${trackCount} ${trackCount === 1 ? "song" : "songs"}`;
  const hasErrorWithoutData = status === "error" && displayTracks.length === 0;

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Songs</h1>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {isComplete ? `${countLabel} · ${formatTotalDuration(totalDurationSeconds)}` : ""}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <Button
            onClick={() => void startPlayback(false)}
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
            onClick={() => void startPlayback(true)}
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
          {error?.message}
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
          observer effect runs once and bails out if the node is missing. It
          drives both "reveal more already-loaded rows" and "fetch the next
          page". */}
      <div ref={loadMoreRef} className="py-2" aria-hidden />
    </div>
  );
}
