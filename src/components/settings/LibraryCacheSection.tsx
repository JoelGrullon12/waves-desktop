import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCacheStore } from "@/store/cacheStore";

// Switch and state of the local copy of the library.
export function LibraryCacheSection() {
  const status = useCacheStore((state) => state.status);
  const setEnabled = useCacheStore((state) => state.setEnabled);
  const refresh = useCacheStore((state) => state.refresh);

  return (
    <section className="rounded-lg border p-5">
      <h2 className="text-base font-semibold">Local library copy</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Keeps the titles, artists and artwork addresses of your liked songs and playlists on this
        computer. Lists open at once, and searching your collection also covers your playlists and
        shows which ones each track is in. Copying a large library takes a few minutes and is
        repeated every time the app starts.
      </p>
      {status && (
        <div className="mt-3 flex flex-col gap-2 text-sm" data-testid="cache-status">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={status.isEnabled ? "outline" : "default"}
              onClick={() => void setEnabled(!status.isEnabled)}
            >
              {status.isEnabled ? "Turn off" : "Turn on"}
            </Button>
            {status.isEnabled && (
              <Button
                variant="outline"
                onClick={() => void refresh()}
                disabled={status.isRefreshing}
              >
                {status.isRefreshing && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Refresh now
              </Button>
            )}
          </div>
          {status.isRefreshing && (
            <p className="text-muted-foreground">Copying: {status.progress ?? "starting…"}</p>
          )}
          {status.isEnabled && status.refreshedAt && (
            <p className="text-muted-foreground">
              {status.trackCount} tracks from {status.likedTrackCount} liked songs and{" "}
              {status.playlistCount} playlists · refreshed{" "}
              {new Date(status.refreshedAt).toLocaleString()}
            </p>
          )}
          {status.error && (
            <p role="alert" className="text-destructive">
              The last refresh failed: {status.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
