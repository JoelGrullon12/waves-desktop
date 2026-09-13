import { useSessionStore } from "@/store/sessionStore";

export function LibraryView() {
  const user_id = useSessionStore((state) => state.user_id);

  return (
    <div className="p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Your Library</h1>
        <p className="text-sm text-muted-foreground">
          {user_id != null ? `Signed in with user id ${user_id}.` : "Signed in."}
        </p>
      </header>

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