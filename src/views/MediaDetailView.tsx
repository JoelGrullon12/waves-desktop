import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Music, Play, Shuffle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ZoomableImage } from "@/components/media/ZoomableImage";
import { TrackList } from "@/components/tracks/TrackList";
import { Button } from "@/components/ui/button";
import { useTrackCollection } from "@/hooks/useTrackCollection";
import { formatTotalDuration } from "@/lib/format";
import { artworkUrl } from "@/lib/tidalImage";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { PlaybackSource } from "@/store/queueStore";
import type {
  AlbumDetail,
  MediaType,
  MixSummary,
  PlaylistDetail,
  PlaylistSummary,
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
  const source: PlaybackSource = { sourceType: type, sourceId: id ?? type };

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

  // Deleting asks twice: the first click arms the button, the second deletes.
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteState, setDeleteState] = useState<"idle" | "armed" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    setDeleteState("idle");
    setDeleteError(null);
  }, [id]);
  const isOwnPlaylist =
    type === "playlist" && (metadataQuery.data as PlaylistDetail | undefined)?.playlistType === "USER";

  const deletePlaylist = async () => {
    if (!id) return;
    if (deleteState === "idle") {
      setDeleteState("armed");
      return;
    }
    setDeleteState("deleting");
    const result = await tidalCatalogService.deletePlaylist(id);
    if (!result.success) {
      setDeleteState("idle");
      setDeleteError(result.error);
      return;
    }
    queryClient.setQueryData<PlaylistSummary[]>(["user-playlists"], (current) =>
      current?.filter((playlist) => playlist.id !== id),
    );
    void navigate("/library");
  };

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
          <h1 className="truncate text-2xl font-bold">{header?.title ?? "—"}</h1>
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
            {isOwnPlaylist && (
              <Button
                variant={deleteState === "idle" ? "ghost" : "destructive"}
                onClick={() => void deletePlaylist()}
                onBlur={() => deleteState === "armed" && setDeleteState("idle")}
                disabled={deleteState === "deleting"}
              >
                {deleteState === "deleting" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                {deleteState === "idle" ? "Delete" : "Click again to delete"}
              </Button>
            )}
          </div>
        </div>
      </header>

      {deleteError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          Couldn't delete the playlist: {deleteError}
        </p>
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
          <TrackList
            tracks={collection.visibleTracks}
            queueTracks={collection.displayTracks}
            source={source}
          />

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
    </div>
  );
}
