import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage, logToTerminal } from "@/lib/logger";
import { mediaPath } from "@/lib/mediaCards";
import { playMedia } from "@/lib/mediaPlayback";
import type { MediaSummary } from "@/types/media";

// What every grid or row of media cards needs: opening the detail page and
// starting playback (reporting a failure once, for the view to show).
export function useMediaActions() {
  const navigate = useNavigate();
  const [playError, setPlayError] = useState<string | null>(null);

  const openMedia = useCallback(
    (media: MediaSummary): void => {
      void navigate(mediaPath(media));
    },
    [navigate],
  );

  const startPlayback = useCallback(async (media: MediaSummary, shuffle: boolean): Promise<void> => {
    setPlayError(null);
    try {
      await playMedia(media, shuffle);
    } catch (error) {
      const message = errorMessage(error);
      logToTerminal("error", `playback of "${media.title}" failed: ${message}`);
      setPlayError(message);
    }
  }, []);

  return { openMedia, startPlayback, playError };
}
