import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { TrackList } from "@/components/tracks/TrackList";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

const SEARCH_SOURCE: PlaybackSource = { sourceType: "search", sourceId: "tracks" };
const DEBOUNCE_MS = 350;

export function SearchView() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searchEnabled = debouncedQuery.trim().length > 0;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["search-tracks", debouncedQuery],
    queryFn: async (): Promise<Track[]> => {
      const result = await tidalCatalogService.searchTracks(debouncedQuery);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: searchEnabled,
  });

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Search</h1>

      <div className="relative mb-6 max-w-xl">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          size={16}
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tracks on TIDAL"
          aria-label="Search tracks"
          className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {!searchEnabled && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Type to search for tracks.
        </p>
      )}

      {searchEnabled && isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}

      {searchEnabled && isError && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {error.message}
        </p>
      )}

      {searchEnabled && !isLoading && !isError && data && (
        <TrackList tracks={data} source={SEARCH_SOURCE} />
      )}
    </div>
  );
}