import { Dialog } from "@base-ui/react/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { useIsCacheReady } from "@/store/cacheStore";
import { usePlayerStore } from "@/store/playerStore";
import { usePlaylistDialogStore } from "@/store/playlistDialogStore";
import type { PlaylistSummary } from "@/types/media";

// Only playlists made by a user can be edited; editorial playlists and mixes
// saved to the library are read-only.
const EDITABLE_PLAYLIST_TYPE = "USER";

// Lets the user tick any number of playlists and adds the tracks to all of
// them with one "Add".
export function AddToPlaylistsDialog() {
  const tracks = usePlaylistDialogStore((state) => state.tracks);
  const close = usePlaylistDialogStore((state) => state.close);
  const showNotice = usePlayerStore((state) => state.showNotice);
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  const isOpen = tracks !== null;

  const playlistsQuery = useQuery({
    queryKey: ["user-playlists"],
    queryFn: async (): Promise<PlaylistSummary[]> => {
      const result = await tidalCatalogService.getUserPlaylists();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: isOpen,
    // Shown from the cache at once and refreshed on every opening, so a
    // playlist created a moment ago (here or in another TIDAL app) is listed.
    staleTime: 0,
  });

  // Playlists that already hold every one of the tracks, known only with the
  // local copy of the library. They are shown ticked and can not be picked,
  // so a track is not added twice by accident.
  const isCacheReady = useIsCacheReady();
  const trackIdsKey = useMemo(() => (tracks ?? []).map((track) => track.id), [tracks]);
  const membershipsQuery = useQuery({
    queryKey: ["cache-memberships", trackIdsKey],
    queryFn: () => window.api.getCacheMemberships(trackIdsKey),
    enabled: isOpen && isCacheReady && trackIdsKey.length > 0,
    staleTime: 0,
  });
  const containingIds = useMemo(() => {
    const memberships = Object.values(membershipsQuery.data ?? {});
    if (memberships.length === 0) return new Set<string>();
    const [first, ...rest] = memberships.map(
      (membership) => new Set(membership.playlists.map((playlist) => playlist.id)),
    );
    return new Set([...first].filter((playlistId) => rest.every((ids) => ids.has(playlistId))));
  }, [membershipsQuery.data]);

  // Every opening starts clean: nothing ticked, no leftover errors.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    setFilter("");
    setFailures([]);
  }, [isOpen, tracks]);

  const editablePlaylists = useMemo(
    () =>
      (playlistsQuery.data ?? []).filter(
        (playlist) => playlist.playlistType === EDITABLE_PLAYLIST_TYPE,
      ),
    [playlistsQuery.data],
  );
  const visiblePlaylists = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return editablePlaylists;
    return editablePlaylists.filter((playlist) => playlist.title.toLowerCase().includes(needle));
  }, [editablePlaylists, filter]);

  const togglePlaylist = (playlistId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(playlistId)) next.delete(playlistId);
      else next.add(playlistId);
      return next;
    });
  };

  const addToSelected = async () => {
    if (!tracks || selectedIds.size === 0) return;
    setIsAdding(true);
    setFailures([]);
    const trackIds = tracks.map((track) => track.id);
    const failed: string[] = [];
    const succeededIds: string[] = [];
    // One playlist at a time: TIDAL rate-limits bursts of writes.
    for (const playlist of editablePlaylists) {
      if (!selectedIds.has(playlist.id)) continue;
      const result = await tidalCatalogService.addTracksToPlaylist(playlist.id, trackIds);
      if (result.success) succeededIds.push(playlist.id);
      else failed.push(playlist.title);
    }
    setIsAdding(false);

    if (succeededIds.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["user-playlists"] });
      for (const playlistId of succeededIds) {
        void queryClient.invalidateQueries({ queryKey: ["media-detail", "playlist", "", playlistId] });
        void queryClient.invalidateQueries({ queryKey: ["media-tracks", "playlist", "", playlistId] });
      }
    }
    if (failed.length > 0) {
      // Keep the dialog open with only the failed playlists ticked, to retry.
      setFailures(failed);
      setSelectedIds(
        new Set(
          editablePlaylists
            .filter((playlist) => failed.includes(playlist.title))
            .map((playlist) => playlist.id),
        ),
      );
      return;
    }
    const what = tracks.length === 1 ? `"${tracks[0].title}"` : `${tracks.length} tracks`;
    const where =
      succeededIds.length === 1 ? "1 playlist" : `${succeededIds.length} playlists`;
    showNotice(`Added ${what} to ${where}`);
    close();
  };

  const heading =
    tracks && tracks.length === 1 ? `Add "${tracks[0].title}" to playlists` : "Add to playlists";

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && !isAdding && close()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup
          data-testid="add-to-playlists-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none"
        >
          <div className="border-b border-border px-4 py-3">
            <Dialog.Title className="truncate text-sm font-semibold">{heading}</Dialog.Title>
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter playlists"
              aria-label="Filter playlists"
              className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {playlistsQuery.isPending && (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              </div>
            )}
            {playlistsQuery.isError && (
              <p role="alert" className="px-2 py-6 text-center text-sm text-destructive">
                Could not load your playlists: {playlistsQuery.error.message}
              </p>
            )}
            {playlistsQuery.isSuccess && visiblePlaylists.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {editablePlaylists.length === 0
                  ? "You have no playlists of your own yet."
                  : "No playlist matches the filter."}
              </p>
            )}
            {visiblePlaylists.map((playlist) => (
              <label
                key={playlist.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(playlist.id) || containingIds.has(playlist.id)}
                  onChange={() => togglePlaylist(playlist.id)}
                  disabled={isAdding || containingIds.has(playlist.id)}
                  className="size-4 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate">{playlist.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {containingIds.has(playlist.id) ? "Already added" : playlist.numberOfItems}
                </span>
              </label>
            ))}
          </div>

          {failures.length > 0 && (
            <p role="alert" className="border-t border-border px-4 py-2 text-xs text-destructive">
              Could not add to: {failures.join(", ")}. They are still ticked so you can retry.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {selectedIds.size === 0
                ? "No playlist selected"
                : `${selectedIds.size} selected`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={close} disabled={isAdding}>
                Cancel
              </Button>
              <Button onClick={() => void addToSelected()} disabled={selectedIds.size === 0 || isAdding}>
                {isAdding && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Add
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
