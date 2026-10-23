import { useCallback } from "react";
import { usePlayerStore } from "@/store/playerStore";
import { useSessionStore } from "@/store/sessionStore";

// Stops playback and clears the player before ending the TIDAL session. Shared
// by the sidebar and the Settings account card so both log out identically.
export function useLogout(): () => Promise<void> {
  const logout = useSessionStore((state) => state.logout);
  const stopAndReset = usePlayerStore((state) => state.stopAndReset);

  return useCallback(async () => {
    await stopAndReset();
    await logout();
  }, [logout, stopAndReset]);
}
