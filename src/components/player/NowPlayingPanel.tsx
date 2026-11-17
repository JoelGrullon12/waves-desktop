import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Music } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ZoomableImage } from "@/components/media/ZoomableImage";
import { playCountLabel } from "@/hooks/useTopPlayedTracks";
import { errorMessage } from "@/lib/logger";
import { activeLineIndex, parseLrc } from "@/lib/lyrics";
import { artworkUrl } from "@/lib/tidalImage";
import { cn } from "@/lib/utils";
import { useIsCacheReady } from "@/store/cacheStore";
import { useIsLiked } from "@/store/likedStore";
import { usePlayerStore } from "@/store/playerStore";
import { useQueueStore } from "@/store/queueStore";
import type { Track, TrackCredit } from "@/types/track";

type PanelTab = "info" | "lyrics";

// Lyrics and credits rarely change; a track heard again reuses them.
const DETAIL_STALE_MS = 60 * 60 * 1000;

const TAB_LABELS: Record<PanelTab, string> = { info: "Info", lyrics: "Lyrics" };

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>;
}

// Credits grouped by role, in the order TIDAL lists them.
export function CreditsList({ credits, onNavigate }: { credits: TrackCredit[]; onNavigate?: () => void }) {
  const byRole = useMemo(() => {
    const groups = new Map<string, TrackCredit[]>();
    for (const credit of credits) {
      const group = groups.get(credit.role) ?? [];
      if (!group.some((existing) => existing.name === credit.name)) group.push(credit);
      groups.set(credit.role, group);
    }
    return [...groups];
  }, [credits]);

  return (
    <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm" data-testid="credits-list">
      {byRole.map(([role, people]) => (
        <div key={role} className="contents">
          <dt className="truncate text-muted-foreground">{role}</dt>
          <dd className="min-w-0">
            {people.map((person, position) => (
              <span key={person.name}>
                {position > 0 && ", "}
                {person.artistId ? (
                  <Link to={`/artists/${person.artistId}`} className="hover:underline" onClick={onNavigate}>
                    {person.name}
                  </Link>
                ) : (
                  person.name
                )}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TrackInfo({ track, onNavigate }: { track: Track; onNavigate: () => void }) {
  const isCacheReady = useIsCacheReady();
  const isLiked = useIsLiked(track.id);
  const playCountQuery = useQuery({
    queryKey: ["play-counts", [track.id]],
    queryFn: () => window.api.getPlayCounts([track.id]),
    staleTime: 0,
  });
  const membershipQuery = useQuery({
    queryKey: ["cache-memberships", track.id],
    queryFn: () => window.api.getCacheMemberships([track.id]),
    enabled: isCacheReady,
  });
  const creditsQuery = useQuery({
    queryKey: ["track-credits", track.id],
    queryFn: () => window.api.getTrackCredits(track.id),
    staleTime: DETAIL_STALE_MS,
    retry: false,
  });
  const playlists = membershipQuery.data?.[track.id]?.playlists ?? [];
  const playCount = playCountQuery.data?.[track.id] ?? 0;

  return (
    <div className="flex flex-col gap-6" data-testid="now-playing-info">
      <section>
        <SectionTitle>Your listening</SectionTitle>
        <p className="text-sm" data-testid="now-playing-play-count">
          {playCountLabel(playCount)}
          {isLiked ? " · In your liked songs" : ""}
        </p>
      </section>

      <section>
        <SectionTitle>In your playlists</SectionTitle>
        {!isCacheReady ? (
          <p className="text-sm text-muted-foreground">
            Turn on the local library copy in{" "}
            <Link to="/settings" className="text-primary hover:underline" onClick={onNavigate}>
              Settings
            </Link>{" "}
            to see which playlists have this track.
          </p>
        ) : playlists.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not in any of your playlists.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid="now-playing-playlists">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <Link
                  to={`/playlists/${playlist.id}`}
                  onClick={onNavigate}
                  className="inline-block rounded-full border px-2.5 py-0.5 text-sm hover:bg-muted"
                >
                  {playlist.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Credits</SectionTitle>
        {creditsQuery.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        {creditsQuery.isError && (
          <p className="text-sm text-muted-foreground">Could not load the credits: {errorMessage(creditsQuery.error)}</p>
        )}
        {creditsQuery.data && creditsQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground">TIDAL has no credits for this track.</p>
        )}
        {creditsQuery.data && creditsQuery.data.length > 0 && (
          <CreditsList credits={creditsQuery.data} onNavigate={onNavigate} />
        )}
      </section>
    </div>
  );
}

function Lyrics({ track }: { track: Track }) {
  const position = usePlayerStore((state) => state.position);
  const seek = usePlayerStore((state) => state.seek);
  const lyricsQuery = useQuery({
    queryKey: ["track-lyrics", track.id],
    queryFn: () => window.api.getTrackLyrics(track.id),
    staleTime: DETAIL_STALE_MS,
    retry: false,
  });
  const lyrics = lyricsQuery.data ?? null;
  const syncedLines = useMemo(() => (lyrics?.lrcText ? parseLrc(lyrics.lrcText) : []), [lyrics]);
  const activeIndex = activeLineIndex(syncedLines, position);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Keeps the line being sung in the middle, unless the user scrolled away
  // recently to read ahead.
  const lastManualScrollRef = useRef(0);
  useEffect(() => {
    const line = activeLineRef.current;
    const container = containerRef.current;
    if (!line || !container || Date.now() - lastManualScrollRef.current < 4000) return;
    container.scrollTo({ top: line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2, behavior: "smooth" });
  }, [activeIndex]);

  if (lyricsQuery.isPending) {
    return <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />;
  }
  if (lyricsQuery.isError) {
    return <p className="text-sm text-muted-foreground">Could not load the lyrics: {errorMessage(lyricsQuery.error)}</p>;
  }
  if (!lyrics) {
    return <p className="text-sm text-muted-foreground" data-testid="no-lyrics">No lyrics for this track.</p>;
  }

  return (
    <div
      ref={containerRef}
      dir={lyrics.isRightToLeft ? "rtl" : "ltr"}
      onWheel={() => (lastManualScrollRef.current = Date.now())}
      className="relative min-h-0 flex-1 overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]"
      data-testid="lyrics"
    >
      {syncedLines.length > 0 ? (
        <div className="flex flex-col gap-1 py-[30vh]">
          {syncedLines.map((line, index) => (
            <button
              key={`${line.timeSeconds}-${index}`}
              ref={index === activeIndex ? activeLineRef : undefined}
              type="button"
              data-active={index === activeIndex}
              title="Play from this line"
              onClick={() => void seek(line.timeSeconds)}
              className={cn(
                "rounded-md px-2 py-1 text-start text-2xl leading-snug font-bold transition-colors",
                index === activeIndex
                  ? "text-foreground"
                  : index < activeIndex
                    ? "text-muted-foreground/60 hover:text-foreground"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              {line.text || "♪"}
            </button>
          ))}
        </div>
      ) : (
        <p className="py-4 text-xl leading-relaxed font-semibold whitespace-pre-line">{lyrics.text}</p>
      )}
      {lyrics.provider && (
        <p className="pb-4 text-xs text-muted-foreground">Lyrics by {lyrics.provider.toLowerCase()}</p>
      )}
    </div>
  );
}

// Full-screen view of the playing track, opened by clicking the player bar:
// large artwork, links to the album and every artist, the user's own data
// (plays, playlists), credits, and the lyrics, which follow the song. The
// queue opens beside it.
export function NowPlayingPanel() {
  const isOpen = usePlayerStore((state) => state.isNowPlayingOpen);
  const setOpen = usePlayerStore((state) => state.setNowPlayingOpen);
  const isQueueOpen = usePlayerStore((state) => state.isQueueOpen);
  const track = usePlayerStore((state) => state.currentTrack);
  const source = useQueueStore((state) => state.source);
  const [tab, setTab] = useState<PanelTab>("info");

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, setOpen]);

  if (!isOpen || !track) return null;
  const close = () => setOpen(false);
  const cover = track.album?.cover ? artworkUrl(track.album.cover, 640) : undefined;

  return (
    <section
      aria-label="Now playing"
      data-testid="now-playing"
      className={cn(
        "absolute inset-0 z-10 flex overflow-hidden bg-background animate-in fade-in slide-in-from-bottom-6 duration-300",
        isQueueOpen && "pr-80",
      )}
    >
      {cover && (
        <img
          src={cover}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-20 blur-3xl"
        />
      )}
      <div className="relative flex min-w-0 flex-1 gap-8 p-8 max-lg:flex-col max-lg:overflow-y-auto">
        <div className="flex w-full max-w-sm shrink-0 flex-col gap-4">
          <button
            type="button"
            onClick={close}
            className="flex w-fit items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="size-4" aria-hidden />
            Close
          </button>
          {cover ? (
            <ZoomableImage
              src={cover}
              alt={`${track.album?.title ?? "Album"} artwork`}
              className="aspect-square w-full rounded-xl object-cover shadow-2xl"
              buttonClassName="w-full rounded-xl"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-muted">
              <Music className="size-12 text-muted-foreground" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-2xl leading-tight font-bold" data-testid="now-playing-title">
              {track.title}
            </h2>
            <p className="mt-1 text-base">
              {track.artists.map((artist, position) => (
                <span key={artist.id}>
                  {position > 0 && ", "}
                  <Link to={`/artists/${artist.id}`} className="hover:underline" onClick={close}>
                    {artist.name}
                  </Link>
                </span>
              ))}
            </p>
            {track.album && (
              <p className="mt-1 text-sm text-muted-foreground">
                {track.album.id ? (
                  <Link to={`/albums/${track.album.id}`} className="hover:text-foreground hover:underline" onClick={close}>
                    {track.album.title}
                  </Link>
                ) : (
                  track.album.title
                )}
              </p>
            )}
            {source?.sourceTitle && (
              <p className="mt-3 text-xs text-muted-foreground">
                Playing from{" "}
                {source.sourcePath ? (
                  <Link to={source.sourcePath} className="font-medium text-foreground hover:underline" onClick={close}>
                    {source.sourceTitle}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{source.sourceTitle}</span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div role="tablist" aria-label="Track details" className="mb-5 inline-flex w-fit rounded-lg bg-muted p-0.5">
            {(Object.keys(TAB_LABELS) as PanelTab[]).map((choice) => (
              <button
                key={choice}
                type="button"
                role="tab"
                aria-selected={tab === choice}
                onClick={() => setTab(choice)}
                className={cn(
                  "rounded-md px-4 py-1 text-sm font-medium transition-colors",
                  tab === choice ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {TAB_LABELS[choice]}
              </button>
            ))}
          </div>
          {tab === "info" ? (
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
              <TrackInfo track={track} onNavigate={close} />
            </div>
          ) : (
            <Lyrics track={track} />
          )}
        </div>
      </div>
    </section>
  );
}
