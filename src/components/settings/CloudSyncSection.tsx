import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/button";
import type { SyncConfigResult, SyncStatus } from "@/types/player";

const STATUS_KEY = ["sync-status"];
const CONFIG_KEY = ["sync-config"];

const SYNC_STATE_LABELS: Record<SyncStatus["state"], string> = {
  disabled: "Not set up",
  idle: "Up to date",
  syncing: "Syncing…",
  error: "Last attempt failed",
};

// Cloud copy of the play counts. The database is set here (kept encrypted in
// the data folder); TURSO_* values in a .env file take its place during
// development.
export function CloudSyncSection() {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => window.api.getSyncStatus(),
    refetchInterval: 10_000,
  });
  const configQuery = useQuery({ queryKey: CONFIG_KEY, queryFn: () => window.api.getSyncConfig() });
  const [isEditing, setIsEditing] = useState(false);
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const status = statusQuery.data;
  const config = configQuery.data;

  const syncNow = async () => {
    queryClient.setQueryData<SyncStatus>(STATUS_KEY, (current) =>
      current ? { ...current, state: "syncing" } : current,
    );
    queryClient.setQueryData(STATUS_KEY, await window.api.runSyncNow());
  };

  const applyResult = async (result: SyncConfigResult) => {
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    queryClient.setQueryData(STATUS_KEY, result.status);
    await queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
    setIsEditing(false);
    setAuthToken("");
    setFormError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await applyResult(await window.api.saveSyncConfig(databaseUrl, authToken));
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = () => {
    setDatabaseUrl(config?.databaseUrl ?? "");
    setAuthToken("");
    setFormError(null);
    setIsEditing(true);
  };

  const description =
    config?.source === "env"
      ? "Play counts are copied to the Turso database set in the .env file (TURSO_DATABASE_URL and TURSO_AUTH_TOKEN), which takes the place of the one saved here."
      : config?.source === "stored"
        ? "Play counts are copied to your Turso database so they follow you across devices."
        : "Copy your play counts to a Turso database so they follow you across devices. Without one they stay on this device.";

  return (
    <SettingsSection title="Play count sync" description={description}>
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
      {config?.databaseUrl && !isEditing && (
        <p className="mt-2 truncate text-sm text-muted-foreground" data-testid="sync-database-url">
          Database: {config.databaseUrl}
        </p>
      )}

      {config && config.source !== "env" && !isEditing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={startEditing}>
            {config.source === "stored" ? "Change database" : "Set up"}
          </Button>
          {config.source === "stored" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void window.api.clearSyncConfig().then(applyResult)}
            >
              Stop syncing
            </Button>
          )}
        </div>
      )}

      {isEditing && (
        <form onSubmit={(event) => void save(event)} className="mt-3 flex max-w-xl flex-col gap-3" data-testid="sync-form">
          <SettingsField
            label="Database URL"
            placeholder="libsql://your-database.turso.io"
            value={databaseUrl}
            onChange={(event) => setDatabaseUrl(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <SettingsField
            label="Auth token"
            type="password"
            placeholder={config?.source === "stored" ? "Paste the token again to change it" : "Token from the Turso dashboard"}
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? "Checking…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}
