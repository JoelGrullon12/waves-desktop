import type { EnginePlaybackState, EngineSnapshot } from "@/types/player";

// Turns two consecutive readings of the web player into the events the player
// store cares about. The web player is polled (it has no event channel to the
// app), so "what happened" is always the difference between two snapshots.

export type EngineEvent =
  | { type: "transition"; trackId: string; durationSeconds: number }
  | { type: "state"; state: EnginePlaybackState }
  | { type: "ended" }
  | { type: "notice"; message: string };

export interface EngineExpectations {
  // The user (or the app) asked for the pause, so it is not the end of a track.
  pauseRequested: boolean;
  // While a play request is in flight the web player may still report the
  // track that was requested just before; only this one counts.
  onlyAcceptTrackId: string | null;
}

// A track that stops this close to its end finished by itself.
const END_OF_TRACK_TOLERANCE_SECONDS = 2;
// Untranslated message keys of the web player ("t-some-key") are not for people.
const UNTRANSLATED_NOTICE_PREFIX = "t-";

function finishedByItself(previous: EngineSnapshot, current: EngineSnapshot): boolean {
  const durationSeconds = current.durationSeconds || previous.durationSeconds;
  if (durationSeconds <= 0) return false;
  const lastPosition = Math.max(previous.positionSeconds, current.positionSeconds);
  return durationSeconds - lastPosition <= END_OF_TRACK_TOLERANCE_SECONDS;
}

export function deriveEngineEvents(
  previous: EngineSnapshot | null,
  current: EngineSnapshot,
  expectations: EngineExpectations,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const hadReading = previous !== null && previous.ready;

  if (!current.ready) {
    if (hadReading && previous.playbackState === "PLAYING") {
      events.push({ type: "state", state: "NOT_PLAYING" });
    }
    return events;
  }

  const isNewPlayback =
    current.trackId !== null &&
    current.playbackId !== null &&
    current.playbackId !== (hadReading ? previous.playbackId : null);
  // The first reading only describes what the web player had loaded from an
  // earlier run; that is not something this session started.
  const isAccepted =
    expectations.onlyAcceptTrackId === null
      ? hadReading
      : current.trackId === expectations.onlyAcceptTrackId;
  if (isNewPlayback && isAccepted && current.trackId !== null) {
    events.push({
      type: "transition",
      trackId: current.trackId,
      durationSeconds: current.durationSeconds,
    });
  }

  if (!hadReading || current.playbackState !== previous.playbackState) {
    events.push({ type: "state", state: current.playbackState });
  }

  if (
    hadReading &&
    previous.playbackState === "PLAYING" &&
    current.playbackState !== "PLAYING" &&
    current.playbackId === previous.playbackId &&
    !expectations.pauseRequested &&
    finishedByItself(previous, current)
  ) {
    events.push({ type: "ended" });
  }

  if (
    hadReading &&
    current.noticeId !== null &&
    current.noticeId !== previous.noticeId &&
    current.noticeMessage &&
    !current.noticeMessage.startsWith(UNTRANSLATED_NOTICE_PREFIX)
  ) {
    events.push({ type: "notice", message: current.noticeMessage });
  }

  return events;
}
