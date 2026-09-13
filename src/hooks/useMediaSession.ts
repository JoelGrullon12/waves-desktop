import { useEffect } from "react";
import { artworkUrl } from "@/lib/tidalImage";
import { usePlayerStore } from "@/store/playerStore";

function mediaSessionSupported(): boolean {
  return "mediaSession" in navigator && "MediaMetadata" in window;
}

// Bridges playback state to the OS media controls (keyboard media keys, OS
// lock screen / media panel). The handler references are empty by default and
// must be assigned so the browser shows the controls.
export function useMediaSession(): void {
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const position = usePlayerStore((state) => state.position);
  const duration = usePlayerStore((state) => state.duration);

  useEffect(() => {
    if (!mediaSessionSupported()) return;
    const store = usePlayerStore.getState();

    navigator.mediaSession.setActionHandler("play", () => void store.togglePlay());
    navigator.mediaSession.setActionHandler("pause", () => void store.togglePlay());
    navigator.mediaSession.setActionHandler("previoustrack", () => void store.previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => void store.next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) void store.seek(details.seekTime);
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, []);

  useEffect(() => {
    if (!mediaSessionSupported()) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }

    const artworkSrc = currentTrack.album?.cover
      ? artworkUrl(currentTrack.album.cover, 640)
      : undefined;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artists.map((artist) => artist.name).join(", "),
      album: currentTrack.album?.title ?? undefined,
      artwork: artworkSrc ? [{ src: artworkSrc, sizes: "640x640", type: "image/jpg" }] : [],
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!mediaSessionSupported() || !currentTrack) return;
    const total = duration || currentTrack.duration;
    if (total <= 0) return;
    navigator.mediaSession.setPositionState({
      duration: total,
      playbackRate: 1,
      position,
    });
  }, [position, duration, currentTrack]);
}