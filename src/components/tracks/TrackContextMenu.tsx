import { ContextMenu } from "@base-ui/react/context-menu";
import { Disc3, Heart, HeartOff, ListEnd, ListPlus, ListStart, Play } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { useIsLiked, useLikedStore } from "@/store/likedStore";
import { usePlayerStore } from "@/store/playerStore";
import { usePlaylistDialogStore } from "@/store/playlistDialogStore";
import type { Track } from "@/types/track";

interface TrackContextMenuProps {
  track: Track;
  children: ReactNode;
  // What "Play" does for this row (start the list it belongs to at this
  // track). Without it the track is played on its own.
  onPlay?: () => void;
}

const ITEM_CLASS =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[disabled]:cursor-default data-[disabled]:opacity-50";
const ICON_CLASS = "size-4 text-muted-foreground";

// Right-click menu of a track row.
export function TrackContextMenu({ track, children, onPlay }: TrackContextMenuProps) {
  const navigate = useNavigate();
  const isLiked = useIsLiked(track.id);
  const setLiked = useLikedStore((state) => state.setLiked);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const playNext = usePlayerStore((state) => state.playNext);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const showNotice = usePlayerStore((state) => state.showNotice);
  const openPlaylistDialog = usePlaylistDialogStore((state) => state.open);
  const albumId = track.album?.id;

  const play = () => {
    if (onPlay) onPlay();
    else void playQueue([track], 0, { sourceType: "track", sourceId: track.id });
  };

  const toggleLiked = async () => {
    const result = await setLiked(track, !isLiked);
    if (result.success) {
      showNotice(
        isLiked ? `Removed "${track.title}" from your library` : `Added "${track.title}" to your library`,
      );
    } else {
      showNotice(`Could not update your library: ${result.error}`);
    }
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<div />}>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner align="start" alignOffset={-4} sideOffset={4} className="z-50">
          <ContextMenu.Popup
            data-testid="track-context-menu"
            className="min-w-52 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none"
          >
            <ContextMenu.Item className={ITEM_CLASS} onClick={play}>
              <Play className={ICON_CLASS} aria-hidden />
              Play
            </ContextMenu.Item>
            <ContextMenu.Item className={ITEM_CLASS} onClick={() => void playNext([track])}>
              <ListStart className={ICON_CLASS} aria-hidden />
              Play next
            </ContextMenu.Item>
            <ContextMenu.Item className={ITEM_CLASS} onClick={() => void addToQueue([track])}>
              <ListEnd className={ICON_CLASS} aria-hidden />
              Add to queue
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item className={ITEM_CLASS} onClick={() => openPlaylistDialog([track])}>
              <ListPlus className={ICON_CLASS} aria-hidden />
              Add to playlists…
            </ContextMenu.Item>
            <ContextMenu.Item className={ITEM_CLASS} onClick={() => void toggleLiked()}>
              {isLiked ? (
                <HeartOff className={ICON_CLASS} aria-hidden />
              ) : (
                <Heart className={ICON_CLASS} aria-hidden />
              )}
              {isLiked ? "Remove from library" : "Add to library"}
            </ContextMenu.Item>
            <ContextMenu.Separator className="my-1 h-px bg-border" />
            <ContextMenu.Item
              className={ITEM_CLASS}
              disabled={!albumId}
              onClick={() => albumId && void navigate(`/albums/${albumId}`)}
            >
              <Disc3 className={ICON_CLASS} aria-hidden />
              Go to album
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
