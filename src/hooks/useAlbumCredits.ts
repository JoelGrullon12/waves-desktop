import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Track, TrackCredit } from "@/types/track";

// One request per track, one after another, so a long album does not set off
// TIDAL's rate limit. Shares the per-track cache with the Now playing panel.
const CREDITS_STALE_MS = 60 * 60 * 1000;

export interface AlbumCredits {
  byTrack: Array<{ track: Track; credits: TrackCredit[] }>;
  loadedCount: number;
  error: string | null;
}

export function useAlbumCredits(tracks: Track[], enabled: boolean): AlbumCredits {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AlbumCredits>({ byTrack: [], loadedCount: 0, error: null });
  // The list object changes on every render of the album view; the walk only
  // starts again when the tracks themselves change.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const trackKey = tracks.map((track) => track.id).join(",");

  useEffect(() => {
    const tracks = tracksRef.current;
    if (!enabled || tracks.length === 0) return;
    let isCancelled = false;
    setState({ byTrack: [], loadedCount: 0, error: null });
    void (async () => {
      const byTrack: AlbumCredits["byTrack"] = [];
      for (const track of tracks) {
        try {
          const credits = await queryClient.fetchQuery({
            queryKey: ["track-credits", track.id],
            queryFn: () => window.api.getTrackCredits(track.id),
            staleTime: CREDITS_STALE_MS,
            retry: false,
          });
          if (isCancelled) return;
          byTrack.push({ track, credits });
          setState({ byTrack: [...byTrack], loadedCount: byTrack.length, error: null });
        } catch (error) {
          if (isCancelled) return;
          setState({ byTrack: [...byTrack], loadedCount: byTrack.length, error: error instanceof Error ? error.message : String(error) });
          return;
        }
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [enabled, trackKey, queryClient]);

  return state;
}
