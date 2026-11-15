import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/hooks/useLogout";
import { useSessionStore } from "@/store/sessionStore";

export function SettingsView() {
  const isWebSessionConnected = useSessionStore((state) => state.isWebSessionConnected);
  const webLoginPending = useSessionStore((state) => state.webLoginPending);
  const webLoginError = useSessionStore((state) => state.webLoginError);
  const webLogin = useSessionStore((state) => state.webLogin);
  const webLogout = useSessionStore((state) => state.webLogout);
  const handleLogout = useLogout();

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Playback and account configuration.</p>
      </header>

      <div className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Full-length playback</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isWebSessionConnected
            ? "Connected with full track access. Tracks play without the 30 second preview cap."
            : "Connect your subscribed TIDAL account to unlock full-length tracks. A TIDAL sign-in window opens and closes by itself once you are signed in."}
        </p>
        {webLoginError && <p className="mt-2 text-sm text-destructive">{webLoginError}</p>}
        {isWebSessionConnected ? (
          <Button className="mt-3" variant="outline" onClick={() => void webLogout()}>
            Disconnect full playback
          </Button>
        ) : (
          <Button className="mt-3" disabled={webLoginPending} onClick={() => void webLogin()}>
            {webLoginPending ? "Waiting for sign-in..." : "Connect full playback"}
          </Button>
        )}
      </div>

      <div className="mt-6 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign out of your TIDAL account on this device.
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void handleLogout()}>
          <LogOut className="size-4" aria-hidden />
          Log out
        </Button>
      </div>
    </div>
  );
}