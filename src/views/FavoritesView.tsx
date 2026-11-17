import { Loader2, Play, Shuffle } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { TrackList } from "@/components/tracks/TrackList";
import { Button } from "@/components/ui/button";
import { playCountLabels, useTopPlayedTracks } from "@/hooks/useTopPlayedTracks";
import {
  DEFAULT_FAVORITES_LIMIT,
  DEFAULT_FAVORITES_WINDOW_DAYS,
  MAX_FAVORITES_LIMIT,
  MAX_FAVORITES_WINDOW_DAYS,
  PREFERENCE_KEYS,
  readNumberPreference,
} from "@/lib/preferences";
import { usePlayerStore } from "@/store/playerStore";
import { usePreferencesStore } from "@/store/preferencesStore";

const FAVORITES_SOURCE = {
  sourceType: "stats",
  sourceId: "favorites",
  sourceTitle: "Favorites",
  sourcePath: "/favorites",
};

// A playlist that builds itself: the tracks played most on this app among
// those listened to recently. It only exists here; nothing is written to TIDAL.
export function FavoritesView() {
  const values = usePreferencesStore((state) => state.values);
  const playQueue = usePlayerStore((state) => state.playQueue);
  const limit = readNumberPreference(
    values,
    PREFERENCE_KEYS.favoritesLimit,
    DEFAULT_FAVORITES_LIMIT,
    1,
    MAX_FAVORITES_LIMIT,
  );
  const windowDays = readNumberPreference(
    values,
    PREFERENCE_KEYS.favoritesWindowDays,
    DEFAULT_FAVORITES_WINDOW_DAYS,
    1,
    MAX_FAVORITES_WINDOW_DAYS,
  );
  const favorites = useTopPlayedTracks(limit, windowDays);
  const tracks = favorites.data?.tracks ?? [];
  const details = useMemo(
    () => playCountLabels(favorites.data?.playCountById ?? new Map()),
    [favorites.data],
  );

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Favorites</h1>
        <p className="mt-0.5 text-sm text-muted-foreground" data-testid="favorites-summary">
          Your {limit} most played tracks among those heard in the last {windowDays}{" "}
          {windowDays === 1 ? "day" : "days"}.{" "}
          <Link to="/settings" className="underline underline-offset-4 hover:text-foreground">
            Change
          </Link>
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Button onClick={() => void playQueue(tracks, 0, FAVORITES_SOURCE)} disabled={tracks.length === 0}>
            <Play className="size-4" aria-hidden />
            Play
          </Button>
          <Button
            variant="ghost"
            onClick={() => void playQueue(tracks, 0, FAVORITES_SOURCE, { shuffle: true })}
            disabled={tracks.length === 0}
          >
            <Shuffle className="size-4" aria-hidden />
            Shuffle
          </Button>
        </div>
      </header>

      {favorites.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      )}
      {favorites.isError && (
        <p role="alert" className="py-8 text-center text-sm text-destructive">
          {favorites.error.message}
        </p>
      )}
      {favorites.isSuccess && tracks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing yet. Tracks appear here once you have listened to them long enough to count as a
          play.
        </p>
      )}
      {tracks.length > 0 && (
        <TrackList tracks={tracks} source={FAVORITES_SOURCE} detailByTrackId={details} />
      )}
    </div>
  );
}
