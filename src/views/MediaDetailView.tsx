import { useQuery } from "@tanstack/react-query";
import { Loader2, Music, Pencil, Play, Search, Shuffle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router";
import { AlbumCredits } from "@/components/media/AlbumCredits";
import { PlaylistEditDialog } from "@/components/media/PlaylistEditDialog";
import { ZoomableImage } from "@/components/media/ZoomableImage";
import { TrackList } from "@/components/tracks/TrackList";
import { Button } from "@/components/ui/button";
import { useTrackCollection } from "@/hooks/useTrackCollection";
import { formatTotalDuration } from "@/lib/format";
import { filterTracks } from "@/lib/textSearch";
import { artworkUrl } from "@/lib/tidalImage";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { PlaybackSource } from "@/store/queueStore";
import type {
  AlbumDetail,
  MediaType,
  MixSummary,
  PlaylistDetail,
} from "@/types/media";

interface MediaDetailViewProps {
  type: MediaType;
  idParamName: string;
  mixTypeParamName?: string;
}

interface DetailHeader {
  kind: string;
  title: string;
  cover?: string | null;
  subtitle: string;
  description?: string | null;
}

function subtitleParts(parts: Array<string | null | undefined>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

export function MediaDetailView({ type, idParamName, mixTypeParamName }: MediaDetailViewProps) {
  const params = useParams();
  const id = params[idParamName];
  const mixType = type === "mix" ? params[mixTypeParamName ?? "mixType"] : undefined;

  const enabled = id != null && (type !== "mix" || mixType != null);

  const metadataQuery = useQuery({
    queryKey: ["media-detail", type, mixType ?? "", id ?? ""],
    queryFn: async (): Promise<AlbumDetail | PlaylistDetail | MixSummary> => {
      if (!id) throw new Error("Missing id.");
      if (type === "album") {
        const result = await tidalCatalogService.getAlbumDetail(id);
        if (!result.success) throw new Error(result.error);
        return result.data;
      }
      if (type === "playlist") {
        const result = await tidalCatalogService.getPlaylistDetail(id);
        if (!result.success) throw new Error(result.error);
        return result.data;
      }
      if (!mixType) throw new Error("Missing mix type.");
      const result = await tidalCatalogService.getMixDetail(mixType, id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const location = useLocation();
  const source: PlaybackSource = {
    sourceType: type,
    sourceId: id ?? type,
    sourceTitle: metadataQuery.data?.title ?? null,
    sourcePath: location.pathname,
  };

  // Album / playlist / mix items paginate server-side; the shared collection hook
  // walks every page in the background, enriches nothing (the items endpoint
  // already embeds artwork) and builds the queue from the FULL list on Play.
  const collection = useTrackCollection({
    queryKey: ["media-tracks", type, mixType ?? "", id ?? ""],
    source,
    enabled,
    fetchPage: async (cursor) => {
      if (!id) return { success: false, error: "Missing id." };
      if (type === "album") return tidalCatalogService.getAlbumTracksPage(id, cursor);
      if (type === "playlist") return tidalCatalogService.getPlaylistTracksPage(id, cursor);
      if (!mixType) return { success: false, error: "Missing mix type." };
      return tidalCatalogService.getMixTracksPage(mixType, id, cursor);
    },
  });

  const header = useMemo((): DetailHeader | null => {
    const metadata = metadataQuery.data;
    if (!metadata) return null;
    if (type === "album") {
      const album = metadata as AlbumDetail;
      const artists = album.artists.map((artist) => artist.name).join(", ");
      return {
        kind: "Album",
        title: album.title,
        cover: album.cover,
        subtitle: subtitleParts([
          artists,
          album.numberOfItems > 0 ? `${album.numberOfItems} songs` : null,
          album.duration > 0 ? formatTotalDuration(album.duration) : null,
        ]),
      };
    }
    if (type === "playlist") {
      const playlist = metadata as PlaylistDetail;
      return {
        kind: "Playlist",
        title: playlist.title,
        cover: playlist.cover,
        description: playlist.description,
        subtitle: subtitleParts([
          playlist.numberOfItems > 0 ? `${playlist.numberOfItems} songs` : null,
          playlist.duration > 0 ? formatTotalDuration(playlist.duration) : null,
        ]),
      };
    }
    const mix = metadata as MixSummary;
    return {
      kind: "Mix",
      title: mix.title,
      cover: mix.cover,
      subtitle: subtitleParts([
        "TIDAL",
        mix.numberOfItems > 0 ? `${mix.numberOfItems} songs` : null,
      ]),
    };
  }, [metadataQuery.data, type]);

  // Only playlists the user made can be edited (and deleted, from the editor).
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => setIsEditing(false), [id]);
  const playlistDetail = type === "playlist" ? (metadataQuery.data as PlaylistDetail | undefined) : undefined;
  const isOwnPlaylist = playlistDetail?.playlistType === "USER";

  // Search inside this list. It covers the tracks loaded so far (all of them
  // once the background walk ends) and playing a match queues the matches.
  const [filterText, setFilterText] = useState("");
  useEffect(() => setFilterText(""), [id]);
  const isFiltering = filterText.trim() !== "";
  const filteredTracks = useMemo(
    () => (isFiltering ? filterTracks(collection.displayTracks, filterText) : []),
    [collection.displayTracks, filterText, isFiltering],
  );

  const cover = header?.cover ? artworkUrl(header.cover, 640) : undefined;
  const canPlay = collection.displayTracks.length > 0 && !collection.isPreparing;

  return (
    <div className="p-6">
      <header className="mb-6 flex items-end gap-4">
        {cover ? (
          <ZoomableImage
            src={cover}
            alt={`${header?.title ?? "Media"} artwork`}
            className="h-36 w-36 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Music className="size-8 text-muted-foreground" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {header?.kind ?? (metadataQuery.isLoading ? "Loading…" : "Not found")}
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{header?.title ?? "—"}</h1>
            {isOwnPlaylist && (
              <button
                type="button"
                title="Edit playlist"
                aria-label="Edit playlist"
                data-testid="edit-playlist"
                onClick={() => setIsEditing(true)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{header?.subtitle ?? ""}</p>
          {header?.description && (
            <p
              className="mt-1.5 line-clamp-3 max-w-2xl text-sm whitespace-pre-line text-muted-foreground"
              title={header.description}
              data-testid="playlist-description"
            >
              {header.description}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <Button onClick={() => void collection.startPlayback(false)} disabled={!canPlay}>
              {collection.isPreparing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
              {collection.isPreparing ? "Loading…" : "Play"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void collection.startPlayback(true)}
              disabled={!canPlay}
            >
              {collection.isPreparing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Shuffle className="size-4" aria-hidden />
              )}
              {collection.isPreparing ? "Loading…" : "Shuffle"}
            </Button>
          </div>
        </div>
      </header>

      {playlistDetail && isOwnPlaylist && (
        <PlaylistEditDialog playlist={playlistDetail} isOpen={isEditing} onClose={() => setIsEditing(false)} />
      )}

      {metadataQuery.isError && (
        <p role="alert" className="py-4 text-sm text-destructive">
          {metadataQuery.error.message}
        </p>
      )}

      {collection.loadError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          Couldn't start playback: {collection.loadError}
        </p>
      )}

      {collection.status === "pending" && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}

      {collection.status === "error" && collection.displayTracks.length === 0 && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {collection.error?.message}
        </p>
      )}

      {collection.displayTracks.length > 0 && (
        <div className="flex flex-col">
          <div className="relative mb-3 max-w-sm">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setFilterText("")}
              placeholder={`Search in this ${header?.kind.toLowerCase() ?? "list"}`}
              aria-label="Search in this list"
              data-testid="list-filter"
              className="h-9 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus-visible:border-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {isFiltering && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setFilterText("")}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          {isFiltering ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground" data-testid="list-filter-count">
                {filteredTracks.length === 1 ? "1 match" : `${filteredTracks.length} matches`}
                {collection.isComplete ? "" : " so far (still loading the list)"}
              </p>
              <TrackList tracks={filteredTracks} source={source} />
            </>
          ) : (
            <TrackList
              tracks={collection.visibleTracks}
              queueTracks={collection.displayTracks}
              source={source}
            />
          )}

          {collection.isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          )}

          {collection.status === "error" && (
            <p role="alert" className="py-4 text-center text-sm text-muted-foreground">
              Couldn't load more tracks.
            </p>
          )}
        </div>
      )}

      <div ref={collection.loadMoreRef} className="py-2" aria-hidden />

      {type === "album" && collection.displayTracks.length > 0 && (
        <AlbumCredits tracks={collection.displayTracks} isListComplete={collection.isComplete} />
      )}
    </div>
  );
}
