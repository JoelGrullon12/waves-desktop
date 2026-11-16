import { create } from "zustand";
import { errorMessage, logToTerminal } from "@/lib/logger";
import { canSkipAnother, isPlayInterruption, isSkippableError } from "@/lib/playbackErrors";
import {
  playbackService,
  type AudioFormat,
  type PlaybackServiceClient,
  type PlaybackState,
} from "@/services/playbackService";
import { SeekCoordinator, clampSeekPosition } from "@/lib/seekCoordinator";
import { useQueueStore, type PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

const DEFAULT_VOLUME = 80;
const PREVIOUS_RESTART_THRESHOLD_S = 3;
const NOTICE_DURATION_MS = 4000;

interface PlayerStore {
  isInitialized: boolean;
  isPlaying: boolean;
  playbackState: PlaybackState | null;
  currentTrack: Track | null;
  position: number;
  duration: number;
  // What is actually being streamed (quality, bit depth...), for the player bar.
  audioFormat: AudioFormat | null;
  volume: number;
  volumeBeforeMute: number;
  error: string | null;
  notice: string | null;
  isQueueOpen: boolean;
  init: () => void;
  playQueue: (tracks: Track[], startIndex: number, source: PlaybackSource) => Promise<void>;
  playTrackAt: (index: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setVolume: (level: number) => void;
  toggleMute: () => void;
  removeFromQueue: (index: number) => Promise<void>;
  stopAndReset: () => Promise<void>;
  setQueueOpen: (open: boolean) => void;
}

// Tells the engine which track follows the current one, so it can move on to it
// without a gap when the current track ends.
function scheduleNextTrack(): void {
  const queue = useQueueStore.getState();
  const nextIndex = queue.nextIndex();
  const nextTrack = nextIndex != null ? queue.getTrackAt(nextIndex) : null;
  // A track that can not be queued is not a problem yet: when the current one
  // ends, the store starts it explicitly and handles the failure there.
  playbackService
    .setNext(nextTrack ? String(nextTrack.id) : null)
    .catch((error) => logToTerminal("error", `setNext failed: ${errorMessage(error)}`));
}

// Where in the queue the track that just started is. The same track can be in
// the queue more than once, so the positions playback is expected at win.
function findQueueIndex(trackId: string): number | null {
  const queue = useQueueStore.getState();
  const isAt = (index: number | null): index is number =>
    index != null && String(queue.tracks[index]?.id) === trackId;
  const nextIndex = queue.nextIndex();
  if (isAt(queue.currentIndex)) return queue.currentIndex;
  if (isAt(nextIndex)) return nextIndex;
  const firstMatch = queue.tracks.findIndex((track) => String(track.id) === trackId);
  return firstMatch >= 0 ? firstMatch : null;
}

// Tracks skipped in a row because TIDAL refuses to play them; reset as soon as
// a track actually plays.
let consecutiveSkips = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
const seekCoordinator = new SeekCoordinator((seconds) => playbackService.seek(seconds));

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const showNotice = (message: string) => {
    clearTimeout(noticeTimer);
    set({ notice: message });
    noticeTimer = setTimeout(() => set({ notice: null }), NOTICE_DURATION_MS);
  };

  // Moves on from a track that cannot be played (removed from TIDAL, not
  // licensed here...). Gives up with an error when nothing is left to skip to.
  const skipUnplayable = async (failedTrack: Track | null, cause: unknown): Promise<void> => {
    const queue = useQueueStore.getState();
    const nextIndex = queue.nextIndex();
    const title = failedTrack?.title ?? "Track";
    if (nextIndex == null || !canSkipAnother(consecutiveSkips)) {
      logToTerminal("error", `not skipping "${title}": ${errorMessage(cause)}`);
      set({ error: `"${title}" is not available on TIDAL.`, isPlaying: false });
      return;
    }
    consecutiveSkips += 1;
    logToTerminal("info", `skipping unplayable track "${title}" (${errorMessage(cause)})`);
    showNotice(`Skipped "${title}": not available on TIDAL`);
    await get().playTrackAt(nextIndex);
  };

  const startTrack = async (track: Track): Promise<void> => {
    try {
      await playbackService.startTrack(String(track.id));
    } catch (error) {
      if (isPlayInterruption(error)) return;
      if (isSkippableError(error)) {
        await skipUnplayable(track, error);
        return;
      }
      logToTerminal("error", `startTrack failed: ${errorMessage(error)}`);
      set({ error: errorMessage(error), isPlaying: false });
    }
  };

  const createStoreClient = (): PlaybackServiceClient => ({
    onTransition: (trackId, durationSeconds) => {
      logToTerminal("info", `track started: ${trackId}`);
      const index = findQueueIndex(trackId);
      if (index === null) {
        // The engine is playing something that is not in the queue (it was
        // cleared meanwhile, or the web player acted on its own): stop it.
        logToTerminal("error", `stopping track ${trackId}: it is not in the queue`);
        void playbackService.pause();
        return;
      }
      const queue = useQueueStore.getState();
      const track = queue.getTrackAt(index);
      queue.jumpTo(index);
      if (track) {
        set({ currentTrack: track, duration: durationSeconds || track.duration, position: 0 });
      }
      scheduleNextTrack();
    },
    onPlaybackStateChange: (playbackState) => {
      logToTerminal("info", `playback-state: ${playbackState}`);
      if (playbackState === "PLAYING") {
        consecutiveSkips = 0;
        set({ playbackState, isPlaying: true, error: null });
      } else {
        set({ playbackState, isPlaying: false });
      }
    },
    onProgress: (positionSeconds, durationSeconds, audioFormat) => {
      if (seekCoordinator.isBusy) return;
      const state = get();
      const changes: Partial<PlayerStore> = {};
      if (positionSeconds !== state.position) changes.position = positionSeconds;
      if (durationSeconds > 0 && durationSeconds !== state.duration) {
        changes.duration = durationSeconds;
      }
      if (
        audioFormat.audioQuality !== state.audioFormat?.audioQuality ||
        audioFormat.bitDepth !== state.audioFormat?.bitDepth ||
        audioFormat.sampleRate !== state.audioFormat?.sampleRate
      ) {
        changes.audioFormat = audioFormat;
      }
      if (Object.keys(changes).length > 0) set(changes);
    },
    onEnded: () => {
      logToTerminal("info", "track ended with nothing queued in the engine");
      const nextIndex = useQueueStore.getState().nextIndex();
      if (nextIndex != null) {
        void get().playTrackAt(nextIndex);
      } else {
        set({ isPlaying: false });
      }
    },
    onNotice: (message) => showNotice(message),
  });

  return {
    isInitialized: false,
    isPlaying: false,
    playbackState: null,
    currentTrack: null,
    position: 0,
    duration: 0,
    audioFormat: null,
    volume: DEFAULT_VOLUME,
    volumeBeforeMute: DEFAULT_VOLUME,
    error: null,
    notice: null,
    isQueueOpen: false,

    init: () => {
      if (get().isInitialized) return;
      playbackService.initialize(createStoreClient());
      playbackService.setVolume(get().volume);
      set({ isInitialized: true });
    },

    playQueue: async (tracks, startIndex, source) => {
      const track = tracks[startIndex];
      if (!track) return;
      useQueueStore.getState().setQueue(tracks, startIndex, source);
      // The bar must stop showing the previous track's progress right away.
      set({
        currentTrack: track,
        position: 0,
        duration: track.duration,
        error: null,
        isQueueOpen: false,
      });
      await startTrack(track);
    },

    playTrackAt: async (index) => {
      const queue = useQueueStore.getState();
      const track = queue.getTrackAt(index);
      if (!track) return;
      queue.jumpTo(index);
      set({ currentTrack: track, position: 0, duration: track.duration, error: null });
      await startTrack(track);
    },

    togglePlay: async () => {
      const state = get();
      if (!state.currentTrack) return;
      if (state.isPlaying) {
        set({ isPlaying: false });
        await playbackService.pause();
      } else {
        try {
          await playbackService.resume();
        } catch (error) {
          logToTerminal("error", `resume failed: ${errorMessage(error)}`);
          set({ error: `Could not resume playback: ${errorMessage(error)}`, isPlaying: false });
        }
      }
    },

    next: async () => {
      const nextIndex = useQueueStore.getState().nextIndex();
      if (nextIndex != null) {
        await get().playTrackAt(nextIndex);
      }
    },

    previous: async () => {
      const state = get();
      if (state.position > PREVIOUS_RESTART_THRESHOLD_S) {
        await playbackService.seek(0);
        set({ position: 0 });
        return;
      }
      const previousIndex = useQueueStore.getState().previousIndex();
      if (previousIndex != null) {
        await get().playTrackAt(previousIndex);
      }
    },

    seek: async (seconds) => {
      const state = get();
      if (!state.currentTrack) return;
      // Move the slider right away; the poll is paused while a seek settles.
      const target = clampSeekPosition(seconds, state.duration);
      set({ position: target });
      try {
        await seekCoordinator.request(target);
      } catch (error) {
        logToTerminal("error", `seek failed: ${errorMessage(error)}`);
      }
    },

    setVolume: (level) => {
      const clamped = Math.max(0, Math.min(100, level));
      playbackService.setVolume(clamped);
      set({ volume: clamped });
    },

    toggleMute: () => {
      const { volume, volumeBeforeMute, setVolume } = get();
      if (volume === 0) {
        setVolume(volumeBeforeMute || DEFAULT_VOLUME);
      } else {
        set({ volumeBeforeMute: volume });
        setVolume(0);
      }
    },

    removeFromQueue: async (index) => {
      const queue = useQueueStore.getState();
      const removedCurrent = index === queue.currentIndex;
      const hadFollowingTrack = index < queue.tracks.length - 1;
      queue.removeAt(index);
      if (!removedCurrent) {
        // The preloaded "next" track may be the one just removed or shifted.
        scheduleNextTrack();
        return;
      }
      // The queue index would now point at the following track while the
      // removed one keeps playing, so move playback along explicitly.
      if (hadFollowingTrack) {
        await get().playTrackAt(index);
      } else {
        await get().stopAndReset();
      }
    },

    stopAndReset: async () => {
      await playbackService.reset();
      useQueueStore.getState().clear();
      set({
        currentTrack: null,
        playbackState: "IDLE",
        isPlaying: false,
        position: 0,
        duration: 0,
        audioFormat: null,
        error: null,
        isQueueOpen: false,
      });
    },

    setQueueOpen: (open) => set({ isQueueOpen: open }),
  };
});