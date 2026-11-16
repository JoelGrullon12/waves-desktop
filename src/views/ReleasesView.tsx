import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Button } from "@/components/ui/button";
import { useMediaActions } from "@/hooks/useMediaActions";
import { albumToMedia } from "@/lib/mediaCards";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { AlbumSummary, MediaSummary } from "@/types/media";

// "March 2026" headings; albums are grouped by the month they came out.
function monthLabel(releaseDate: string | undefined): string {
  if (!releaseDate) return "Unknown date";
  const date = new Date(`${releaseDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Latest releases of the artists the user follows. TIDAL has no endpoint for
// it, so the main process asks each artist for their albums; the result is
// kept for a long time because that walk takes a while.
export function ReleasesView() {
  const { openMedia, startPlayback, playError } = useMediaActions();

  const releasesQuery = useQuery({
    queryKey: ["releases-feed"],
    queryFn: async (): Promise<AlbumSummary[]> => {
      const result = await tidalCatalogService.getReleasesFeed();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
  });

  const months = useMemo(() => {
    const groups: Array<{ label: string; items: MediaSummary[] }> = [];
    for (const album of releasesQuery.data ?? []) {
      const media = albumToMedia(album);
      const label = monthLabel(media.releaseDate);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(media);
      else groups.push({ label, items: [media] });
    }
    return groups;
  }, [releasesQuery.data]);

  return (
    <div className="p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">New releases</h1>
          <p className="text-sm text-muted-foreground">From the artists you follow, newest first.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void releasesQuery.refetch()}
          disabled={releasesQuery.isFetching}
        >
          <RefreshCw
            className={`size-4 ${releasesQuery.isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </Button>
      </header>

      {playError && (
        <p role="alert" className="pb-4 text-sm text-destructive">
          Couldn't start playback: {playError}
        </p>
      )}
      {releasesQuery.isLoading && (
        <div className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          Checking each artist you follow…
        </div>
      )}
      {releasesQuery.isError && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {releasesQuery.error.message}
        </p>
      )}
      {releasesQuery.isSuccess && months.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Follow artists on TIDAL to see their latest releases here.
        </p>
      )}

      {months.map((month) => (
        <section key={month.label} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {month.label}
          </h2>
          <MediaGrid items={month.items} onOpen={openMedia} onPlay={startPlayback} />
        </section>
      ))}
    </div>
  );
}
