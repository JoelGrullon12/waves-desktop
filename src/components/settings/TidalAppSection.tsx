import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { SettingsField } from "@/components/settings/SettingsField";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/hooks/useLogout";
import { useSessionStore } from "@/store/sessionStore";

const QUERY_KEY = ["credentials-status"];

// The client id and secret of the user's app in the TIDAL developer dashboard.
// Changing or removing them signs out: the session belongs to the old app.
export function TidalAppSection() {
  const queryClient = useQueryClient();
  const handleLogout = useLogout();
  const statusQuery = useQuery({ queryKey: QUERY_KEY, queryFn: () => window.api.getCredentialsStatus() });
  const [isEditing, setIsEditing] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const source = statusQuery.data?.source ?? null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const result = await window.api.saveCredentials(clientId, clientSecret);
    if (!result.success) {
      setFormError(result.error ?? "Could not save the credentials.");
      return;
    }
    await handleLogout();
    useSessionStore.setState({ credentialsConfigured: true });
  };

  const remove = async () => {
    await handleLogout();
    const status = await window.api.clearCredentials();
    useSessionStore.setState({ credentialsConfigured: status.configured });
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  return (
    <SettingsSection
      title="TIDAL app"
      description={
        source === "env"
          ? "The client ID and secret come from TIDAL_CLIENT_ID and TIDAL_CLIENT_SECRET in the .env file."
          : "The client ID and secret of your app in the TIDAL developer dashboard, kept encrypted on this device. Changing them signs you out."
      }
    >
      {source === "stored" && !isEditing && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setClientId("");
              setClientSecret("");
              setFormError(null);
              setIsEditing(true);
            }}
          >
            Change credentials
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
            Remove and sign out
          </Button>
        </div>
      )}
      {isEditing && (
        <form onSubmit={(event) => void save(event)} className="flex max-w-xl flex-col gap-3">
          <SettingsField
            label="Client ID"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <SettingsField
            label="Client secret"
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
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
            <Button type="submit" size="sm">
              Save and sign out
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
