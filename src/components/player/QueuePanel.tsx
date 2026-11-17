import { ContextMenu } from "@base-ui/react/context-menu";
import { GripVertical, ListStart, Music2, Play, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { indexToPlaceNext } from "@/lib/queueOrder";
import { artworkUrl } from "@/lib/tidalImage";
import { usePlayerStore } from "@/store/playerStore";
import { useQueueStore } from "@/store/queueStore";
import type { Track } from "@/types/track";

// Long queues (a whole liked library) are shown as a window around the current
// track; rendering thousands of rows would freeze the panel.
const ROWS_BEFORE_CURRENT = 20;
const ROWS_AFTER_CURRENT = 150;
const DRAG_TYPE = "application/x-waves-queue-index";

const MENU_ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[disabled]:cursor-default data-[disabled]:opacity-50";
const MENU_ICON_CLASS = "size-4 shrink-0 text-muted-foreground";

interface DropTarget {
  index: number;
  // Drop after the row (lower half) instead of before it.
  isAfter: boolean;
}

// Where the dragged row ends up, as the `toIndex` of moveInQueue.
function destinationIndex(fromIndex: number, target: DropTarget): number {
  const insertion = target.isAfter ? target.index + 1 : target.index;
  return fromIndex < insertion ? insertion - 1 : insertion;
}

interface QueueRowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  canPlaceNext: boolean;
  dropTarget: DropTarget | null;
  onDragStart: (index: number) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, index: number) => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
  rowRef?: (element: HTMLDivElement | null) => void;
}

function QueueRow({
  track,
  index,
  isCurrent,
  canPlaceNext,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  rowRef,
}: QueueRowProps) {
  const playTrackAt = usePlayerStore((state) => state.playTrackAt);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const moveInQueue = usePlayerStore((state) => state.moveInQueue);
  const currentIndex = useQueueStore((state) => state.currentIndex);

  const placeNext = () => {
    const destination = indexToPlaceNext(index, currentIndex);
    if (destination != null) moveInQueue(index, destination);
  };
  const isDropBefore = dropTarget?.index === index && !dropTarget.isAfter;
  const isDropAfter = dropTarget?.index === index && dropTarget.isAfter;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<div />}>
        <div
          ref={rowRef}
          draggable
          data-queue-index={index}
          data-current={isCurrent}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(DRAG_TYPE, String(index));
            onDragStart(index);
          }}
          onDragOver={(event) => onDragOver(event, index)}
          onDrop={(event) => {
            event.preventDefault();
            onDrop(index);
          }}
          onDragEnd={onDragEnd}
          className={`group relative flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted ${
            isCurrent ? "bg-muted/60" : ""
          }`}
        >
          {isDropBefore && <span className="absolute inset-x-1 -top-px h-0.5 rounded bg-primary" />}
          {isDropAfter && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-primary" />}
          <GripVertical
            className="size-3.5 shrink-0 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground"
            aria-hidden
          />
          {track.album?.cover ? (
            <img
              src={artworkUrl(track.album.cover, 80)}
              alt=""
              loading="lazy"
              draggable={false}
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
            <p className={`truncate text-sm ${isCurrent ? "font-medium text-primary" : "text-foreground"}`}>
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
              aria-label={`Play ${track.title}`}
              title="Play"
              onClick={() => void playTrackAt(index)}
            >
              <Play className="size-3" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove from queue"
              title="Remove from queue"
              onClick={() => void removeFromQueue(index)}
            >
              <X className="size-3" aria-hidden />
            </Button>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner align="start" alignOffset={-4} sideOffset={4} className="z-50">
          <ContextMenu.Popup
            data-testid="queue-context-menu"
            className="min-w-48 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
          >
            <ContextMenu.Item className={MENU_ITEM_CLASS} onClick={() => void playTrackAt(index)}>
              <Play className={MENU_ICON_CLASS} aria-hidden />
              Play
            </ContextMenu.Item>
            <ContextMenu.Item className={MENU_ITEM_CLASS} disabled={!canPlaceNext} onClick={placeNext}>
              <ListStart className={MENU_ICON_CLASS} aria-hidden />
              Place next in queue
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item className={MENU_ITEM_CLASS} onClick={() => void removeFromQueue(index)}>
              <Trash2 className={MENU_ICON_CLASS} aria-hidden />
              Remove from queue
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function QueuePanel() {
  const isQueueOpen = usePlayerStore((state) => state.isQueueOpen);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const moveInQueue = usePlayerStore((state) => state.moveInQueue);
  const currentIndex = useQueueStore((state) => state.currentIndex);
  const tracks = useQueueStore((state) => state.tracks);
  const source = useQueueStore((state) => state.source);
  const shuffleEnabled = useQueueStore((state) => state.shuffleEnabled);
  const currentRowRef = useRef<HTMLDivElement | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Opening the panel shows where playback is, not the top of the list.
  useEffect(() => {
    if (isQueueOpen) currentRowRef.current?.scrollIntoView({ block: "center" });
  }, [isQueueOpen]);

  if (!isQueueOpen) return null;

  const windowStart = Math.max(0, (currentIndex ?? 0) - ROWS_BEFORE_CURRENT);
  const windowEnd = Math.min(tracks.length, (currentIndex ?? 0) + ROWS_AFTER_CURRENT + 1);
  const visibleTracks = tracks.slice(windowStart, windowEnd);
  const hiddenAfter = tracks.length - windowEnd;

  const endDrag = () => {
    setDraggedIndex(null);
    setDropTarget(null);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    if (draggedIndex == null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const isAfter = event.clientY > bounds.top + bounds.height / 2;
    if (dropTarget?.index !== index || dropTarget.isAfter !== isAfter) setDropTarget({ index, isAfter });
  };

  const handleDrop = (index: number) => {
    if (draggedIndex != null) {
      const destination = destinationIndex(draggedIndex, dropTarget ?? { index, isAfter: false });
      if (destination !== draggedIndex) moveInQueue(draggedIndex, destination);
    }
    endDrag();
  };

  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-80 max-w-full flex-col border-l bg-background"
      data-testid="queue-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Queue</h2>
          <p className="text-xs text-muted-foreground">
            {tracks.length > 0
              ? currentIndex != null
                ? `Playing ${currentIndex + 1} of ${tracks.length}${shuffleEnabled ? " · shuffled" : ""}`
                : `${tracks.length} tracks`
              : "No tracks in queue"}
          </p>
          {source?.sourceTitle && (
            <p className="truncate text-xs text-muted-foreground" data-testid="queue-source">
              Playing from{" "}
              {source.sourcePath ? (
                <Link to={source.sourcePath} className="font-medium text-foreground hover:underline">
                  {source.sourceTitle}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{source.sourceTitle}</span>
              )}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setQueueOpen(false)} aria-label="Close queue">
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
      }}>
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
                <QueueRow
                  key={`${track.id}-${index}`}
                  track={track}
                  index={index}
                  isCurrent={isCurrent}
                  canPlaceNext={indexToPlaceNext(index, currentIndex) != null}
                  dropTarget={dropTarget}
                  onDragStart={setDraggedIndex}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={endDrag}
                  rowRef={isCurrent ? (element) => (currentRowRef.current = element) : undefined}
                />
              );
            })}
            {hiddenAfter > 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">and {hiddenAfter} more</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
