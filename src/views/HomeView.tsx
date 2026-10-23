import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { HorizontalScroll } from "@/components/media/HorizontalScroll";
import { MediaCard } from "@/components/media/MediaCard";
import { errorMessage, logToTerminal } from "@/lib/logger";
import { playMedia } from "@/lib/mediaPlayback";
import { randomSubset } from "@/lib/random";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import type { AlbumSummary, MediaSummary, MixSummary, PlaylistSummary } from "@/types/media";

const HOME_LIBRARY_CARDS = 10;
const HOME_RECOMMENDATION_FALLBACK_LIMIT = 10;
const HOME_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
} as const;

function playlistSubtitle(playlist: PlaylistSummary): string {
  const playlistType = (playlist.playlistType ?? "").toUpperCase();
  if (playlistType.includes("EDITORIAL") || playlistType.includes("TIDAL")) return "TIDAL";
  if (playlist.numberOfItems > 0) {
    return `${playlist.numberOfItems} ${playlist.numberOfItems === 1 ? "track" : "tracks"}`;
  }
  return "Playlist";
}

function playlistHasType(playlist: PlaylistSummary, types: string[]): boolean {
  const playlistType = (playlist.playlistType ?? "").toUpperCase();
  return types.some((type) => playlistType.includes(type));
}

function dedupeMedia(cards: MediaSummary[]): MediaSummary[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function playlistToMedia(playlist: PlaylistSummary): MediaSummary {
  return {
    id: playlist.id,
    type: "playlist",
    title: playlist.title,
    subtitle: playlistSubtitle(playlist),
    cover: playlist.cover,
    numberOfItems: playlist.numberOfItems,
  };
}

function albumToMedia(album: AlbumSummary): MediaSummary {
  const artistNames = album.artists.map((artist) => artist.name).join(", ");
  return {
    id: album.id,
    type: "album",
    title: album.title,
    subtitle: artistNames || "Album",
    cover: album.cover,
    numberOfItems: album.numberOfItems,
    releaseDate: album.releaseDate ?? undefined,
  };
}

function mixToMedia(mix: MixSummary): MediaSummary {
  return {
    id: mix.id,
    type: "mix",
    mixType: mix.mixType,
    title: mix.title,
    subtitle: "TIDAL",
    cover: mix.cover,
    numberOfItems: mix.numberOfItems,
  };
}

interface HomeSectionProps {
  title: string;
  isLoading: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyText?: string;
  // Horizontal rows render their own title (next to the scroll arrows) once the
  // content is shown, so the section only prints the title while loading,
  // errored or empty. Vertical sections keep the title always.
  titleInContent?: boolean;
  children: ReactNode;
}

function HomeSection({
  title,
  isLoading,
  error,
  isEmpty,
  emptyText,
  titleInContent = false,
  children,
}: HomeSectionProps) {
  const showContent = !isLoading && !error && !isEmpty;
  return (
    <section className="mb-8">
      {(!showContent || titleInContent) && <h2 className="mb-2 text-lg font-bold">{title}</h2>}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}
      {!isLoading && error && (
        <p role="alert" className="py-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!isLoading && !error && isEmpty && (
        <p className="py-4 text-sm text-muted-foreground">{emptyText ?? "Nothing here yet."}</p>
      )}
      {showContent && children}
    </section>
  );
}

export function HomeView() {
  const navigate = useNavigate();
  const [playError, setPlayError] = useState<string | null>(null);

  const playlistsQuery = useQuery({
    queryKey: ["user-playlists"],
    queryFn: async (): Promise<PlaylistSummary[]> => {
      const result = await tidalCatalogService.getUserPlaylists();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    ...HOME_QUERY_OPTIONS,
  });

  const discoveryMixesQuery = useQuery({
    queryKey: ["discovery-mixes"],
    queryFn: async (): Promise<MixSummary[]> => {
      const result = await tidalCatalogService.getMixes("discoveryMixes");
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    ...HOME_QUERY_OPTIONS,
  });

  const recentAlbumsQuery = useQuery({
    queryKey: ["recent-albums"],
    queryFn: async (): Promise<AlbumSummary[]> => {
      const result = await tidalCatalogService.getRecentAlbums();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    ...HOME_QUERY_OPTIONS,
  });

  const myMixesQuery = useQuery({
    queryKey: ["my-mixes"],
    queryFn: async (): Promise<MixSummary[]> => {
      const result = await tidalCatalogService.getMixes("myMixes");
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    ...HOME_QUERY_OPTIONS,
  });

  const libraryCards = useMemo(
    () => randomSubset((playlistsQuery.data ?? []).map(playlistToMedia), HOME_LIBRARY_CARDS),
    [playlistsQuery.data],
  );
  const recentAlbumCards = useMemo(
    () => (recentAlbumsQuery.data ?? []).map(albumToMedia),
    [recentAlbumsQuery.data],
  );
  // The personalized mix endpoints (userRecommendations) often come back empty,
  // so the single "TIDAL Mixes" section merges both sources (discovery + my
  // mixes) and, per empty source, falls back to playlists already loaded from
  // the user's collection discriminated by playlistType (EDITORIAL / MIX).
  const discoveryMixes = discoveryMixesQuery.data ?? [];
  const myMixes = myMixesQuery.data ?? [];
  const recommendationCards = useMemo(() => {
    const apiCards = dedupeMedia([
      ...discoveryMixes.map(mixToMedia),
      ...myMixes.map(mixToMedia),
    ]);
    if (apiCards.length > 0) return apiCards;
    const fallbackCards = dedupeMedia(
      (playlistsQuery.data ?? [])
        .filter((playlist) => playlistHasType(playlist, ["EDITORIAL", "MIX"]))
        .map(playlistToMedia),
    );
    return fallbackCards.slice(0, HOME_RECOMMENDATION_FALLBACK_LIMIT);
  }, [discoveryMixes, myMixes, playlistsQuery.data]);

  const recommendationLoading =
    discoveryMixesQuery.isLoading ||
    myMixesQuery.isLoading ||
    (discoveryMixes.length === 0 && myMixes.length === 0 && playlistsQuery.isLoading);
  const recommendationError =
    recommendationCards.length > 0
      ? null
      : (discoveryMixesQuery.error ?? myMixesQuery.error ?? playlistsQuery.error)?.message ?? null;

  const openMedia = (media: MediaSummary): void => {
    if (media.type === "album") {
      navigate(`/albums/${media.id}`);
      return;
    }
    if (media.type === "playlist") {
      navigate(`/playlists/${media.id}`);
      return;
    }
    navigate(`/mixes/${media.mixType ?? "playlists"}/${media.id}`);
  };

  const startPlayback = async (media: MediaSummary, shuffle: boolean): Promise<void> => {
    setPlayError(null);
    try {
      await playMedia(media, shuffle);
    } catch (error) {
      const message = errorMessage(error);
      logToTerminal("error", `home playback failed: ${message}`);
      setPlayError(message);
    }
  };

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Home</h1>
        {playError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Couldn't start playback: {playError}
          </p>
        )}
      </header>

      <HomeSection
        title="Your library"
        isLoading={playlistsQuery.isLoading}
        error={playlistsQuery.error ? playlistsQuery.error.message : null}
        isEmpty={libraryCards.length === 0}
        emptyText="Save playlists to see them here."
      >
        <HorizontalScroll title="Your library">
          {libraryCards.map((media) => (
            <MediaCard
              key={media.id}
              media={media}
              onOpen={openMedia}
              onPlay={(item) => startPlayback(item, false)}
              onShuffle={(item) => startPlayback(item, true)}
            />
          ))}
        </HorizontalScroll>
      </HomeSection>

      <HomeSection
        title="TIDAL Mixes"
        isLoading={recommendationLoading}
        error={recommendationError}
        isEmpty={recommendationCards.length === 0}
        emptyText="No TIDAL recommendations available yet."
      >
        <HorizontalScroll title="TIDAL Mixes">
          {recommendationCards.map((media) => (
            <MediaCard
              key={media.id}
              media={media}
              onOpen={openMedia}
              onPlay={(item) => startPlayback(item, false)}
              onShuffle={(item) => startPlayback(item, true)}
            />
          ))}
        </HorizontalScroll>
      </HomeSection>

      <HomeSection
        title="New Releases"
        isLoading={recentAlbumsQuery.isLoading}
        error={recentAlbumsQuery.error ? recentAlbumsQuery.error.message : null}
        isEmpty={recentAlbumCards.length === 0}
        emptyText="Follow artists to see their latest releases."
      >
        <HorizontalScroll title="New Releases">
          {recentAlbumCards.map((media) => (
            <MediaCard
              key={media.id}
              media={media}
              onOpen={openMedia}
              onPlay={(item) => startPlayback(item, false)}
              onShuffle={(item) => startPlayback(item, true)}
            />
          ))}
        </HorizontalScroll>
      </HomeSection>
    </div>
  );
}
