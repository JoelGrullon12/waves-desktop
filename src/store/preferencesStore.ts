import { create } from "zustand";
import { errorMessage, logToTerminal } from "@/lib/logger";
import type { PreferenceValues } from "@/lib/preferences";

// Settings kept in settings.ini, loaded once at startup. Writes update the
// store at once and reach the file a moment later, so a slider that
// fires dozens of changes costs a single write.
const WRITE_DELAY_MS = 300;

interface PreferencesStore {
  values: PreferenceValues;
  isLoaded: boolean;
  load: () => Promise<PreferenceValues>;
  setPreference: (key: string, value: string) => void;
}

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
let loadInFlight: Promise<PreferenceValues> | null = null;

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  values: {},
  isLoaded: false,

  load: () => {
    if (get().isLoaded) return Promise.resolve(get().values);
    if (!loadInFlight) {
      loadInFlight = window.api
        .getPreferences()
        .catch((error) => {
          // The app works with defaults when the settings can not be read.
          logToTerminal("error", `could not load preferences: ${errorMessage(error)}`);
          return {} as PreferenceValues;
        })
        .then((stored) => {
          // Anything set while loading is newer than what was stored.
          const values = { ...stored, ...get().values };
          set({ values, isLoaded: true });
          return values;
        });
    }
    return loadInFlight;
  },

  setPreference: (key, value) => {
    if (get().values[key] === value) return;
    set((state) => ({ values: { ...state.values, [key]: value } }));
    clearTimeout(pendingWrites.get(key));
    pendingWrites.set(
      key,
      setTimeout(() => {
        pendingWrites.delete(key);
        window.api
          .setPreference(key, value)
          .catch((error) =>
            logToTerminal("error", `could not save preference ${key}: ${errorMessage(error)}`),
          );
      }, WRITE_DELAY_MS),
    );
  },
}));
