import { Pause, Play } from "lucide-react";
import { formatDuration } from "@/lib/format";
import { artworkUrl } from "@/lib/tidalImage";
import { usePlayerStore } from "@/store/playerStore";
import { useQueueStore, type PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

interface TrackListProps {
  tracks: Track[];
  source: PlaybackSource;
}

interface TrackRowProps {
  track: Track;
  index: number;
  tracks: Track[];
  source: PlaybackSource;
}

function TrackRow({ track, index, tracks, source }: TrackRowProps) {
  const playQueue = usePlayerStore((state) => state.playQueue);
  const isCurrent = usePlayerStore((state) => state.currentTrack?.id === track.id);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentQueueId = useQueueStore((state) => state.source?.sourceId);

  const isPlayingThisTrack = isCurrent && isPlaying && currentQueueId === source.sourceId;
  const artwork = track.album?.cover ? artworkUrl(track.album.cover, 96) : undefined;

  return (
    <div
      className="group grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_minmax(0,0.7fr)_3.5rem] items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
      onClick={() => void playQueue(tracks, index, source)}
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
    </div>
  );
}

export function TrackList({ tracks, source }: TrackListProps) {
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
          source={source}
        />
      ))}
    </div>
  );
}