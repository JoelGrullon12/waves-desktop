import { useQuery } from "@tanstack/react-query";
import { Loader2, Music, Play } from "lucide-react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { TrackList } from "@/components/tracks/TrackList";
import { artworkUrl } from "@/lib/tidalImage";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { usePlayerStore } from "@/store/playerStore";
import type { PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

export function AlbumView() {
  const { albumId } = useParams<{ albumId: string }>();
  const playQueue = usePlayerStore((state) => state.playQueue);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["album-tracks", albumId],
    queryFn: async (): Promise<Track[]> => {
      if (!albumId) throw new Error("Missing album id.");
      const result = await tidalCatalogService.getAlbumTracks(albumId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: albumId != null,
  });

  const source: PlaybackSource = { sourceType: "album", sourceId: albumId ?? "album" };
  const album = data?.[0]?.album ?? null;
  const artists = data?.[0]?.artists ?? [];
  const cover = album?.cover ? artworkUrl(album.cover, 320) : undefined;

  return (
    <div className="p-6">
      <header className="mb-6 flex items-end gap-4">
        {cover ? (
          <img src={cover} alt={`${album?.title ?? "Album"} artwork`} className="h-36 w-36 rounded-lg object-cover" />
        ) : (
          <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Music className="size-8 text-muted-foreground" aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Album</p>
          <h1 className="truncate text-2xl font-bold">{album?.title ?? "Album"}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {artists.map((artist) => artist.name).join(", ")}
            {data ? ` · ${data.length} tracks` : ""}
          </p>
          <div className="mt-3">
            <Button
              onClick={() => data && void playQueue(data, 0, source)}
              disabled={!data || data.length === 0}
            >
              <Play className="size-4" aria-hidden />
              Play
            </Button>
          </div>
        </div>
      </header>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}

      {isError && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {error.message}
        </p>
      )}

      {data && <TrackList tracks={data} source={source} />}
    </div>
  );
}