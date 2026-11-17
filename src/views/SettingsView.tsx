import { LogOut } from "lucide-react";
import { AppDataSection } from "@/components/settings/AppDataSection";
import { CloudSyncSection } from "@/components/settings/CloudSyncSection";
import { LibraryCacheSection } from "@/components/settings/LibraryCacheSection";
import { RemoteControlSection } from "@/components/settings/RemoteControlSection";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { TidalAppSection } from "@/components/settings/TidalAppSection";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/hooks/useLogout";
import {
  DEFAULT_FAVORITES_LIMIT,
  DEFAULT_FAVORITES_WINDOW_DAYS,
  DEFAULT_PLAY_THRESHOLD_SECONDS,
  MAX_FAVORITES_LIMIT,
  MAX_FAVORITES_WINDOW_DAYS,
  MAX_PLAY_THRESHOLD_SECONDS,
  MIN_PLAY_THRESHOLD_SECONDS,
  PREFERENCE_KEYS,
  readBooleanPreference,
  readChoicePreference,
  readNumberPreference,
} from "@/lib/preferences";
import { isThemeChoice, THEME_CHOICES, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/store/preferencesStore";
import { useSessionStore } from "@/store/sessionStore";

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: "Same as system",
  light: "Light",
  dark: "Dark",
};

const SHUFFLE_KINDS = ["smart", "random"] as const;
const SHUFFLE_LABELS: Record<(typeof SHUFFLE_KINDS)[number], string> = {
  smart: "Smart (least played first)",
  random: "Random",
};

// A row of mutually exclusive choices (theme, shuffle kind...).
export function ChoiceGroup<Choice extends string>({
  label,
  choices,
  value,
  labels,
  onChange,
}: {
  label: string;
  choices: readonly Choice[];
  value: Choice;
  labels: Record<Choice, string>;
  onChange: (choice: Choice) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={value === choice}
          onClick={() => onChange(choice)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === choice
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {labels[choice]}
        </button>
      ))}
    </div>
  );
}

// A whole number inside a range; out-of-range input is ignored, not clamped,
// so a half-typed value never overwrites the setting.
function NumberSetting({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <input
        type="number"
        min={minimum}
        max={maximum}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = Math.round(Number(event.target.value));
          if (event.target.value !== "" && next >= minimum && next <= maximum) onChange(next);
        }}
        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring"
      />
    </label>
  );
}

export function SettingsView() {
  const isWebSessionConnected = useSessionStore((state) => state.isWebSessionConnected);
  const webLoginPending = useSessionStore((state) => state.webLoginPending);
  const webLoginError = useSessionStore((state) => state.webLoginError);
  const webLogin = useSessionStore((state) => state.webLogin);
  const webLogout = useSessionStore((state) => state.webLogout);
  const values = usePreferencesStore((state) => state.values);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const handleLogout = useLogout();
  const theme = readChoicePreference(values, PREFERENCE_KEYS.theme, isThemeChoice, "system");
  const smartShuffle = readBooleanPreference(values, PREFERENCE_KEYS.smartShuffle, true);
  const favoritesLimit = readNumberPreference(
    values,
    PREFERENCE_KEYS.favoritesLimit,
    DEFAULT_FAVORITES_LIMIT,
    1,
    MAX_FAVORITES_LIMIT,
  );
  const favoritesWindowDays = readNumberPreference(
    values,
    PREFERENCE_KEYS.favoritesWindowDays,
    DEFAULT_FAVORITES_WINDOW_DAYS,
    1,
    MAX_FAVORITES_WINDOW_DAYS,
  );
  const playThreshold = readNumberPreference(
    values,
    PREFERENCE_KEYS.playThresholdSeconds,
    DEFAULT_PLAY_THRESHOLD_SECONDS,
    MIN_PLAY_THRESHOLD_SECONDS,
    MAX_PLAY_THRESHOLD_SECONDS,
  );

  return (
    <div className="max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      <div className="flex flex-col gap-4">
        <SettingsSection title="Appearance">
          <ChoiceGroup
            label="Theme"
            choices={THEME_CHOICES}
            value={theme}
            labels={THEME_LABELS}
            onChange={(choice) => setPreference(PREFERENCE_KEYS.theme, choice)}
          />
        </SettingsSection>

        <SettingsSection
          title="Shuffle"
          description="Smart shuffle plays the tracks you have heard the least first, in random order among equally played ones. Random ignores your listening history."
        >
          <ChoiceGroup
            label="Shuffle kind"
            choices={SHUFFLE_KINDS}
            value={smartShuffle ? "smart" : "random"}
            labels={SHUFFLE_LABELS}
            onChange={(kind) => setPreference(PREFERENCE_KEYS.smartShuffle, String(kind === "smart"))}
          />
        </SettingsSection>

        <SettingsSection
          title="Play counts"
          description="A track counts as played after this many seconds of listening. Skipping through a track or leaving it paused does not count."
        >
          <NumberSetting
            label="Seconds of listening"
            value={playThreshold}
            minimum={MIN_PLAY_THRESHOLD_SECONDS}
            maximum={MAX_PLAY_THRESHOLD_SECONDS}
            onChange={(seconds) => setPreference(PREFERENCE_KEYS.playThresholdSeconds, String(seconds))}
          />
        </SettingsSection>

        <SettingsSection
          title="Favorites"
          description="The Favorites list shows your most played tracks among those heard recently."
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <NumberSetting
              label="Tracks in the list"
              value={favoritesLimit}
              minimum={1}
              maximum={MAX_FAVORITES_LIMIT}
              onChange={(count) => setPreference(PREFERENCE_KEYS.favoritesLimit, String(count))}
            />
            <NumberSetting
              label="Heard in the last (days)"
              value={favoritesWindowDays}
              minimum={1}
              maximum={MAX_FAVORITES_WINDOW_DAYS}
              onChange={(days) => setPreference(PREFERENCE_KEYS.favoritesWindowDays, String(days))}
            />
          </div>
        </SettingsSection>

        <RemoteControlSection />

        <CloudSyncSection />

        <LibraryCacheSection />

        <SettingsSection
          title="Playback session"
          description={
            isWebSessionConnected
              ? "Connected: tracks play in full through TIDAL's own web player."
              : "Connect your TIDAL account to play music. A TIDAL sign-in window opens and closes by itself once you are signed in."
          }
        >
          {webLoginError && <p className="mb-2 text-sm text-destructive">{webLoginError}</p>}
          {isWebSessionConnected ? (
            <Button variant="outline" onClick={() => void webLogout()}>
              Disconnect playback
            </Button>
          ) : (
            <Button disabled={webLoginPending} onClick={() => void webLogin()}>
              {webLoginPending ? "Waiting for sign-in..." : "Connect playback"}
            </Button>
          )}
        </SettingsSection>

        <TidalAppSection />

        <AppDataSection />

        <SettingsSection title="Account" description="Sign out of your TIDAL account on this device.">
          <Button variant="outline" onClick={() => void handleLogout()}>
            <LogOut className="size-4" aria-hidden />
            Log out
          </Button>
        </SettingsSection>
      </div>
    </div>
  );
}
