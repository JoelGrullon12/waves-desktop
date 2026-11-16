import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArtistCardLink } from "@/components/media/ArtistCardLink";
import { MediaGrid } from "@/components/media/MediaGrid";
import { SortControl, useStoredSort } from "@/components/media/SortControl";
import { Button } from "@/components/ui/button";
import { useMediaActions } from "@/hooks/useMediaActions";
import {
  ALBUM_SORT_LABELS,
  ARTIST_SORT_LABELS,
  PLAYLIST_SORT_LABELS,
  isSortKeyOf,
  sortAlbums,
  sortArtists,
  sortPlaylists,
} from "@/lib/librarySort";
import { albumToMedia, playlistToMedia } from "@/lib/mediaCards";
import { PREFERENCE_KEYS } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { AlbumPage, ArtistPage, PlaylistSummary } from "@/types/media";

type LibraryTab = "playlists" | "albums" | "artists";

const TABS: Array<{ id: LibraryTab; label: string }> = [
  { id: "playlists", label: "Playlists" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
];
const QUERY_OPTIONS = { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000 } as const;

function LoadingRow() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
    </div>
  );
}

const isPlaylistSortKey = isSortKeyOf(PLAYLIST_SORT_LABELS);
const isAlbumSortKey = isSortKeyOf(ALBUM_SORT_LABELS);
const isArtistSortKey = isSortKeyOf(ARTIST_SORT_LABELS);

function PlaylistsTab({ filter }: { filter: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openMedia, startPlayback, playError } = useMediaActions();
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const playlistsQuery = useQuery({
    queryKey: ["user-playlists"],
    queryFn: async (): Promise<PlaylistSummary[]> => {
      const result = await tidalCatalogService.getUserPlaylists();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    ...QUERY_OPTIONS,
  });

  const sort = useStoredSort(
    PREFERENCE_KEYS.libraryPlaylistSort,
    PREFERENCE_KEYS.libraryPlaylistSortDescending,
    isPlaylistSortKey,
    "added",
  );
  const cards = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matching = (playlistsQuery.data ?? []).filter(
      (playlist) => !needle || playlist.title.toLowerCase().includes(needle),
    );
    return sortPlaylists(matching, sort.sortKey, sort.descending).map(playlistToMedia);
  }, [playlistsQuery.data, filter, sort.sortKey, sort.descending]);

  const createPlaylist = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    setCreateError(null);
    const result = await tidalCatalogService.createPlaylist(name);
    setIsCreating(false);
    if (!result.success) {
      setCreateError(result.error);
      return;
    }
    setNewName("");
    // TIDAL takes a moment to list a new playlist, so it is added to the
    // cached list by hand instead of asking again right away.
    queryClient.setQueryData<PlaylistSummary[]>(["user-playlists"], (current) => [
      result.data,
      ...(current ?? []),
    ]);
    void navigate(`/playlists/${result.data.id}`);
  };

  return (
    <>
      <SortControl
        listName="playlists"
        labels={PLAYLIST_SORT_LABELS}
        sortKey={sort.sortKey}
        descending={sort.descending}
        onChange={sort.setSort}
        className="mb-4 max-w-56"
      />
      <form className="mb-5 flex max-w-md items-center gap-2" onSubmit={(event) => void createPlaylist(event)}>
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New playlist name"
          aria-label="New playlist name"
          maxLength={100}
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" variant="outline" disabled={isCreating || newName.trim() === ""}>
          {isCreating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Create
        </Button>
      </form>
      {createError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          Couldn't create the playlist: {createError}
        </p>
      )}
      {playError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          Couldn't start playback: {playError}
        </p>
      )}
      {playlistsQuery.isLoading && <LoadingRow />}
      {playlistsQuery.isError && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {playlistsQuery.error.message}
        </p>
      )}
      {playlistsQuery.isSuccess && cards.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter.trim() ? "No playlist matches the filter." : "You have no playlists yet."}
        </p>
      )}
      <MediaGrid items={cards} onOpen={openMedia} onPlay={startPlayback} />
    </>
  );
}

function AlbumsTab({ filter }: { filter: string }) {
  const { openMedia, startPlayback, playError } = useMediaActions();
  const albumsQuery = useInfiniteQuery({
    queryKey: ["collection-albums"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<AlbumPage> => {
      const result = await tidalCatalogService.getCollectionAlbumsPage(pageParam);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    ...QUERY_OPTIONS,
  });

  const sort = useStoredSort(
    PREFERENCE_KEYS.libraryAlbumSort,
    PREFERENCE_KEYS.libraryAlbumSortDescending,
    isAlbumSortKey,
    "added",
  );
  const cards = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const albums = (albumsQuery.data?.pages ?? []).flatMap((page) => page.albums);
    return sortAlbums(albums, sort.sortKey, sort.descending)
      .map(albumToMedia)
      .filter(
        (media) =>
          !needle ||
          media.title.toLowerCase().includes(needle) ||
          (media.subtitle ?? "").toLowerCase().includes(needle),
      );
  }, [albumsQuery.data, filter, sort.sortKey, sort.descending]);

  // Sorting only makes sense over the whole list, so the remaining pages are
  // fetched as soon as an order other than TIDAL's own is chosen.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = albumsQuery;
  useEffect(() => {
    if (sort.sortKey !== "added" && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [sort.sortKey, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <SortControl
        listName="albums"
        labels={ALBUM_SORT_LABELS}
        sortKey={sort.sortKey}
        descending={sort.descending}
        onChange={sort.setSort}
        className="mb-4 max-w-56"
      />
      {playError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          Couldn't start playback: {playError}
        </p>
      )}
      {albumsQuery.isLoading && <LoadingRow />}
      {albumsQuery.isError && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {albumsQuery.error.message}
        </p>
      )}
      {albumsQuery.isSuccess && cards.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter.trim() ? "No album matches the filter." : "Albums you save on TIDAL appear here."}
        </p>
      )}
      <MediaGrid items={cards} onOpen={openMedia} onPlay={startPlayback} />
      {albumsQuery.hasNextPage && (
        <Button
          variant="outline"
          className="mt-5"
          disabled={albumsQuery.isFetchingNextPage}
          onClick={() => void albumsQuery.fetchNextPage()}
        >
          {albumsQuery.isFetchingNextPage && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Load more albums
        </Button>
      )}
    </>
  );
}

function ArtistsTab({ filter }: { filter: string }) {
  const artistsQuery = useInfiniteQuery({
    queryKey: ["collection-artists"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ArtistPage> => {
      const result = await tidalCatalogService.getCollectionArtistsPage(pageParam);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    ...QUERY_OPTIONS,
  });

  const sort = useStoredSort(
    PREFERENCE_KEYS.libraryArtistSort,
    PREFERENCE_KEYS.libraryArtistSortDescending,
    isArtistSortKey,
    "name",
  );
  const artists = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const loaded = (artistsQuery.data?.pages ?? []).flatMap((page) => page.artists);
    return sortArtists(loaded, sort.sortKey, sort.descending).filter(
      (artist) => !needle || artist.name.toLowerCase().includes(needle),
    );
  }, [artistsQuery.data, filter, sort.sortKey, sort.descending]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = artistsQuery;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <>
      <SortControl
        listName="artists"
        labels={ARTIST_SORT_LABELS}
        sortKey={sort.sortKey}
        descending={sort.descending}
        onChange={sort.setSort}
        className="mb-4 max-w-56"
      />
      {artistsQuery.isLoading && <LoadingRow />}
      {artistsQuery.isError && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {artistsQuery.error.message}
        </p>
      )}
      {artistsQuery.isSuccess && artists.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter.trim() ? "No artist matches the filter." : "Artists you follow on TIDAL appear here."}
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-5">
        {artists.map((artist) => (
          <ArtistCardLink key={artist.id} artist={artist} />
        ))}
      </div>
      {artistsQuery.hasNextPage && (
        <Button
          variant="outline"
          className="mt-5"
          disabled={artistsQuery.isFetchingNextPage}
          onClick={() => void artistsQuery.fetchNextPage()}
        >
          {artistsQuery.isFetchingNextPage && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Load more artists
        </Button>
      )}
    </>
  );
}

// The user's saved playlists, albums and artists. Liked tracks have their own
// screen (Songs).
export function LibraryView() {
  const [tab, setTab] = useState<LibraryTab>("playlists");
  const [filter, setFilter] = useState("");

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">Library</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Library sections" className="flex rounded-lg bg-muted p-0.5">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === entry.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={`Filter ${tab}`}
            aria-label={`Filter ${tab}`}
            className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
          />
        </div>
      </header>

      {tab === "playlists" && <PlaylistsTab filter={filter} />}
      {tab === "albums" && <AlbumsTab filter={filter} />}
      {tab === "artists" && <ArtistsTab filter={filter} />}
    </div>
  );
}
