import { create } from "zustand";
import type { Track } from "@/types/track";

export type PlaybackSource = {
  sourceType: string;
  sourceId: string;
};

interface QueueStore {
  tracks: Track[];
  currentIndex: number | null;
  source: PlaybackSource | null;
  setQueue: (tracks: Track[], startIndex: number, source: PlaybackSource) => void;
  getTrackAt: (index: number) => Track | null;
  nextIndex: () => number | null;
  previousIndex: () => number | null;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  clear: () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  tracks: [],
  currentIndex: null,
  source: null,

  setQueue: (tracks, startIndex, source) => set({ tracks, currentIndex: startIndex, source }),

  getTrackAt: (index) => get().tracks[index] ?? null,

  nextIndex: () => {
    const { tracks, currentIndex } = get();
    if (currentIndex == null) return null;
    const next = currentIndex + 1;
    return next < tracks.length ? next : null;
  },

  previousIndex: () => {
    const { currentIndex } = get();
    if (currentIndex == null) return null;
    const previous = currentIndex - 1;
    return previous >= 0 ? previous : null;
  },

  jumpTo: (index) => set({ currentIndex: index }),

  removeAt: (index) => {
    const { tracks, currentIndex } = get();
    const nextTracks = tracks.filter((_, i) => i !== index);
    let nextIndex = currentIndex;
    if (currentIndex != null) {
      if (index < currentIndex) {
        nextIndex = currentIndex - 1;
      } else if (index === currentIndex) {
        nextIndex = Math.min(index, nextTracks.length - 1);
      }
    }
    set({ tracks: nextTracks, currentIndex: nextIndex });
  },

  clear: () => set({ tracks: [], currentIndex: null, source: null }),
}));