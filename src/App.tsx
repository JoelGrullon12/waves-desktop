import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { useAppliedTheme } from "@/hooks/useAppliedTheme";
import { errorMessage, logToTerminal } from "@/lib/logger";
import { usePlayerStore } from "@/store/playerStore";
import { useSessionStore } from "@/store/sessionStore";
import { HomeView } from "@/views/HomeView";
import { LoginView } from "@/views/LoginView";
import { MediaDetailView } from "@/views/MediaDetailView";
import { ArtistView } from "@/views/ArtistView";
import { LibraryView } from "@/views/LibraryView";
import { ReleasesView } from "@/views/ReleasesView";
import { SearchView } from "@/views/SearchView";
import { SettingsView } from "@/views/SettingsView";
import { SongsView } from "@/views/SongsView";
import { isPlayInterruption } from "@/lib/playbackErrors";
import { queryClient } from "@/lib/queryClient";
import "./App.css";

function App() {
  const { is_authenticated, isLoading, init } = useSessionStore();
  useAppliedTheme();

  useEffect(() => {
    void init();
  }, [init]);

  // Surface every uncaught async failure in the player banner so problems are
  // visible instead of silent.
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isPlayInterruption(event.reason)) return;
      const message = errorMessage(event.reason);
      logToTerminal("error", `unhandled rejection: ${message}`);
      usePlayerStore.setState({ error: message });
    };
    const onErrorEvent = (event: ErrorEvent) => {
      // Resource-load errors (e.g. a broken artwork <img>) carry no script
      // filename; real uncaught script errors do. Ignore the first kind.
      if (!event.filename) return;
      logToTerminal("error", `uncaught error: ${event.message} @ ${event.filename}`);
      usePlayerStore.setState({ error: event.message });
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
            <Route index element={<HomeView />} />
            <Route path="songs" element={<SongsView />} />
            <Route path="search" element={<SearchView />} />
            <Route path="library" element={<LibraryView />} />
            <Route path="releases" element={<ReleasesView />} />
            <Route path="artists/:artistId" element={<ArtistView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route
              path="albums/:albumId"
              element={<MediaDetailView type="album" idParamName="albumId" />}
            />
            <Route
              path="playlists/:playlistId"
              element={<MediaDetailView type="playlist" idParamName="playlistId" />}
            />
            <Route
              path="mixes/:mixType/:mixId"
              element={
                <MediaDetailView
                  type="mix"
                  idParamName="mixId"
                  mixTypeParamName="mixType"
                />
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;