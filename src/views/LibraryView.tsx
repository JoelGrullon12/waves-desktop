import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/sessionStore";

export function LibraryView() {
  const user_id = useSessionStore((state) => state.user_id);
  const isWebSessionConnected = useSessionStore((state) => state.isWebSessionConnected);
  const webLoginPending = useSessionStore((state) => state.webLoginPending);
  const webLoginError = useSessionStore((state) => state.webLoginError);
  const webLogin = useSessionStore((state) => state.webLogin);
  const completeWebLogin = useSessionStore((state) => state.completeWebLogin);
  const webLogout = useSessionStore((state) => state.webLogout);
  const [pastedCode, setPastedCode] = useState("");

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Your Library</h1>
        <p className="text-sm text-muted-foreground">
          {user_id != null ? `Signed in with user id ${user_id}.` : "Signed in."}
        </p>
      </header>

      <div className="mb-8 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Full-length playback</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isWebSessionConnected
            ? "Connected with full track access. Tracks play without the 30 second preview cap."
            : "Connect your subscribed TIDAL account to unlock full-length tracks. Your browser opens a TIDAL sign-in; paste the code from the address bar afterwards."}
        </p>
        {webLoginError && <p className="mt-2 text-sm text-destructive">{webLoginError}</p>}
        {isWebSessionConnected ? (
          <Button className="mt-3" variant="outline" onClick={() => void webLogout()}>
            Disconnect full playback
          </Button>
        ) : webLoginPending ? (
          <>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              <li>Sign in to TIDAL in the browser window that opened.</li>
              <li>
                After signing in you land on{" "}
                <code className="rounded bg-muted px-1">listen.tidal.com/login/auth?code=...</code>.
              </li>
              <li>Copy the whole address (or just the code) and paste it below.</li>
            </ol>
            <div className="mt-3 flex max-w-lg gap-2">
              <input
                type="text"
                value={pastedCode}
                onChange={(event) => setPastedCode(event.target.value)}
                placeholder="Paste the code or the full address here"
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none"
              />
              <Button onClick={() => void completeWebLogin(pastedCode)}>Complete</Button>
            </div>
          </>
        ) : (
          <Button className="mt-3" onClick={() => void webLogin()}>
            Connect full playback
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">Your collection is coming soon.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved albums, playlists and favorites will live here in a later milestone. Use Search
          to start listening right now.
        </p>
      </div>
    </div>
  );
}