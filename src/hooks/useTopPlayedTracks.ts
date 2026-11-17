import { useQuery } from "@tanstack/react-query";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { Track } from "@/types/track";

export interface TopPlayedTracks {
  tracks: Track[];
  playCountById: Map<string, number>;
}

// The most played tracks according to the local statistics, most played
// first, with their metadata fetched from TIDAL. `withinDays` null means all
// time.
export function useTopPlayedTracks(limit: number, withinDays: number | null) {
  return useQuery({
    queryKey: ["top-played", limit, withinDays],
    queryFn: async (): Promise<TopPlayedTracks> => {
      const played = await window.api.getTopPlayed(limit, withinDays);
      if (played.length === 0) return { tracks: [], playCountById: new Map() };
      const result = await tidalCatalogService.getTracksByIds(played.map((row) => row.trackId));
      if (!result.success) throw new Error(result.error);
      const tracksById = new Map(result.data.map((track) => [String(track.id), track]));
      return {
        // A track TIDAL no longer returns is left out.
        tracks: played
          .map((row) => tracksById.get(row.trackId))
          .filter((track): track is Track => track !== undefined),
        playCountById: new Map(played.map((row) => [row.trackId, row.playCount])),
      };
    },
    // Statistics change as music plays, so the list is refreshed on each visit.
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
  });
}

export function playCountLabel(playCount: number): string {
  return `${playCount} ${playCount === 1 ? "play" : "plays"}`;
}

export function playCountLabels(playCountById: ReadonlyMap<string, number>): Map<string, string> {
  return new Map([...playCountById].map(([trackId, count]) => [trackId, playCountLabel(count)]));
}
