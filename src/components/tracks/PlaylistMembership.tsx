import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";

const NAMES_SHOWN_INLINE = 3;

// The playlists a track is in, for a search result: "In n playlists" over the
// names on one line, each a link; a longer list folds out with "See all…".
export function PlaylistMembership({ playlists }: { playlists: Array<{ id: string; title: string }> }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLineCut, setIsLineCut] = useState(false);
  const lineRef = useRef<HTMLParagraphElement | null>(null);

  // The names may not fit on their line even when there are few of them.
  useLayoutEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const measure = () => setIsLineCut(line.scrollWidth > line.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(line);
    return () => observer.disconnect();
  }, [playlists, isExpanded]);

  if (playlists.length === 0) {
    return <p className="text-xs text-muted-foreground/70">Not in a playlist</p>;
  }
  const hasMore = playlists.length > NAMES_SHOWN_INLINE || isLineCut;
  const inline = isExpanded ? [] : playlists.slice(0, NAMES_SHOWN_INLINE);

  return (
    <div className="min-w-0 text-xs" data-testid="playlist-membership">
      <p className="font-medium text-foreground">
        {playlists.length === 1 ? "In 1 playlist" : `In ${playlists.length} playlists`}
      </p>
      {!isExpanded && (
        <p ref={lineRef} className="truncate text-muted-foreground">
          {inline.map((playlist, position) => (
            <span key={playlist.id}>
              {position > 0 && ", "}
              <Link to={`/playlists/${playlist.id}`} className="hover:text-foreground hover:underline">
                {playlist.title}
              </Link>
            </span>
          ))}
        </p>
      )}
      {isExpanded && (
        <ul className="mt-0.5 flex flex-col gap-0.5" data-testid="playlist-membership-list">
          {playlists.map((playlist) => (
            <li key={playlist.id} className="truncate">
              <Link
                to={`/playlists/${playlist.id}`}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {playlist.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          type="button"
          aria-expanded={isExpanded}
          className="text-primary underline-offset-4 hover:underline"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded ? "Show less" : "See all…"}
        </button>
      )}
    </div>
  );
}
