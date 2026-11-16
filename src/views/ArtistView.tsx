import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2, Play, Shuffle, User } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { MediaGrid } from "@/components/media/MediaGrid";
import { TrackList } from "@/components/tracks/TrackList";
import { Button } from "@/components/ui/button";
import { useMediaActions } from "@/hooks/useMediaActions";
import { albumToMedia, releaseYear } from "@/lib/mediaCards";
import { artworkUrl } from "@/lib/tidalImage";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { usePlayerStore } from "@/store/playerStore";
import type { AlbumPage, ArtistCard, MediaSummary } from "@/types/media";
import type { TrackPage } from "@/types/track";

const TOP_TRACKS_COLLAPSED = 5;
const QUERY_OPTIONS = { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000 } as const;

export function ArtistView() {
  const { artistId = "" } = useParams();
  const playQueue = usePlayerStore((state) => state.playQueue);
  const { openMedia, startPlayback, playError } = useMediaActions();
  const [showAllTracks, setShowAllTracks] = useState(false);

  const artistQuery = useQuery({
    queryKey: ["artist-detail", artistId],
    queryFn: async (): Promise<ArtistCard> => {
      const result = await tidalCatalogService.getArtistDetail(artistId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: artistId !== "",
    ...QUERY_OPTIONS,
  });

  // TIDAL returns an artist's tracks most popular first; the first page is the
  // "top tracks" list.
  const tracksQuery = useQuery({
    queryKey: ["artist-tracks", artistId],
    queryFn: async (): Promise<TrackPage> => {
      const result = await tidalCatalogService.getArtistTracksPage(artistId, null);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: artistId !== "",
    ...QUERY_OPTIONS,
  });

  const albumsQuery = useInfiniteQuery({
    queryKey: ["artist-albums", artistId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<AlbumPage> => {
      const result = await tidalCatalogService.getArtistAlbumsPage(artistId, pageParam);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: artistId !== "",
    ...QUERY_OPTIONS,
  });

  const source = useMemo(() => ({ sourceType: "artist", sourceId: artistId }), [artistId]);
  const topTracks = tracksQuery.data?.tracks ?? [];
  const visibleTracks = showAllTracks ? topTracks : topTracks.slice(0, TOP_TRACKS_COLLAPSED);

  const albumCards = useMemo(() => {
    const seen = new Set<string>();
    const cards: MediaSummary[] = [];
    for (const page of albumsQuery.data?.pages ?? []) {
      for (const album of page.albums) {
        if (seen.has(album.id)) continue;
        seen.add(album.id);
        // On an artist's own page the year says more than repeating their name.
        cards.push({ ...albumToMedia(album), subtitle: releaseYear(album.releaseDate) ?? "Album" });
      }
    }
    return cards.sort((left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""));
  }, [albumsQuery.data]);

  const artist = artistQuery.data;
  const picture = artist?.picture ? artworkUrl(artist.picture, 640) : undefined;

  return (
    <div className="p-6">
      <header className="mb-8 flex items-end gap-5">
        {picture ? (
          <img src={picture} alt="" className="h-36 w-36 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="size-10 text-muted-foreground" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {artistQuery.isError ? "Not found" : "Artist"}
          </p>
          <h1 className="truncate text-3xl font-bold" data-testid="artist-name">
            {artist?.name ?? (artistQuery.isLoading ? "Loading…" : "—")}
          </h1>
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={() => void playQueue(topTracks, 0, source)}
              disabled={topTracks.length === 0}
            >
              <Play className="size-4" aria-hidden />
              Play
            </Button>
            <Button
              variant="ghost"
              onClick={() => void playQueue(topTracks, 0, source, { shuffle: true })}
              disabled={topTracks.length === 0}
            >
              <Shuffle className="size-4" aria-hidden />
              Shuffle
            </Button>
          </div>
        </div>
      </header>

      {artistQuery.isError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          {artistQuery.error.message}
        </p>
      )}
      {playError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          Couldn't start playback: {playError}
        </p>
      )}

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-bold">Top tracks</h2>
        {tracksQuery.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
        {tracksQuery.isError && (
          <p role="alert" className="py-4 text-sm text-destructive">
            {tracksQuery.error.message}
          </p>
        )}
        {tracksQuery.isSuccess && (
          <>
            <TrackList tracks={visibleTracks} queueTracks={topTracks} source={source} />
            {topTracks.length > TOP_TRACKS_COLLAPSED && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setShowAllTracks((current) => !current)}
              >
                {showAllTracks ? "Show fewer" : `Show all ${topTracks.length}`}
              </Button>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Albums</h2>
        {albumsQuery.isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
        {albumsQuery.isError && (
          <p role="alert" className="py-4 text-sm text-destructive">
            {albumsQuery.error.message}
          </p>
        )}
        {albumsQuery.isSuccess && albumCards.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">No albums available.</p>
        )}
        <MediaGrid items={albumCards} onOpen={openMedia} onPlay={startPlayback} />
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
      </section>
    </div>
  );
}
