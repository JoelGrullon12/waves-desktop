import { ContextMenu } from "@base-ui/react/context-menu";
import { ListPlus, Music, Play, Plus, Trash2, User } from "lucide-react";
import type { ReactNode } from "react";
import type { Track } from "@/types/track";

// Placeholder context menu: the entries are wired to no-ops until the
// corresponding flows (queue management, playlists, navigation) land.
interface TrackContextMenuProps {
  track: Track;
  children: ReactNode;
  allowRemoveFromLibrary?: boolean;
}

export function TrackContextMenu({
  track,
  children,
  allowRemoveFromLibrary = false,
}: TrackContextMenuProps) {
  const runPlaceholder = () => {
    // Intentionally empty until the menu actions are implemented.
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<div />}>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner align="start" alignOffset={-4} sideOffset={4}>
          <ContextMenu.Popup className="z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            <ContextMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              onClick={runPlaceholder}
            >
              <Play className="size-4 text-muted-foreground" aria-hidden />
              Play
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              onClick={runPlaceholder}
            >
              <ListPlus className="size-4 text-muted-foreground" aria-hidden />
              Play next
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              onClick={runPlaceholder}
            >
              <Plus className="size-4 text-muted-foreground" aria-hidden />
              Add to queue
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              onClick={runPlaceholder}
            >
              <Music className="size-4 text-muted-foreground" aria-hidden />
              Add to playlist
            </ContextMenu.Item>
            {allowRemoveFromLibrary && (
              <ContextMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
                onClick={runPlaceholder}
              >
                <Trash2 className="size-4 text-muted-foreground" aria-hidden />
                Remove from library
              </ContextMenu.Item>
            )}
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              onClick={runPlaceholder}
            >
              <Music className="size-4 text-muted-foreground" aria-hidden />
              Go to album
            </ContextMenu.Item>
            <ContextMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted"
              onClick={runPlaceholder}
            >
              <User className="size-4 text-muted-foreground" aria-hidden />
              Go to artist
            </ContextMenu.Item>
            <span className="sr-only">Context menu for {track.title}</span>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}