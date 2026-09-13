import { CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { Outlet } from "react-router";
import { Sidebar } from "@/components/layout/Sidebar";
import { PlayerBar } from "@/components/player/PlayerBar";
import { QueuePanel } from "@/components/player/QueuePanel";
import { useMediaSession } from "@/hooks/useMediaSession";
import { usePlayerStore } from "@/store/playerStore";

export function AppShell() {
  useMediaSession();
  const error = usePlayerStore((state) => state.error);
  const initPlayer = usePlayerStore((state) => state.init);

  useEffect(() => {
    initPlayer();
  }, [initPlayer]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <QueuePanel />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-center gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
        >
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <PlayerBar />
    </div>
  );
}