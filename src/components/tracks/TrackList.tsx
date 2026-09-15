import { Heart, Pause, Play } from "lucide-react";
import { TrackContextMenu } from "@/components/tracks/TrackContextMenu";
import { formatDuration } from "@/lib/format";
import { artworkUrl } from "@/lib/tidalImage";
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
  // The like hearts are only hidden in the liked-songs list; every other view
  // renders them (currently decorative until like/unlike becomes functional).
  showLikeButton?: boolean;
  allowRemoveFromLibrary?: boolean;
}

interface TrackRowProps {
  track: Track;
  index: number;
  tracks: Track[];
  queueTracks?: Track[];
  source: PlaybackSource;
  showLikeButton: boolean;
  allowRemoveFromLibrary: boolean;
}

function TrackRow({
  track,
  index,
  tracks,
  queueTracks,
  source,
  showLikeButton,
  allowRemoveFromLibrary,
}: TrackRowProps) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.id === track.id);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentQueueId = useQueueStore((state) => state.source?.sourceId);

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

  return (
    <TrackContextMenu track={track} allowRemoveFromLibrary={allowRemoveFromLibrary}>
      <div
        className={`group grid ${gridColumns} cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted`}
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
              {track.artists.map((artist) => artist.name).join(", ")}
            </p>
          </div>
        </div>

        <p className="truncate text-xs text-muted-foreground">{track.album?.title}</p>

        <p className="text-right text-xs tabular-nums text-muted-foreground">
          {formatDuration(track.duration)}
        </p>

        {showLikeButton && (
          <div
            className="pointer-events-none flex items-center justify-center"
            title="Like"
            aria-hidden
          >
            <Heart className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
          </div>
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
  allowRemoveFromLibrary = false,
}: TrackListProps) {
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
          allowRemoveFromLibrary={allowRemoveFromLibrary}
        />
      ))}
    </div>
  );
}