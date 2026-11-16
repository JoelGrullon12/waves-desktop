// Names and parsing of the settings kept in the local database
// (`user_preferences`). Values travel as text; these helpers give them a type
// and a safe fallback when a stored value is missing or no longer valid.

export const PREFERENCE_KEYS = {
  volume: "player.volume",
  shuffleEnabled: "player.shuffle",
  repeatMode: "player.repeat",
  queueCurrentIndex: "queue.currentIndex",
  queueSource: "queue.source",
  smartShuffle: "player.smartShuffle",
  playThresholdSeconds: "stats.playThresholdSeconds",
  theme: "ui.theme",
  sidebarCollapsed: "ui.sidebarCollapsed",
} as const;

export type PreferenceValues = Record<string, string>;

export function readNumberPreference(
  values: PreferenceValues,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = values[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

export function readBooleanPreference(
  values: PreferenceValues,
  key: string,
  fallback: boolean,
): boolean {
  const raw = values[key];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

// For values restricted to a known set (repeat mode, theme...).
export function readChoicePreference<Choice extends string>(
  values: PreferenceValues,
  key: string,
  isChoice: (value: unknown) => value is Choice,
  fallback: Choice,
): Choice {
  const raw = values[key];
  return isChoice(raw) ? raw : fallback;
}

export function readJsonPreference<Value>(
  values: PreferenceValues,
  key: string,
  isValue: (value: unknown) => value is Value,
): Value | null {
  const raw = values[key];
  if (raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// A play counts after this many seconds of real listening (industry habit).
export const DEFAULT_PLAY_THRESHOLD_SECONDS = 30;
export const MIN_PLAY_THRESHOLD_SECONDS = 5;
export const MAX_PLAY_THRESHOLD_SECONDS = 240;
