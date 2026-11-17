import { create } from "zustand";
import { errorMessage, logToTerminal } from "@/lib/logger";
import { canSkipAnother, isPlayInterruption, isSkippableError } from "@/lib/playbackErrors";
import { PlayCounter } from "@/lib/playCounter";
import {
  DEFAULT_PLAY_THRESHOLD_SECONDS,
  MAX_PLAY_THRESHOLD_SECONDS,
  MIN_PLAY_THRESHOLD_SECONDS,
  PREFERENCE_KEYS,
  readBooleanPreference,
  readChoicePreference,
  readJsonPreference,
  readNumberPreference,
} from "@/lib/preferences";
import { isRepeatMode, nextRepeatMode } from "@/lib/queueOrder";
import { shuffleCopy } from "@/lib/random";
import {
  playbackService,
  type AudioFormat,
  type PlaybackServiceClient,
  type PlaybackState,
} from "@/services/playbackService";
import { tidalCatalogService } from "@/services/tidalCatalogService";
import { SeekCoordinator, clampSeekPosition } from "@/lib/seekCoordinator";
import { usePreferencesStore } from "@/store/preferencesStore";
import { useQueueStore, type PlaybackSource } from "@/store/queueStore";
import type { Track } from "@/types/track";

const DEFAULT_VOLUME = 80;
const PREVIOUS_RESTART_THRESHOLD_S = 3;
const NOTICE_DURATION_MS = 4000;
// The saved queue is a window around the current track: enough to keep
// listening after a restart without storing (and re-fetching) a whole library.
const SAVED_QUEUE_TRACKS_BEFORE_CURRENT = 20;
const SAVED_QUEUE_MAX_TRACKS = 500;
const QUEUE_SAVE_DELAY_MS = 1000;
// Tracks queued by hand when nothing was playing have no album or playlist
// behind them.
const MANUAL_QUEUE_SOURCE: PlaybackSource = {
  sourceType: "queue",
  sourceId: "manual-queue",
  sourceTitle: "Your queue",
};

export interface PlayQueueOptions {
  // Turns shuffle on and starts from a shuffled position instead of
  // `startIndex` (the Shuffle buttons).
  shuffle?: boolean;
}

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
  // The full-screen "Now playing" panel (opened from the player bar).
  isNowPlayingOpen: boolean;
  init: () => void;
  playQueue: (
    tracks: Track[],
    startIndex: number,
    source: PlaybackSource,
    options?: PlayQueueOptions,
  ) => Promise<void>;
  playTrackAt: (index: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setVolume: (level: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => Promise<void>;
  cycleRepeatMode: () => void;
  playNext: (tracks: Track[]) => Promise<void>;
  addToQueue: (tracks: Track[]) => Promise<void>;
  moveInQueue: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => Promise<void>;
  showNotice: (message: string) => void;
  stopAndReset: () => Promise<void>;
  setQueueOpen: (open: boolean) => void;
  setNowPlayingOpen: (open: boolean) => void;
}

// Order used when shuffle is on: smart shuffle (least played first) unless the
// user chose plain random in Settings.
async function shuffleTracks(tracks: Track[]): Promise<Track[]> {
  const { values } = usePreferencesStore.getState();
  if (!readBooleanPreference(values, PREFERENCE_KEYS.smartShuffle, true)) return shuffleCopy(tracks);
  try {
    // The main process knows the play counts: it returns the ids with the
    // least played first (random within equal counts).
    const orderedIds = await window.api.getSmartShuffleOrder(tracks.map((track) => String(track.id)));
    // The same track can be in the list more than once.
    const tracksById = new Map<string, Track[]>();
    for (const track of tracks) {
      const sameId = tracksById.get(String(track.id));
      if (sameId) sameId.push(track);
      else tracksById.set(String(track.id), [track]);
    }
    const ordered = orderedIds
      .map((trackId) => tracksById.get(trackId)?.shift())
      .filter((track): track is Track => track !== undefined);
    if (ordered.length === tracks.length) return ordered;
    logToTerminal("error", "smart shuffle returned an incomplete order, using a random one");
  } catch (error) {
    logToTerminal("error", `smart shuffle failed, using a random order: ${errorMessage(error)}`);
  }
  return shuffleCopy(tracks);
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

function isPlaybackSource(value: unknown): value is PlaybackSource {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    sourceType?: unknown;
    sourceId?: unknown;
    sourceTitle?: unknown;
    sourcePath?: unknown;
  };
  const isOptionalText = (field: unknown) => field == null || typeof field === "string";
  return (
    typeof candidate.sourceType === "string" &&
    typeof candidate.sourceId === "string" &&
    isOptionalText(candidate.sourceTitle) &&
    isOptionalText(candidate.sourcePath)
  );
}

// Tracks skipped in a row because TIDAL refuses to play them; reset as soon as
// a track actually plays.
let consecutiveSkips = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
// True between asking the engine for a track and that track starting. A track
// that starts while this is false was started by the engine itself (the queued
// next one), which is how "repeat once" knows its extra play happened.
let awaitingRequestedStart = false;
// The queue restored at startup is shown paused; the engine has nothing loaded
// for it yet, so the first Play has to start the track instead of resuming.
let currentTrackNeedsStart = false;
let isRestoringQueue = false;
let queueSaveTimer: ReturnType<typeof setTimeout> | undefined;
const playCounter = new PlayCounter();
const seekCoordinator = new SeekCoordinator((seconds) => playbackService.seek(seconds));

function saveQueueSoon(): void {
  if (isRestoringQueue) return;
  clearTimeout(queueSaveTimer);
  queueSaveTimer = setTimeout(() => {
    const { tracks, currentIndex, source } = useQueueStore.getState();
    const windowStart = Math.max(0, (currentIndex ?? 0) - SAVED_QUEUE_TRACKS_BEFORE_CURRENT);
    const savedTracks = tracks.slice(windowStart, windowStart + SAVED_QUEUE_MAX_TRACKS);
    const preferences = usePreferencesStore.getState();
    preferences.setPreference(
      PREFERENCE_KEYS.queueCurrentIndex,
      currentIndex == null ? "" : String(currentIndex - windowStart),
    );
    preferences.setPreference(PREFERENCE_KEYS.queueSource, source ? JSON.stringify(source) : "");
    window.api
      .saveQueue(savedTracks.map((track) => String(track.id)))
      .catch((error) => logToTerminal("error", `could not save the queue: ${errorMessage(error)}`));
  }, QUEUE_SAVE_DELAY_MS);
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  const showNotice = (message: string) => {
    clearTimeout(noticeTimer);
    set({ notice: message });
    noticeTimer = setTimeout(() => set({ notice: null }), NOTICE_DURATION_MS);
  };

  const setRepeatMode = (mode: ReturnType<typeof nextRepeatMode>): void => {
    useQueueStore.getState().setRepeatMode(mode);
    usePreferencesStore.getState().setPreference(PREFERENCE_KEYS.repeatMode, mode);
  };

  // "Repeat once" is single use: after its extra play it switches itself off.
  const consumeRepeatOnce = (): void => {
    if (useQueueStore.getState().repeatMode === "one-once") setRepeatMode("off");
  };

  // Moves on from a track that cannot be played (removed from TIDAL, not
  // licensed here...). Gives up with an error when nothing is left to skip to.
  const skipUnplayable = async (failedTrack: Track | null, cause: unknown): Promise<void> => {
    const queue = useQueueStore.getState();
    const nextIndex = queue.skipIndex();
    const title = failedTrack?.title ?? "Track";
    if (nextIndex == null || !canSkipAnother(consecutiveSkips)) {
      logToTerminal("error", `not skipping "${title}": ${errorMessage(cause)}`);
      set({ error: `"${title}" is not available on TIDAL.`, isPlaying: false });
      return;
    }
    consecutiveSkips += 1;
    logToTerminal("info", `skipping unplayable track "${title}" (${errorMessage(cause)})`);
    showNotice(`Skipped "${title}": not available on TIDAL`);
    await startAt(nextIndex);
  };

  // Adds one play to the current track once it has been listened to for the
  // configured time.
  const countPlayIfListened = (positionSeconds: number, state: PlayerStore): void => {
    const thresholdSeconds = readNumberPreference(
      usePreferencesStore.getState().values,
      PREFERENCE_KEYS.playThresholdSeconds,
      DEFAULT_PLAY_THRESHOLD_SECONDS,
      MIN_PLAY_THRESHOLD_SECONDS,
      MAX_PLAY_THRESHOLD_SECONDS,
    );
    const track = state.currentTrack;
    if (!track || !playCounter.reportProgress(positionSeconds, state.isPlaying, thresholdSeconds)) {
      return;
    }
    window.api
      .incrementPlayCount(String(track.id))
      .then((playCount) => logToTerminal("info", `play counted for ${track.id}: ${playCount}`))
      .catch((error) => logToTerminal("error", `could not count the play: ${errorMessage(error)}`));
  };

  const startTrack = async (track: Track): Promise<void> => {
    awaitingRequestedStart = true;
    currentTrackNeedsStart = false;
    try {
      await playbackService.startTrack(String(track.id));
    } catch (error) {
      awaitingRequestedStart = false;
      if (isPlayInterruption(error)) return;
      if (isSkippableError(error)) {
        await skipUnplayable(track, error);
        return;
      }
      logToTerminal("error", `startTrack failed: ${errorMessage(error)}`);
      set({ error: errorMessage(error), isPlaying: false });
    }
  };

  const startAt = async (index: number): Promise<void> => {
    const queue = useQueueStore.getState();
    const track = queue.getTrackAt(index);
    if (!track) return;
    queue.jumpTo(index);
    // The bar must stop showing the previous track's progress right away.
    set({ currentTrack: track, position: 0, duration: track.duration, error: null });
    await startTrack(track);
  };

  const createStoreClient = (): PlaybackServiceClient => ({
    onTransition: (trackId, durationSeconds) => {
      logToTerminal("info", `track started: ${trackId}`);
      playCounter.startPlayback();
      const startedByEngine = !awaitingRequestedStart;
      awaitingRequestedStart = false;
      const index = findQueueIndex(trackId);
      if (index === null) {
        // The engine is playing something that is not in the queue (it was
        // cleared meanwhile, or the web player acted on its own): stop it.
        logToTerminal("error", `stopping track ${trackId}: it is not in the queue`);
        void playbackService.pause();
        return;
      }
      const queue = useQueueStore.getState();
      if (startedByEngine && index === queue.currentIndex) consumeRepeatOnce();
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
      if (seekCoordinator.isBusy || currentTrackNeedsStart) return;
      const state = get();
      countPlayIfListened(positionSeconds, state);
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
      // Only reached when the engine had no next track queued (it could not be
      // queued, or the queue just ended).
      logToTerminal("info", "track ended with nothing queued in the engine");
      const queue = useQueueStore.getState();
      const nextIndex = queue.nextIndex();
      if (nextIndex === queue.currentIndex) consumeRepeatOnce();
      if (nextIndex != null) {
        void startAt(nextIndex);
      } else {
        set({ isPlaying: false });
      }
    },
    onNotice: (message) => showNotice(message),
    onMediaKey: (command) => void (command === "next" ? get().next() : get().previous()),
  });

  // Applies the stored volume, shuffle and repeat, then brings back the queue
  // that was playing when the app closed (paused on its current track).
  const restoreSession = async (): Promise<void> => {
    const values = await usePreferencesStore.getState().load();
    const volume = readNumberPreference(values, PREFERENCE_KEYS.volume, DEFAULT_VOLUME, 0, 100);
    playbackService.setVolume(volume);
    set({ volume, volumeBeforeMute: volume || DEFAULT_VOLUME });
    const queue = useQueueStore.getState();
    queue.setShuffleEnabled(readBooleanPreference(values, PREFERENCE_KEYS.shuffleEnabled, false));
    queue.setRepeatMode(
      readChoicePreference(values, PREFERENCE_KEYS.repeatMode, isRepeatMode, "off"),
    );

    isRestoringQueue = true;
    try {
      const savedTrackIds = await window.api.loadQueue();
      if (savedTrackIds.length === 0) return;
      const result = await tidalCatalogService.getTracksByIds(savedTrackIds);
      if (!result.success) throw new Error(result.error);
      // The user may have started something while the saved queue was loading.
      if (get().currentTrack !== null || useQueueStore.getState().tracks.length > 0) return;

      const tracksById = new Map(result.data.map((track) => [String(track.id), track]));
      const savedIndex = readNumberPreference(
        values,
        PREFERENCE_KEYS.queueCurrentIndex,
        0,
        0,
        savedTrackIds.length - 1,
      );
      // A saved track TIDAL no longer returns is dropped; the current position
      // moves back by the number of dropped tracks before it.
      const restoredTracks: Track[] = [];
      let restoredIndex = 0;
      savedTrackIds.forEach((trackId, position) => {
        const track = tracksById.get(trackId);
        if (!track) return;
        if (position <= savedIndex) restoredIndex = restoredTracks.length;
        restoredTracks.push(track);
      });
      const currentTrack = restoredTracks[restoredIndex];
      if (!currentTrack) return;

      const source =
        readJsonPreference(values, PREFERENCE_KEYS.queueSource, isPlaybackSource) ??
        MANUAL_QUEUE_SOURCE;
      useQueueStore.getState().setQueue(restoredTracks, restoredIndex, source);
      currentTrackNeedsStart = true;
      set({ currentTrack, position: 0, duration: currentTrack.duration });
    } catch (error) {
      logToTerminal("error", `could not restore the queue: ${errorMessage(error)}`);
    } finally {
      isRestoringQueue = false;
    }
  };

  // Rebuilds the play order after shuffle is switched, keeping the current
  // track where the listener is.
  const applyShuffleToQueue = async (enabled: boolean): Promise<void> => {
    const queue = useQueueStore.getState();
    if (queue.tracks.length === 0) return;
    const currentTrack = queue.currentIndex != null ? queue.tracks[queue.currentIndex] : null;
    if (!enabled) {
      const originalIndex = currentTrack ? queue.originalTracks.indexOf(currentTrack) : -1;
      queue.reorder(
        queue.originalTracks,
        currentTrack ? Math.max(0, originalIndex) : queue.currentIndex,
      );
      return;
    }
    const currentOriginalIndex = currentTrack ? queue.originalTracks.indexOf(currentTrack) : -1;
    const others = queue.originalTracks.filter((_, index) => index !== currentOriginalIndex);
    const shuffled = await shuffleTracks(others);
    // The queue may have been replaced while the order was being computed.
    if (useQueueStore.getState().originalTracks !== queue.originalTracks) return;
    if (currentTrack) queue.reorder([currentTrack, ...shuffled], 0);
    else queue.reorder(shuffled, null);
  };

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
    isNowPlayingOpen: false,

    init: () => {
      if (get().isInitialized) return;
      playbackService.initialize(createStoreClient());
      set({ isInitialized: true });
      useQueueStore.subscribe((state, previous) => {
        if (state.tracks !== previous.tracks || state.currentIndex !== previous.currentIndex) {
          saveQueueSoon();
        }
      });
      void restoreSession();
    },

    playQueue: async (tracks, startIndex, source, options) => {
      const queue = useQueueStore.getState();
      if (options?.shuffle && !queue.shuffleEnabled) {
        queue.setShuffleEnabled(true);
        usePreferencesStore.getState().setPreference(PREFERENCE_KEYS.shuffleEnabled, "true");
      }
      const pickedTrack = options?.shuffle ? null : (tracks[startIndex] ?? null);
      if (!options?.shuffle && !pickedTrack) return;
      if (tracks.length === 0) return;

      let playOrder = tracks;
      let playIndex = startIndex;
      if (useQueueStore.getState().shuffleEnabled) {
        // A track the user picked plays first; everything else is shuffled.
        const pool = pickedTrack ? tracks.filter((_, index) => index !== startIndex) : tracks;
        const shuffled = await shuffleTracks(pool);
        playOrder = pickedTrack ? [pickedTrack, ...shuffled] : shuffled;
        playIndex = 0;
      }
      useQueueStore.getState().setQueue(playOrder, playIndex, source, tracks);
      // The queue stays beside the "Now playing" panel.
      set({ isQueueOpen: get().isNowPlayingOpen });
      await startAt(playIndex);
    },

    playTrackAt: async (index) => {
      await startAt(index);
    },

    togglePlay: async () => {
      const state = get();
      if (!state.currentTrack) return;
      if (state.isPlaying) {
        set({ isPlaying: false });
        await playbackService.pause();
        return;
      }
      const currentIndex = useQueueStore.getState().currentIndex;
      if (currentTrackNeedsStart && currentIndex != null) {
        await startAt(currentIndex);
        return;
      }
      try {
        await playbackService.resume();
      } catch (error) {
        logToTerminal("error", `resume failed: ${errorMessage(error)}`);
        set({ error: `Could not resume playback: ${errorMessage(error)}`, isPlaying: false });
      }
    },

    next: async () => {
      const nextIndex = useQueueStore.getState().skipIndex();
      if (nextIndex != null) {
        await startAt(nextIndex);
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
        await startAt(previousIndex);
      }
    },

    seek: async (seconds) => {
      const state = get();
      if (!state.currentTrack) return;
      // Move the slider right away; progress updates are ignored while a seek settles.
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
      usePreferencesStore.getState().setPreference(PREFERENCE_KEYS.volume, String(clamped));
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

    toggleShuffle: async () => {
      const queue = useQueueStore.getState();
      const enabled = !queue.shuffleEnabled;
      queue.setShuffleEnabled(enabled);
      usePreferencesStore.getState().setPreference(PREFERENCE_KEYS.shuffleEnabled, String(enabled));
      await applyShuffleToQueue(enabled);
      if (get().currentTrack) scheduleNextTrack();
    },

    cycleRepeatMode: () => {
      setRepeatMode(nextRepeatMode(useQueueStore.getState().repeatMode));
      if (get().currentTrack) scheduleNextTrack();
    },

    playNext: async (tracks) => {
      if (tracks.length === 0) return;
      if (!get().currentTrack) {
        await get().playQueue(tracks, 0, MANUAL_QUEUE_SOURCE);
        return;
      }
      useQueueStore.getState().insertNext(tracks);
      scheduleNextTrack();
      showNotice(tracks.length === 1 ? `"${tracks[0].title}" plays next` : `${tracks.length} tracks play next`);
    },

    addToQueue: async (tracks) => {
      if (tracks.length === 0) return;
      if (!get().currentTrack) {
        await get().playQueue(tracks, 0, MANUAL_QUEUE_SOURCE);
        return;
      }
      useQueueStore.getState().append(tracks);
      scheduleNextTrack();
      showNotice(
        tracks.length === 1
          ? `"${tracks[0].title}" added to the queue`
          : `${tracks.length} tracks added to the queue`,
      );
    },

    moveInQueue: (fromIndex, toIndex) => {
      useQueueStore.getState().move(fromIndex, toIndex);
      if (get().currentTrack) scheduleNextTrack();
    },

    removeFromQueue: async (index) => {
      const queue = useQueueStore.getState();
      const removedCurrent = index === queue.currentIndex;
      const hadFollowingTrack = index < queue.tracks.length - 1;
      queue.removeAt(index);
      if (!removedCurrent) {
        // The queued "next" track may be the one just removed or shifted.
        scheduleNextTrack();
        return;
      }
      // The queue index would now point at the following track while the
      // removed one keeps playing, so move playback along explicitly.
      if (hadFollowingTrack) {
        await startAt(index);
      } else {
        await get().stopAndReset();
      }
    },

    showNotice,

    stopAndReset: async () => {
      await playbackService.reset();
      useQueueStore.getState().clear();
      currentTrackNeedsStart = false;
      awaitingRequestedStart = false;
      set({
        currentTrack: null,
        playbackState: "IDLE",
        isPlaying: false,
        position: 0,
        duration: 0,
        audioFormat: null,
        error: null,
        isQueueOpen: false,
        isNowPlayingOpen: false,
      });
    },

    setQueueOpen: (open) => set({ isQueueOpen: open }),
    // Opening it also opens the queue beside it.
    setNowPlayingOpen: (open) => set(open ? { isNowPlayingOpen: true, isQueueOpen: true } : { isNowPlayingOpen: false }),
  };
});
