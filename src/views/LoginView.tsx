import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/sessionStore";

const INPUT_CLASS_NAME =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LoginView() {
  const { credentialsConfigured, loggingIn, loginError, login, saveCredentials } =
    useSessionStore();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const submitCredentials = (event: FormEvent) => {
    event.preventDefault();
    void saveCredentials(clientId, clientSecret);
  };

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
      <h1 className="text-3xl font-bold text-foreground">Waves Desktop</h1>
      {credentialsConfigured ? (
        <>
          <p className="max-w-md text-center text-muted-foreground">
            Connect your TIDAL account to start listening. You'll be redirected to TIDAL's
            website to authorize.
          </p>
          <Button onClick={() => void login()} size="lg" disabled={loggingIn}>
            {loggingIn ? "Signing in..." : "Connect TIDAL Account"}
          </Button>
        </>
      ) : (
        <form onSubmit={submitCredentials} className="w-full max-w-sm space-y-3 px-4">
          <p className="text-center text-muted-foreground">
            Enter the credentials of your app from the TIDAL developer dashboard. They are
            stored encrypted on this computer.
          </p>
          <input
            className={INPUT_CLASS_NAME}
            placeholder="Client ID"
            autoComplete="off"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />
          <input
            className={INPUT_CLASS_NAME}
            placeholder="Client secret"
            type="password"
            autoComplete="off"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
          />
          <Button type="submit" size="lg" className="w-full" disabled={!clientId || !clientSecret}>
            Save credentials
          </Button>
        </form>
      )}
      {loginError && (
        <div className="max-w-md space-y-2 text-center">
          <p className="text-sm text-destructive">{loginError}</p>
          {credentialsConfigured && (
            <p className="text-xs text-muted-foreground">
              Make sure your system keyring is unlocked, then try again.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
