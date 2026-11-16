import { useQuery } from "@tanstack/react-query";
import { ListMusic, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { NavLink } from "react-router";
import { SortControl, useStoredSort } from "@/components/media/SortControl";
import { PLAYLIST_SORT_LABELS, isSortKeyOf, sortPlaylists } from "@/lib/librarySort";
import { PREFERENCE_KEYS } from "@/lib/preferences";
import { artworkUrl } from "@/lib/tidalImage";
import { cn } from "@/lib/utils";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { PlaylistSummary } from "@/types/media";

const isPlaylistSortKey = isSortKeyOf(PLAYLIST_SORT_LABELS);

// The user's playlists, filling the rest of the sidebar with their own scroll.
// When the sidebar is an icon rail only the covers are shown.
export function SidebarPlaylists({ isRail }: { isRail: boolean }) {
  const { sortKey, descending, setSort } = useStoredSort(
    PREFERENCE_KEYS.sidebarPlaylistSort,
    PREFERENCE_KEYS.sidebarPlaylistSortDescending,
    isPlaylistSortKey,
    "modified",
  );
  const playlistsQuery = useQuery({
    queryKey: ["user-playlists"],
    queryFn: async (): Promise<PlaylistSummary[]> => {
      const result = await tidalCatalogService.getUserPlaylists();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  const playlists = useMemo(
    () => sortPlaylists(playlistsQuery.data ?? [], sortKey, descending),
    [playlistsQuery.data, sortKey, descending],
  );
  // Below `lg` the sidebar is always a rail, whatever the user chose.
  const fullOnly = cn("max-lg:hidden", isRail && "hidden");

  return (
    <section
      className="mt-3 flex min-h-0 flex-1 flex-col border-t border-sidebar-border pt-2"
      aria-label="Playlists"
      data-testid="sidebar-playlists"
    >
      <div className={cn("flex items-center gap-2 px-3 pb-1.5", fullOnly)}>
        <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Playlists
        </h2>
        <SortControl
          listName="playlists"
          labels={PLAYLIST_SORT_LABELS}
          sortKey={sortKey}
          descending={descending}
          onChange={setSort}
          className="flex-1 justify-end"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
        {playlistsQuery.isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
        {playlistsQuery.isError && (
          <p role="alert" className={cn("px-1 py-2 text-xs text-destructive", fullOnly)}>
            Could not load your playlists.
          </p>
        )}
        {playlists.map((playlist) => {
          const cover = playlist.cover ? artworkUrl(playlist.cover, 160) : undefined;
          return (
            <NavLink
              key={playlist.id}
              to={`/playlists/${playlist.id}`}
              title={playlist.title}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/70",
                )
              }
            >
              {cover ? (
                <img src={cover} alt="" className="size-7 shrink-0 rounded object-cover" loading="lazy" />
              ) : (
                <span className="flex size-7 shrink-0 items-center justify-center rounded bg-muted">
                  <ListMusic className="size-3.5 text-muted-foreground" aria-hidden />
                </span>
              )}
              <span className={cn("min-w-0 flex-1 truncate", fullOnly)}>{playlist.title}</span>
              <span className={cn("shrink-0 text-xs tabular-nums text-muted-foreground", fullOnly)}>
                {playlist.numberOfItems}
              </span>
            </NavLink>
          );
        })}
      </div>
    </section>
  );
}
