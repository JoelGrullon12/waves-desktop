import type { EnginePlayFailure } from "@/types/player";

// Why the playback engine could not start a track. `reason` is what the engine
// reported; the message is what the user reads.
const FAILURE_MESSAGES: Record<EnginePlayFailure, string> = {
  "engine-unavailable": "The TIDAL web player could not be controlled. It may have changed.",
  "not-logged-in": "Full playback is not connected. Connect your TIDAL session in Settings.",
  unavailable: "This track is not available on TIDAL.",
  timeout: "TIDAL took too long to start the track.",
  superseded: "Playback was replaced by a newer request.",
};

export class PlaybackFailure extends Error {
  constructor(readonly reason: EnginePlayFailure) {
    super(FAILURE_MESSAGES[reason]);
    this.name = "PlaybackFailure";
  }
}

// A play request replaced by a later one (the user clicked another track or
// paused while it was loading) is the user changing their mind, not a failure,
// so it must not reach the error banner.
export function isPlayInterruption(error: unknown): boolean {
  return error instanceof PlaybackFailure && error.reason === "superseded";
}

// Failures that mean this particular track can never play for this user
// (removed from TIDAL, not licensed in the region or the subscription).
// Timeouts and engine problems are excluded: skipping on those would run
// through the whole queue discarding playable tracks.
export function isSkippableError(error: unknown): boolean {
  return error instanceof PlaybackFailure && error.reason === "unavailable";
}

// Stops a run of unplayable tracks (e.g. a playlist of removed songs) from
// skipping through the whole queue.
export const MAX_CONSECUTIVE_SKIPS = 5;

export function canSkipAnother(consecutiveSkips: number): boolean {
  return consecutiveSkips < MAX_CONSECUTIVE_SKIPS;
}
