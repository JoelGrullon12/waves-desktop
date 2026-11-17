import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CreditsList } from "@/components/player/NowPlayingPanel";
import { useAlbumCredits } from "@/hooks/useAlbumCredits";
import type { Track } from "@/types/track";

// Credits of an album: TIDAL only has them per track, so they are gathered
// from every track when the section is opened. Shown merged by role, and per
// track below.
export function AlbumCredits({ tracks, isListComplete }: { tracks: Track[]; isListComplete: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openTrackId, setOpenTrackId] = useState<string | null>(null);
  const credits = useAlbumCredits(tracks, isOpen && isListComplete);
  const merged = useMemo(() => credits.byTrack.flatMap((entry) => entry.credits), [credits.byTrack]);
  const isLoading = isOpen && credits.loadedCount < tracks.length && !credits.error;

  return (
    <section className="mt-8 border-t pt-4" data-testid="album-credits">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-1.5 text-base font-semibold hover:text-foreground"
      >
        {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        Credits
      </button>
      {isOpen && (
        <div className="mt-3 flex flex-col gap-5">
          {isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Gathering credits, {credits.loadedCount} of {tracks.length} tracks
            </p>
          )}
          {credits.error && <p className="text-sm text-muted-foreground">Could not load every credit: {credits.error}</p>}
          {!isLoading && merged.length === 0 && !credits.error && (
            <p className="text-sm text-muted-foreground">TIDAL has no credits for this album.</p>
          )}
          {merged.length > 0 && <CreditsList credits={merged} />}
          {credits.byTrack.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">By track</h3>
              <ul className="flex flex-col">
                {credits.byTrack.map(({ track, credits: trackCredits }, position) => (
                  <li key={track.id} className="border-b border-border/60 last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={openTrackId === track.id}
                      onClick={() => setOpenTrackId((current) => (current === track.id ? null : track.id))}
                      className="flex w-full items-center gap-2 py-1.5 text-start text-sm hover:text-foreground"
                    >
                      <span className="w-6 text-xs tabular-nums text-muted-foreground">{position + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{track.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {trackCredits.length === 1 ? "1 credit" : `${trackCredits.length} credits`}
                      </span>
                    </button>
                    {openTrackId === track.id && trackCredits.length > 0 && (
                      <div className="pb-3 pl-8">
                        <CreditsList credits={trackCredits} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
