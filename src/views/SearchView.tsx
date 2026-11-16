import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ArtistCardLink } from "@/components/media/ArtistCardLink";
import { HorizontalScroll } from "@/components/media/HorizontalScroll";
import { MediaCard } from "@/components/media/MediaCard";
import { TrackList } from "@/components/tracks/TrackList";
import { useMediaActions } from "@/hooks/useMediaActions";
import { useTrackCollection } from "@/hooks/useTrackCollection";
import { albumToMedia, playlistToMedia } from "@/lib/mediaCards";
import { filterTracks } from "@/lib/textSearch";
import { cn } from "@/lib/utils";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { LIKED_TRACKS_QUERY_KEY } from "@/store/likedStore";
import type { PlaybackSource } from "@/store/queueStore";
import type { MediaSummary, SearchResults } from "@/types/media";
import type { Track } from "@/types/track";

type SearchScope = "tidal" | "collection";

const SCOPES: Array<{ id: SearchScope; label: string }> = [
  { id: "tidal", label: "TIDAL" },
  { id: "collection", label: "My collection" },
];
const TIDAL_SOURCE: PlaybackSource = { sourceType: "search", sourceId: "tracks" };
const COLLECTION_SOURCE: PlaybackSource = { sourceType: "search", sourceId: "collection" };
const DEBOUNCE_MS = 350;
// Rows shown before the user asks for more; a broad term can match hundreds.
const COLLECTION_RESULTS_STEP = 100;

function LoadingRow() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}

function MediaRow({ title, items }: { title: string; items: MediaSummary[] }) {
  const { openMedia, startPlayback } = useMediaActions();
  if (items.length === 0) return null;
  return (
    <section className="mb-8">
      <HorizontalScroll title={title}>
        {items.map((media) => (
          <MediaCard
            key={media.id}
            media={media}
            onOpen={openMedia}
            onPlay={(item) => startPlayback(item, false)}
            onShuffle={(item) => startPlayback(item, true)}
          />
        ))}
      </HorizontalScroll>
    </section>
  );
}

// Everything on TIDAL: tracks plus matching artists, albums and playlists.
function TidalResults({ query }: { query: string }) {
  const tracksQuery = useQuery({
    queryKey: ["search-tracks", query],
    queryFn: async (): Promise<Track[]> => {
      const result = await tidalCatalogService.searchTracks(query);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  const collectionsQuery = useQuery({
    queryKey: ["search-collections", query],
    queryFn: async (): Promise<SearchResults> => {
      const result = await tidalCatalogService.searchCollections(query);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });

  const albums = useMemo(
    () => (collectionsQuery.data?.albums ?? []).map(albumToMedia),
    [collectionsQuery.data],
  );
  const playlists = useMemo(
    () => (collectionsQuery.data?.playlists ?? []).map(playlistToMedia),
    [collectionsQuery.data],
  );
  const artists = collectionsQuery.data?.artists ?? [];

  return (
    <>
      {artists.length > 0 && (
        <section className="mb-8">
          <HorizontalScroll title="Artists">
            {artists.map((artist) => (
              <ArtistCardLink key={artist.id} artist={artist} />
            ))}
          </HorizontalScroll>
        </section>
      )}
      <MediaRow title="Albums" items={albums} />
      <MediaRow title="Playlists" items={playlists} />

      <section>
        <h2 className="mb-2 text-lg font-bold">Tracks</h2>
        {tracksQuery.isLoading && <LoadingRow />}
        {tracksQuery.isError && (
          <p role="alert" className="py-8 text-center text-sm text-destructive">
            {tracksQuery.error.message}
          </p>
        )}
        {tracksQuery.data && <TrackList tracks={tracksQuery.data} source={TIDAL_SOURCE} />}
      </section>
    </>
  );
}

// Only what the user saved: for now the liked songs, which are loaded in full
// (in the background) and filtered here, with no request per search.
function CollectionResults({ query }: { query: string }) {
  const [visibleCount, setVisibleCount] = useState(COLLECTION_RESULTS_STEP);
  const collection = useTrackCollection({
    queryKey: LIKED_TRACKS_QUERY_KEY,
    source: COLLECTION_SOURCE,
    enrich: true,
    fetchPage: (cursor) => tidalCatalogService.getFavoriteTracksPage(cursor),
  });
  const matches = useMemo(
    () => filterTracks(collection.displayTracks, query),
    [collection.displayTracks, query],
  );

  useEffect(() => setVisibleCount(COLLECTION_RESULTS_STEP), [query]);

  if (collection.status === "pending") return <LoadingRow />;
  if (collection.status === "error" && collection.displayTracks.length === 0) {
    return (
      <p role="alert" className="py-8 text-center text-sm text-destructive">
        {collection.error?.message}
      </p>
    );
  }

  const visibleMatches = matches.slice(0, visibleCount);
  return (
    <section>
      <p className="mb-3 text-sm text-muted-foreground" data-testid="collection-search-summary">
        {matches.length} {matches.length === 1 ? "match" : "matches"} in{" "}
        {collection.displayTracks.length} liked songs
        {!collection.isComplete && " (still loading your library…)"}
      </p>
      {matches.length > 0 && (
        <TrackList
          tracks={visibleMatches}
          queueTracks={matches}
          source={COLLECTION_SOURCE}
          showLikeButton={false}
        />
      )}
      {matches.length > visibleCount && (
        <button
          type="button"
          className="mt-3 text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => setVisibleCount((count) => count + COLLECTION_RESULTS_STEP)}
        >
          Show more ({matches.length - visibleCount} left)
        </button>
      )}
    </section>
  );
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // TIDAL is the default scope on every visit.
  const [scope, setScope] = useState<SearchScope>("tidal");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searchEnabled = debouncedQuery.length > 0;

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Search</h1>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 max-w-xl flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            size={16}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={scope === "tidal" ? "Search on TIDAL" : "Search in your collection"}
            aria-label="Search"
            className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div role="radiogroup" aria-label="Where to search" className="flex rounded-lg bg-muted p-0.5">
          {SCOPES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={scope === entry.id}
              onClick={() => setScope(entry.id)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                scope === entry.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {!searchEnabled && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {scope === "tidal"
            ? "Type to search TIDAL for tracks, artists, albums and playlists."
            : "Type to search the songs you have liked."}
        </p>
      )}

      {searchEnabled && scope === "tidal" && <TidalResults query={debouncedQuery} />}
      {searchEnabled && scope === "collection" && <CollectionResults query={debouncedQuery} />}
    </div>
  );
}
