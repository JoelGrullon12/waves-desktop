import { MediaCard } from "@/components/media/MediaCard";
import type { MediaSummary } from "@/types/media";

interface MediaGridProps {
  items: MediaSummary[];
  onOpen: (media: MediaSummary) => void;
  onPlay: (media: MediaSummary, shuffle: boolean) => Promise<void>;
}

// Wrapping grid of media cards, for lists too long for a single scrolling row.
export function MediaGrid({ items, onOpen, onPlay }: MediaGridProps) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-5">
      {items.map((media) => (
        <MediaCard
          key={`${media.type}-${media.id}`}
          media={media}
          onOpen={onOpen}
          onPlay={(item) => onPlay(item, false)}
          onShuffle={(item) => onPlay(item, true)}
        />
      ))}
    </div>
  );
}
