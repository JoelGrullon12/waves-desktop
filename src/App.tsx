import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/sessionStore";
import "./App.css";

function App() {
  const { is_authenticated, isLoading, loggingIn, loginError, user_id, init, login, logout } =
    useSessionStore();

  useEffect(() => {
    init();
  }, [init]);

  if (isLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (!is_authenticated) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
        <h1 className="text-3xl font-bold text-foreground">Waves Desktop</h1>
        <p className="text-muted-foreground text-center max-w-md">
          Connect your TIDAL account to start listening. You'll be redirected to
          TIDAL's website to authorize.
        </p>
        <Button onClick={login} size="lg" disabled={loggingIn}>
          {loggingIn ? "Signing in..." : "Connect TIDAL Account"}
        </Button>
        {loginError && (
          <div className="max-w-md space-y-2 text-center">
            <p className="text-sm text-destructive">{loginError}</p>
            <p className="text-muted-foreground text-xs">
              Make sure your system keyring is unlocked, then try again.
            </p>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="flex h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-foreground">Waves Desktop</h1>
        <p className="text-muted-foreground">
          Authenticated{user_id ? ` (user: ${user_id})` : ""}
        </p>
        <p className="text-muted-foreground text-sm">Player coming next.</p>
        <div>
          <Button onClick={logout} variant="outline" size="sm">
            Log out
          </Button>
        </div>
      </div>
    </main>
  );
}

export default App;