import { Music2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import { useQueueStore } from "@/store/queueStore";

export function QueuePanel() {
  const isQueueOpen = usePlayerStore((state) => state.isQueueOpen);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const playTrackAt = usePlayerStore((state) => state.playTrackAt);
  const currentIndex = useQueueStore((state) => state.currentIndex);
  const tracks = useQueueStore((state) => state.tracks);
  const removeAt = useQueueStore((state) => state.removeAt);

  if (!isQueueOpen) return null;

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-80 flex-col border-l bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Queue</h2>
          <p className="text-xs text-muted-foreground">
            {tracks.length > 0
              ? currentIndex != null
                ? `Playing ${currentIndex + 1} of ${tracks.length}`
                : `${tracks.length} tracks`
              : "No tracks in queue"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setQueueOpen(false)}
          aria-label="Close queue"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tracks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Play a track and it will appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {tracks.map((track, index) => {
              const isCurrent = index === currentIndex;
              return (
                <div
                  key={`${track.id}-${index}`}
                  className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted ${
                    isCurrent ? "bg-muted/60" : ""
                  }`}
                  onClick={() => void playTrackAt(index)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    <Music2
                      className={`size-4 ${isCurrent ? "text-primary" : "text-muted-foreground"}`}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${
                        isCurrent ? "font-medium text-primary" : "text-foreground"
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {track.artists.map((artist) => artist.name).join(", ")}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatDuration(track.duration)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove from queue"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeAt(index);
                    }}
                  >
                    <X className="size-3" aria-hidden />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}