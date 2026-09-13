import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/sessionStore";

export function LoginView() {
  const { loggingIn, loginError, login } = useSessionStore();

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
      <h1 className="text-3xl font-bold text-foreground">Waves Desktop</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Connect your TIDAL account to start listening. You'll be redirected to TIDAL's website
        to authorize.
      </p>
      <Button onClick={() => void login()} size="lg" disabled={loggingIn}>
        {loggingIn ? "Signing in..." : "Connect TIDAL Account"}
      </Button>
      {loginError && (
        <div className="max-w-md space-y-2 text-center">
          <p className="text-sm text-destructive">{loginError}</p>
          <p className="text-xs text-muted-foreground">
            Make sure your system keyring is unlocked, then try again.
          </p>
        </div>
      )}
    </main>
  );
}