import { create } from "zustand";
import type { Track } from "@/types/track";

// The "Add to playlists" dialog is opened from context menus that close as
// soon as an entry is clicked, so the dialog lives once at the app shell and
// is told which tracks to add through this store.
interface PlaylistDialogStore {
  tracks: Track[] | null;
  open: (tracks: Track[]) => void;
  close: () => void;
}

export const usePlaylistDialogStore = create<PlaylistDialogStore>((set) => ({
  tracks: null,
  open: (tracks) => set({ tracks }),
  close: () => set({ tracks: null }),
}));
