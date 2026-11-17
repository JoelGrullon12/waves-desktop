import {
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Link } from "react-router";
import { ZoomableImage } from "@/components/media/ZoomableImage";
import { ArtistLinks } from "@/components/tracks/ArtistLinks";
import { TrackContextMenu } from "@/components/tracks/TrackContextMenu";
import { Button } from "@/components/ui/button";
import { formatAudioFormat, formatDuration } from "@/lib/format";
import type { RepeatMode } from "@/lib/queueOrder";
import { artworkUrl } from "@/lib/tidalImage";
import { useIsLiked, useLikedStore } from "@/store/likedStore";
import { usePlayerStore } from "@/store/playerStore";
import { useQueueStore } from "@/store/queueStore";

// A filled circle behind an active toggle: the icon alone (bold or not) is
// hard to tell apart.
const ACTIVE_TOGGLE_CLASS = "rounded-full bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary";

const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: "Repeat is off",
  "one-once": "Repeat this track once",
  one: "Repeat this track",
  all: "Repeat the queue",
};

function RepeatButton() {
  const repeatMode = useQueueStore((state) => state.repeatMode);
  const cycleRepeatMode = usePlayerStore((state) => state.cycleRepeatMode);
  const isActive = repeatMode !== "off";
  const repeatsOneTrack = repeatMode === "one" || repeatMode === "one-once";
  const Icon = repeatsOneTrack ? Repeat1 : Repeat;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleRepeatMode}
      aria-label={REPEAT_LABELS[repeatMode]}
      title={REPEAT_LABELS[repeatMode]}
      data-repeat-mode={repeatMode}
      className={`relative rounded-full ${isActive ? ACTIVE_TOGGLE_CLASS : "text-muted-foreground"}`}
    >
      <Icon className="size-4" aria-hidden />
      {/* Tells "one more time" apart from "until I say stop". */}
      {repeatMode === "one-once" && (
        <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-primary px-1 text-[0.55rem] leading-3 font-semibold text-primary-foreground">
          1×
        </span>
      )}
      {repeatMode === "one" && (
        <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-primary px-1 text-[0.55rem] leading-3 font-semibold text-primary-foreground">
          ∞
        </span>
      )}
    </Button>
  );
}

function LikeButton() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const showNotice = usePlayerStore((state) => state.showNotice);
  const isLiked = useIsLiked(currentTrack?.id ?? "");
  const setLiked = useLikedStore((state) => state.setLiked);
  if (!currentTrack) return null;

  const toggleLiked = async () => {
    const result = await setLiked(currentTrack, !isLiked);
    if (!result.success) showNotice(`Could not update your library: ${result.error}`);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => void toggleLiked()}
      aria-label={isLiked ? "Remove from library" : "Add to library"}
      title={isLiked ? "Remove from library" : "Add to library"}
      aria-pressed={isLiked}
      className="shrink-0"
    >
      <Heart
        className={`size-4 ${isLiked ? "fill-current text-primary" : "text-muted-foreground"}`}
        aria-hidden
      />
    </Button>
  );
}

// The list the queue came from (playlist, album, Songs...), linked to its view.
function PlayingFrom() {
  const source = useQueueStore((state) => state.source);
  if (!source?.sourceTitle) return null;
  return (
    <p className="truncate text-[0.7rem] text-muted-foreground/80" data-testid="player-source">
      Playing from{" "}
      {source.sourcePath ? (
        <Link to={source.sourcePath} className="hover:text-foreground hover:underline">
          {source.sourceTitle}
        </Link>
      ) : (
        source.sourceTitle
      )}
    </p>
  );
}

export function PlayerBar() {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);
  const volume = usePlayerStore((state) => state.volume);
  const audioFormat = usePlayerStore((state) => state.audioFormat);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const next = usePlayerStore((state) => state.next);
  const previous = usePlayerStore((state) => state.previous);
  const seek = usePlayerStore((state) => state.seek);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMute = usePlayerStore((state) => state.toggleMute);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const isQueueOpen = usePlayerStore((state) => state.isQueueOpen);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const shuffleEnabled = useQueueStore((state) => state.shuffleEnabled);

  const total = duration || currentTrack?.duration || 0;
  const artwork = currentTrack?.album?.cover
    ? artworkUrl(currentTrack.album.cover, 128)
    : undefined;
  const formatLabel = currentTrack ? formatAudioFormat(audioFormat) : null;
  const albumId = currentTrack?.album?.id;

  return (
    <footer className="flex h-20 shrink-0 items-center gap-4 border-t bg-background px-4">
      <div className="flex min-w-0 flex-1 basis-1/3 items-center gap-3">
        {currentTrack ? (
          <TrackContextMenu
            track={currentTrack}
            showPlay={false}
            className="flex min-w-0 items-center gap-3"
          >
            {artwork ? (
              <ZoomableImage
                src={artwork}
                alt={`${currentTrack.album?.title ?? "Album"} artwork`}
                className="h-12 w-12 rounded object-cover"
                buttonClassName="rounded"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded bg-muted" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground" data-testid="player-title">
                {albumId ? (
                  <Link to={`/albums/${albumId}`} className="hover:underline">
                    {currentTrack.title}
                  </Link>
                ) : (
                  currentTrack.title
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground" data-testid="player-artist">
                <ArtistLinks artists={currentTrack.artists} />
              </p>
              <PlayingFrom />
            </div>
            <LikeButton />
          </TrackContextMenu>
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
            <ListMusic className="size-5 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void toggleShuffle()}
            aria-label={shuffleEnabled ? "Shuffle is on" : "Shuffle is off"}
            title={shuffleEnabled ? "Shuffle is on" : "Shuffle is off"}
            aria-pressed={shuffleEnabled}
            className={`rounded-full ${shuffleEnabled ? ACTIVE_TOGGLE_CLASS : "text-muted-foreground"}`}
          >
            <Shuffle className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void previous()} aria-label="Previous">
            <SkipBack className="size-4" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            size="icon-lg"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="rounded-full"
            disabled={!currentTrack}
          >
            {isPlaying ? (
              <Pause className="size-5" aria-hidden />
            ) : (
              <Play className="ml-0.5 size-5" aria-hidden />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void next()} aria-label="Next">
            <SkipForward className="size-4" aria-hidden />
          </Button>
          <RepeatButton />
        </div>

        <div className="flex items-center gap-2">
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {formatDuration(position)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, total)}
            step={1}
            value={position}
            disabled={!currentTrack}
            aria-label="Seek"
            className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-muted accent-primary sm:w-56 lg:w-72"
            onChange={(event) => void seek(Number(event.target.value))}
          />
          <span className="w-10 text-xs tabular-nums text-muted-foreground">
            {formatDuration(total)}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 basis-1/3 items-center justify-end gap-2">
        {formatLabel && (
          <span
            className="hidden truncate rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-muted-foreground lg:inline"
            title="What TIDAL is streaming right now"
            data-testid="audio-format"
          >
            {formatLabel}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          aria-label={volume === 0 ? "Unmute" : "Mute"}
        >
          {volume === 0 ? (
            <VolumeX className="size-4" aria-hidden />
          ) : (
            <Volume2 className="size-4" aria-hidden />
          )}
        </Button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          aria-label="Volume"
          className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-muted accent-primary max-md:hidden"
          onChange={(event) => setVolume(Number(event.target.value))}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setQueueOpen(!isQueueOpen)}
          aria-label={isQueueOpen ? "Close queue" : "Open queue"}
          aria-pressed={isQueueOpen}
          className={isQueueOpen ? "text-primary" : undefined}
        >
          <ListMusic className="size-4" aria-hidden />
        </Button>
      </div>
    </footer>
  );
}
