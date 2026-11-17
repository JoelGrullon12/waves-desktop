import { ChevronDown, ChevronUp, Music2, X } from "lucide-react";
import { artworkUrl } from "@/lib/tidalImage";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { usePlayerStore } from "@/store/playerStore";
import { useQueueStore } from "@/store/queueStore";

// Long queues (a whole liked library) are shown as a window around the current
// track; rendering thousands of rows would freeze the panel.
const ROWS_BEFORE_CURRENT = 20;
const ROWS_AFTER_CURRENT = 150;

export function QueuePanel() {
  const isQueueOpen = usePlayerStore((state) => state.isQueueOpen);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const playTrackAt = usePlayerStore((state) => state.playTrackAt);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const moveInQueue = usePlayerStore((state) => state.moveInQueue);
  const currentIndex = useQueueStore((state) => state.currentIndex);
  const tracks = useQueueStore((state) => state.tracks);
  const shuffleEnabled = useQueueStore((state) => state.shuffleEnabled);
  const currentRowRef = useRef<HTMLDivElement | null>(null);

  // Opening the panel shows where playback is, not the top of the list.
  useEffect(() => {
    if (isQueueOpen) currentRowRef.current?.scrollIntoView({ block: "center" });
  }, [isQueueOpen]);

  if (!isQueueOpen) return null;

  const windowStart = Math.max(0, (currentIndex ?? 0) - ROWS_BEFORE_CURRENT);
  const windowEnd = Math.min(tracks.length, (currentIndex ?? 0) + ROWS_AFTER_CURRENT + 1);
  const visibleTracks = tracks.slice(windowStart, windowEnd);
  const hiddenAfter = tracks.length - windowEnd;

  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-80 max-w-full flex-col border-l bg-background"
      data-testid="queue-panel"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Queue</h2>
          <p className="text-xs text-muted-foreground">
            {tracks.length > 0
              ? currentIndex != null
                ? `Playing ${currentIndex + 1} of ${tracks.length}${shuffleEnabled ? " · shuffled" : ""}`
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
            {visibleTracks.map((track, offset) => {
              const index = windowStart + offset;
              const isCurrent = index === currentIndex;
              return (
                <div
                  key={`${track.id}-${index}`}
                  ref={isCurrent ? currentRowRef : undefined}
                  data-queue-index={index}
                  data-current={isCurrent}
                  className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted ${
                    isCurrent ? "bg-muted/60" : ""
                  }`}
                  onClick={() => void playTrackAt(index)}
                >
                  {track.album?.cover ? (
                    <img
                      src={artworkUrl(track.album.cover, 80)}
                      alt=""
                      loading="lazy"
                      className={`size-9 shrink-0 rounded object-cover ${isCurrent ? "ring-2 ring-primary" : ""}`}
                    />
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded bg-muted">
                      <Music2
                        className={`size-4 ${isCurrent ? "text-primary" : "text-muted-foreground"}`}
                        aria-hidden
                      />
                    </div>
                  )}
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
                  <span className="text-xs tabular-nums text-muted-foreground group-hover:hidden">
                    {formatDuration(track.duration)}
                  </span>
                  <div className="hidden items-center group-hover:flex">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveInQueue(index, index - 1);
                      }}
                    >
                      <ChevronUp className="size-3" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Move down"
                      disabled={index === tracks.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveInQueue(index, index + 1);
                      }}
                    >
                      <ChevronDown className="size-3" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove from queue"
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeFromQueue(index);
                      }}
                    >
                      <X className="size-3" aria-hidden />
                    </Button>
                  </div>
                </div>
              );
            })}
            {hiddenAfter > 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                and {hiddenAfter} more
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
