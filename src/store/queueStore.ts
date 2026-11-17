import { create } from "zustand";
import {
  indexAfterSkip,
  indexAfterTrackEnds,
  indexBefore,
  insertedAfterCurrent,
  movedItem,
  withoutIndex,
  type RepeatMode,
} from "@/lib/queueOrder";
import type { Track } from "@/types/track";

export type PlaybackSource = {
  sourceType: string;
  sourceId: string;
  // Shown as "Playing from …" (player bar, queue); the path opens it.
  sourceTitle?: string | null;
  sourcePath?: string | null;
};

interface QueueStore {
  // Play order: what the queue panel shows and what plays next.
  tracks: Track[];
  // Order of the source (album, playlist...) plus anything queued by hand;
  // turning shuffle off goes back to it.
  originalTracks: Track[];
  currentIndex: number | null;
  source: PlaybackSource | null;
  shuffleEnabled: boolean;
  repeatMode: RepeatMode;
  setQueue: (
    tracks: Track[],
    startIndex: number,
    source: PlaybackSource,
    originalTracks?: Track[],
  ) => void;
  getTrackAt: (index: number) => Track | null;
  // Position that plays when the current track ends by itself.
  nextIndex: () => number | null;
  // Position that plays when the user presses Next.
  skipIndex: () => number | null;
  previousIndex: () => number | null;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  insertNext: (added: Track[]) => void;
  append: (added: Track[]) => void;
  move: (fromIndex: number, toIndex: number) => void;
  // Replaces the play order (shuffle on/off) without touching the source order.
  reorder: (tracks: Track[], currentIndex: number | null) => void;
  setShuffleEnabled: (enabled: boolean) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  clear: () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  tracks: [],
  originalTracks: [],
  currentIndex: null,
  source: null,
  shuffleEnabled: false,
  repeatMode: "off",

  setQueue: (tracks, startIndex, source, originalTracks) =>
    set({ tracks, originalTracks: originalTracks ?? tracks, currentIndex: startIndex, source }),

  getTrackAt: (index) => get().tracks[index] ?? null,

  nextIndex: () => {
    const { tracks, currentIndex, repeatMode } = get();
    return indexAfterTrackEnds(tracks.length, currentIndex, repeatMode);
  },

  skipIndex: () => {
    const { tracks, currentIndex, repeatMode } = get();
    return indexAfterSkip(tracks.length, currentIndex, repeatMode);
  },

  previousIndex: () => {
    const { tracks, currentIndex, repeatMode } = get();
    return indexBefore(tracks.length, currentIndex, repeatMode);
  },

  jumpTo: (index) => set({ currentIndex: index }),

  removeAt: (index) => {
    const { tracks, originalTracks, currentIndex } = get();
    const removedTrack = tracks[index];
    const remaining = withoutIndex(tracks, currentIndex, index);
    const originalIndex = originalTracks.indexOf(removedTrack);
    set({
      tracks: remaining.items,
      currentIndex: remaining.currentIndex,
      originalTracks:
        originalIndex >= 0
          ? originalTracks.filter((_, position) => position !== originalIndex)
          : originalTracks,
    });
  },

  insertNext: (added) => {
    const { tracks, originalTracks, currentIndex } = get();
    const currentTrack = currentIndex != null ? tracks[currentIndex] : undefined;
    const originalIndex = currentTrack ? originalTracks.indexOf(currentTrack) : -1;
    set({
      tracks: insertedAfterCurrent(tracks, currentIndex, added),
      originalTracks: insertedAfterCurrent(
        originalTracks,
        originalIndex >= 0 ? originalIndex : null,
        added,
      ),
    });
  },

  append: (added) =>
    set((state) => ({
      tracks: [...state.tracks, ...added],
      originalTracks: [...state.originalTracks, ...added],
    })),

  move: (fromIndex, toIndex) => {
    const { tracks, currentIndex } = get();
    const moved = movedItem(tracks, currentIndex, fromIndex, toIndex);
    set({ tracks: moved.items, currentIndex: moved.currentIndex });
  },

  reorder: (tracks, currentIndex) => set({ tracks, currentIndex }),

  setShuffleEnabled: (enabled) => set({ shuffleEnabled: enabled }),

  setRepeatMode: (mode) => set({ repeatMode: mode }),

  // Shuffle and repeat are settings of the player, not of one queue, so they
  // survive clearing it.
  clear: () => set({ tracks: [], originalTracks: [], currentIndex: null, source: null }),
}));
