import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { errorMessage, logToTerminal } from "@/lib/logger";
import { usePlayerStore } from "@/store/playerStore";
import { useSessionStore } from "@/store/sessionStore";
import { AlbumView } from "@/views/AlbumView";
import { LibraryView } from "@/views/LibraryView";
import { LoginView } from "@/views/LoginView";
import { PlaylistView } from "@/views/PlaylistView";
import { SearchView } from "@/views/SearchView";
import { SongsView } from "@/views/SongsView";
import "./App.css";

const queryClient = new QueryClient();

function App() {
  const { is_authenticated, isLoading, init } = useSessionStore();

  useEffect(() => {
    void init();
  }, [init]);

  // The TIDAL Web SDK rejects asynchronously on breakpoints that do NOT fire
  // its "error" event (e.g. DRM key system unsupported on WebKitGTK). Surface
  // every uncaught async failure in the player banner so playback issues are
  // visible instead of silent.
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = errorMessage(event.reason);
      logToTerminal("error", `unhandled rejection: ${message}`);
      usePlayerStore.setState({ error: `Playback error: ${message}`, isPlaying: false });
    };
    const onErrorEvent = (event: ErrorEvent) => {
      // Resource-load errors (e.g. a broken artwork <img>) carry no script
      // filename; real uncaught script errors do. Ignore the first kind.
      if (!event.filename) return;
      logToTerminal("error", `uncaught error: ${event.message} @ ${event.filename}`);
      usePlayerStore.setState({ error: `Playback error: ${event.message}`, isPlaying: false });
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onErrorEvent);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onErrorEvent);
    };
  }, []);

  // If the session is ever closed (e.g. logged out elsewhere), stop playback
  // and drop the queue so no stale state survives a re-login.
  useEffect(() => {
    if (!is_authenticated && !isLoading) {
      void usePlayerStore.getState().stopAndReset();
    }
  }, [is_authenticated, isLoading]);

  if (isLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (!is_authenticated) {
    return <LoginView />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LibraryView />} />
            <Route path="songs" element={<SongsView />} />
            <Route path="search" element={<SearchView />} />
            <Route path="albums/:albumId" element={<AlbumView />} />
            <Route path="playlists/:playlistId" element={<PlaylistView />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;