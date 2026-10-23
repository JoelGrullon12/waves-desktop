import { Loader2, Music, Play, Shuffle } from "lucide-react";
import { useState } from "react";
import { artworkUrl } from "@/lib/tidalImage";
import type { MediaSummary } from "@/types/media";

type MediaCardAction = "play" | "shuffle";

interface MediaCardProps {
  media: MediaSummary;
  onPlay: (media: MediaSummary) => Promise<void>;
  onShuffle: (media: MediaSummary) => Promise<void>;
  onOpen: (media: MediaSummary) => void;
}

// Reusable playlist/album/mix card: cover artwork with play + shuffle revealed
// on hover (bottom-left), title and subtitle below. Clicking anywhere except the
// two buttons opens the detail page.
export function MediaCard({ media, onPlay, onShuffle, onOpen }: MediaCardProps) {
  const [action, setAction] = useState<MediaCardAction | null>(null);
  const cover = media.cover ? artworkUrl(media.cover, 640) : undefined;

  const runAction = async (next: MediaCardAction): Promise<void> => {
    setAction(next);
    try {
      if (next === "play") await onPlay(media);
      else await onShuffle(media);
    } finally {
      setAction(null);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="group w-40 shrink-0 cursor-pointer"
      onClick={() => onOpen(media)}
      onKeyDown={(event) => {
        // Enter on the inner Play/Shuffle buttons bubbles up here; only open the
        // detail when the card itself has focus.
        if (event.key === "Enter" && event.target === event.currentTarget) onOpen(media);
      }}
    >
      <div className="relative overflow-hidden rounded-lg">
        {cover ? (
          <img
            src={cover}
            alt={`${media.title} artwork`}
            className="aspect-square w-40 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-square w-40 items-center justify-center bg-muted">
            <Music className="size-8 text-muted-foreground" aria-hidden />
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-start gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 pt-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          aria-hidden={action === null}
        >
          <button
            type="button"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
            title="Play"
            onClick={(event) => {
              event.stopPropagation();
              void runAction("play");
            }}
          >
            {action === "play" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Play className="size-4 translate-x-px" aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
            title="Shuffle"
            onClick={(event) => {
              event.stopPropagation();
              void runAction("shuffle");
            }}
          >
            {action === "shuffle" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Shuffle className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <p className="mt-2 truncate text-sm font-medium" title={media.title}>
        {media.title}
      </p>
      {media.subtitle && (
        <p className="truncate text-xs text-muted-foreground" title={media.subtitle}>
          {media.subtitle}
        </p>
      )}
    </div>
  );
}