import { Heart, Pause, Play } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router";
import { ArtistLinks } from "@/components/tracks/ArtistLinks";
import { TrackContextMenu } from "@/components/tracks/TrackContextMenu";
import { formatDuration } from "@/lib/format";
import { artworkUrl } from "@/lib/tidalImage";
import { useLikedStore, useIsLiked } from "@/store/likedStore";
import { usePlayerStore } from "@/store/playerStore";
import { useQueueStore, type PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

interface TrackListProps {
  tracks: Track[];
  source: PlaybackSource;
  // When the rendered `tracks` are a window over a larger list (e.g. the liked
  // library is sliced for virtual scrolling), the rows must still start playback
  // from the FULL list, at the clicked track's real position. `tracks` stays the
  // visible window; `queueTracks` is what playQueue receives.
  queueTracks?: Track[];
  // The hearts are hidden in the liked-songs list, where every row is liked.
  showLikeButton?: boolean;
}

interface TrackRowProps {
  track: Track;
  index: number;
  tracks: Track[];
  queueTracks?: Track[];
  source: PlaybackSource;
  showLikeButton: boolean;
}

function TrackRow({
  track,
  index,
  tracks,
  queueTracks,
  source,
  showLikeButton,
}: TrackRowProps) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.id === track.id);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentQueueId = useQueueStore((state) => state.source?.sourceId);
  const isLiked = useIsLiked(track.id);
  const setLiked = useLikedStore((state) => state.setLiked);
  const showNotice = usePlayerStore((state) => state.showNotice);

  const isPlayingThisTrack = isCurrent && isPlaying && currentQueueId === source.sourceId;
  const artwork = track.album?.cover ? artworkUrl(track.album.cover, 96) : undefined;

  const gridColumns = showLikeButton
    ? "grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.6fr)_3rem_2.25rem]"
    : "grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.6fr)_3rem]";

  // Target the full list for the queue; if a window is provided, resolve the
  // clicked track's real index inside it (by id, so the visible order stands).
  const playFromRow = () => {
    const queue = queueTracks ?? tracks;
    const startIndex = queueTracks
      ? Math.max(0, queue.findIndex((trackItem) => trackItem.id === track.id))
      : index;
    void playQueue(queue, startIndex, source);
  };

  const toggleLiked = async () => {
    const result = await setLiked(track, !isLiked);
    if (!result.success) showNotice(`Could not update your library: ${result.error}`);
  };

  return (
    <TrackContextMenu track={track} onPlay={playFromRow}>
      <div
        className={`group grid ${gridColumns} cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted`}
        data-track-id={track.id}
        onClick={playFromRow}
      >
        <div className="flex items-center justify-center text-xs tabular-nums text-muted-foreground">
          {isPlayingThisTrack ? (
            <Pause className="size-3.5 text-primary" aria-hidden />
          ) : isCurrent ? (
            <span className="size-3.5 flex items-center justify-center">
              <span className="size-1.5 rounded-full bg-primary" />
            </span>
          ) : (
            <span className="group-hover:hidden">{index + 1}</span>
          )}
          <Play className="hidden size-3.5 text-foreground group-hover:block" aria-hidden />
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {artwork ? (
            <img
              src={artwork}
              alt={`${track.album?.title ?? "Album"} artwork`}
              className="h-10 w-10 rounded object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-10 w-10 rounded bg-muted" />
          )}
          <div className="min-w-0">
            <p
              className={`truncate font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}
            >
              {track.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <ArtistLinks artists={track.artists} />
            </p>
          </div>
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {track.album?.id ? (
            <Link
              to={`/albums/${track.album.id}`}
              className="hover:text-foreground hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {track.album.title}
            </Link>
          ) : (
            track.album?.title
          )}
        </p>

        <p className="text-right text-xs tabular-nums text-muted-foreground">
          {formatDuration(track.duration)}
        </p>

        {showLikeButton && (
          <button
            type="button"
            className="flex items-center justify-center rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title={isLiked ? "Remove from library" : "Add to library"}
            aria-label={isLiked ? "Remove from library" : "Add to library"}
            aria-pressed={isLiked}
            onClick={(event) => {
              // The row itself starts playback on click.
              event.stopPropagation();
              void toggleLiked();
            }}
          >
            <Heart
              className={`size-4 transition-colors ${
                isLiked
                  ? "fill-current text-primary"
                  : "text-muted-foreground hover:text-primary"
              }`}
              aria-hidden
            />
          </button>
        )}
      </div>
    </TrackContextMenu>
  );
}

export function TrackList({
  tracks,
  source,
  queueTracks,
  showLikeButton = true,
}: TrackListProps) {
  const loadLikedIds = useLikedStore((state) => state.load);

  // Kick off the background likes walk once: the hearts and the context menu
  // both need to know which tracks are liked.
  useEffect(() => {
    void loadLikedIds().catch(() => {
      // A failed walk leaves the tracks as unliked; a later mount retries.
    });
  }, [loadLikedIds]);

  if (tracks.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No tracks found.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tracks.map((track, index) => (
        <TrackRow
          key={track.id}
          track={track}
          index={index}
          tracks={tracks}
          queueTracks={queueTracks}
          source={source}
          showLikeButton={showLikeButton}
        />
      ))}
    </div>
  );
}