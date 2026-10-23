// HTMLMediaElement.play() rejects with an AbortError whenever a later pause()
// or load() supersedes it. That is the user (or a track change) interrupting
// playback on purpose, not a failure, so it must not reach the error banner.
const PLAY_INTERRUPTION_MESSAGES = [
  "interrupted by a call to pause",
  "interrupted by a new load request",
];

export function isPlayInterruption(error: unknown): boolean {
  if (typeof error !== "object" || error == null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "AbortError") return true;
  return (
    typeof message === "string" &&
    PLAY_INTERRUPTION_MESSAGES.some((fragment) => message.includes(fragment))
  );
}

// Errors that mean this particular track can never play for this user (removed
// from TIDAL, not licensed in the region or the subscription). Retryable and
// network failures are excluded: skipping those would discard playable tracks.
const SKIPPABLE_ERROR_IDS = new Set([
  "PENotAllowed",
  "PEContentNotAvailableInLocation",
  "PEContentNotAvailableForSubscription",
]);

export function isSkippableError(error: unknown): boolean {
  if (typeof error !== "object" || error == null) return false;
  const { errorId } = error as { errorId?: unknown };
  return typeof errorId === "string" && SKIPPABLE_ERROR_IDS.has(errorId);
}

// Stops a run of unplayable tracks (e.g. a playlist of removed songs, or a
// token problem that makes every track fail) from skipping through the whole
// queue.
export const MAX_CONSECUTIVE_SKIPS = 5;

export function canSkipAnother(consecutiveSkips: number): boolean {
  return consecutiveSkips < MAX_CONSECUTIVE_SKIPS;
}
