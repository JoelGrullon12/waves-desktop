import { useEffect } from "react";
import { artworkUrl } from "@/lib/tidalImage";
import { usePlayerStore } from "@/store/playerStore";
import type { RemoteState } from "@/types/player";

// How often the position is sent while nothing else changes; the phone moves
// its own progress bar in between.
const POSITION_PUBLISH_INTERVAL_MS = 5000;

function currentRemoteState(): RemoteState {
  const player = usePlayerStore.getState();
  const track = player.currentTrack;
  return {
    trackId: track ? String(track.id) : null,
    title: track?.title ?? null,
    artist: track ? track.artists.map((artist) => artist.name).join(", ") : null,
    album: track?.album?.title ?? null,
    artworkUrl: track?.album?.cover ? (artworkUrl(track.album.cover, 640) ?? null) : null,
    isPlaying: player.isPlaying,
    positionSeconds: player.position,
    durationSeconds: player.duration || track?.duration || 0,
    volume: player.volume,
  };
}

// Connects the player to the phone remote: runs the commands a phone sends
// and tells the phones what is playing.
export function useRemoteControlBridge(): void {
  useEffect(() => {
    const stopCommands = window.api.onRemoteCommand((command) => {
      const player = usePlayerStore.getState();
      if (command.type === "play" && !player.isPlaying) void player.togglePlay();
      else if (command.type === "pause" && player.isPlaying) void player.togglePlay();
      else if (command.type === "next") void player.next();
      else if (command.type === "previous") void player.previous();
      else if (command.type === "set_volume") player.setVolume(command.value);
      else if (command.type === "seek") void player.seek(command.value);
    });

    const publish = () => void window.api.publishRemoteState(currentRemoteState()).catch(() => {});
    // Track, play/pause and volume changes go out at once. A jump in position
    // (a seek) does too; ordinary progress waits for the interval below.
    const stopWatching = usePlayerStore.subscribe((state, previous) => {
      const changed =
        state.currentTrack !== previous.currentTrack ||
        state.isPlaying !== previous.isPlaying ||
        state.volume !== previous.volume ||
        state.duration !== previous.duration ||
        Math.abs(state.position - previous.position) > 2;
      if (changed) publish();
    });
    const timer = window.setInterval(() => {
      if (usePlayerStore.getState().isPlaying) publish();
    }, POSITION_PUBLISH_INTERVAL_MS);
    publish();

    return () => {
      stopCommands();
      stopWatching();
      window.clearInterval(timer);
    };
  }, []);
}
