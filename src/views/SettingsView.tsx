import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
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
import type { SyncStatus } from "@/types/player";

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

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

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

const SYNC_STATE_LABELS: Record<SyncStatus["state"], string> = {
  disabled: "Not set up",
  idle: "Up to date",
  syncing: "Syncing…",
  error: "Last attempt failed",
};

// Cloud copy of the play counts. It is set up outside the app (TURSO_* values
// in the .env file), so this only reports its state and lets the user retry.
function CloudSyncSection() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => window.api.getSyncStatus(),
    refetchInterval: 10_000,
  });
  const status = statusQuery.data;
  const syncNow = async () => {
    queryClient.setQueryData<SyncStatus>(["sync-status"], (current) =>
      current ? { ...current, state: "syncing" } : current,
    );
    queryClient.setQueryData(["sync-status"], await window.api.runSyncNow());
  };

  return (
    <SettingsSection
      title="Play count sync"
      description={
        status?.isConfigured
          ? "Play counts are copied to your Turso database so they follow you across devices."
          : "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the .env file to copy play counts to the cloud. Without them they stay on this device."
      }
    >
      {status && (
        <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="sync-status">
          <span className={status.state === "error" ? "text-destructive" : "text-foreground"}>
            {SYNC_STATE_LABELS[status.state]}
          </span>
          {status.lastSyncedAt && (
            <span className="text-muted-foreground">
              Last sync {new Date(status.lastSyncedAt).toLocaleString()}
            </span>
          )}
          {status.pendingTracks > 0 && (
            <span className="text-muted-foreground">{status.pendingTracks} waiting to be sent</span>
          )}
          {status.isConfigured && (
            <Button variant="outline" size="sm" onClick={() => void syncNow()} disabled={status.state === "syncing"}>
              Sync now
            </Button>
          )}
        </div>
      )}
      {status?.lastError && <p className="mt-2 text-sm text-destructive">{status.lastError}</p>}
    </SettingsSection>
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

        <CloudSyncSection />

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
