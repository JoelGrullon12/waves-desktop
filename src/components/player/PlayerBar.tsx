import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { artworkUrl } from "@/lib/tidalImage";
import { usePlayerStore } from "@/store/playerStore";

export function PlayerBar() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const volume = usePlayerStore((state) => state.volume);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const seek = usePlayerStore((state) => state.seek);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);

  const total = duration || currentTrack?.duration || 0;

  const artwork = currentTrack?.album?.cover
    ? artworkUrl(currentTrack.album.cover, 128)
    : undefined;

  return (
    <footer className="flex h-20 shrink-0 items-center gap-4 border-t bg-background px-4">
      <div className="flex min-w-0 flex-1 basis-1/3 items-center gap-3">
        {currentTrack ? (
          <>
            {artwork ? (
              <img
                src={artwork}
                alt={`${currentTrack.album?.title ?? "Album"} artwork`}
                className="h-12 w-12 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded bg-muted" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {currentTrack.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {currentTrack.artists.map((artist) => artist.name).join(", ")}
              </p>
            </div>
          </>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
            <ListMusic className="size-5 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" onClick={() => void previous()} aria-label="Previous">
            <SkipBack className="size-4" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon-lg"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="rounded-full"
            disabled={!currentTrack}
          >
            {isPlaying ? (
              <Pause className="size-5" aria-hidden />
            ) : (
              <Play className="ml-0.5 size-5" aria-hidden />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void next()} aria-label="Next">
            <SkipForward className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {formatDuration(position)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, total)}
            step={1}
            value={position}
            disabled={!currentTrack}
            aria-label="Seek"
            className="h-1.5 w-56 cursor-pointer appearance-none rounded-full bg-muted accent-primary md:w-72"
            onChange={(event) => void seek(Number(event.target.value))}
          />
          <span className="w-10 text-xs tabular-nums text-muted-foreground">
            {formatDuration(total)}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 basis-1/3 items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setVolume(volume === 0 ? 80 : 0)}
          aria-label={volume === 0 ? "Unmute" : "Mute"}
        >
          {volume === 0 ? (
            <VolumeX className="size-4" aria-hidden />
          ) : (
            <Volume2 className="size-4" aria-hidden />
          )}
        </Button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          aria-label="Volume"
          className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          onChange={(event) => setVolume(Number(event.target.value))}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setQueueOpen(true)}
          aria-label="Open queue"
        >
          <ListMusic className="size-4" aria-hidden />
        </Button>
      </div>
    </footer>
  );
}