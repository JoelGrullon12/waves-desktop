import { describe, expect, it } from "vitest";
import { deriveEngineEvents, type EngineExpectations } from "@/lib/engineEvents";
import type { EngineSnapshot } from "@/types/player";

const idle: EngineExpectations = { pauseRequested: false, onlyAcceptTrackId: null };

function snapshot(overrides: Partial<EngineSnapshot> = {}): EngineSnapshot {
  return {
    ready: true,
    loggedIn: true,
    trackId: "100",
    playbackId: "pq-1",
    playbackState: "PLAYING",
    positionSeconds: 10,
    durationSeconds: 200,
    volume: 80,
    upcomingTrackIds: [],
    audioQuality: "LOSSLESS",
    bitDepth: 16,
    sampleRate: 44100,
    codec: "flac",
    noticeId: null,
    noticeMessage: null,
    ...overrides,
  };
}

describe("deriveEngineEvents", () => {
  it("ignores the track the web player had loaded before this session", () => {
    const events = deriveEngineEvents(null, snapshot({ playbackState: "NOT_PLAYING" }), idle);
    expect(events).toEqual([{ type: "state", state: "NOT_PLAYING" }]);
  });

  it("reports a transition when a new playback starts", () => {
    const events = deriveEngineEvents(
      snapshot(),
      snapshot({ trackId: "200", playbackId: "pq-2", durationSeconds: 180 }),
      idle,
    );
    expect(events).toEqual([{ type: "transition", trackId: "200", durationSeconds: 180 }]);
  });

  it("reports replaying the same track as a new transition", () => {
    const events = deriveEngineEvents(snapshot(), snapshot({ playbackId: "pq-2" }), idle);
    expect(events).toEqual([{ type: "transition", trackId: "100", durationSeconds: 200 }]);
  });

  it("drops the transition of a track that was replaced by a newer request", () => {
    const events = deriveEngineEvents(
      snapshot(),
      snapshot({ trackId: "200", playbackId: "pq-2" }),
      { pauseRequested: false, onlyAcceptTrackId: "300" },
    );
    expect(events).toEqual([]);
  });

  it("accepts the requested track even on the first reading", () => {
    const events = deriveEngineEvents(null, snapshot(), {
      pauseRequested: false,
      onlyAcceptTrackId: "100",
    });
    expect(events[0]).toEqual({ type: "transition", trackId: "100", durationSeconds: 200 });
  });

  it("reports the end of a track that stopped at its end", () => {
    const events = deriveEngineEvents(
      snapshot({ positionSeconds: 198.9 }),
      snapshot({ positionSeconds: 199.8, playbackState: "NOT_PLAYING" }),
      idle,
    );
    expect(events).toEqual([{ type: "state", state: "NOT_PLAYING" }, { type: "ended" }]);
  });

  it("does not treat a pause as the end of the track", () => {
    const paused = snapshot({ playbackState: "NOT_PLAYING" });
    expect(deriveEngineEvents(snapshot(), paused, idle)).toEqual([
      { type: "state", state: "NOT_PLAYING" },
    ]);
    const pausedNearEnd = snapshot({ positionSeconds: 199.5, playbackState: "NOT_PLAYING" });
    expect(
      deriveEngineEvents(snapshot({ positionSeconds: 199 }), pausedNearEnd, {
        pauseRequested: true,
        onlyAcceptTrackId: null,
      }),
    ).toEqual([{ type: "state", state: "NOT_PLAYING" }]);
  });

  it("reports playback as stopped when the web player goes away", () => {
    const events = deriveEngineEvents(snapshot(), snapshot({ ready: false }), idle);
    expect(events).toEqual([{ type: "state", state: "NOT_PLAYING" }]);
  });

  it("forwards new translated notices only", () => {
    const withNotice = snapshot({ noticeId: 2, noticeMessage: "Este contenido ya no está disponible" });
    expect(deriveEngineEvents(snapshot({ noticeId: 1 }), withNotice, idle)).toEqual([
      { type: "notice", message: "Este contenido ya no está disponible" },
    ]);
    const untranslated = snapshot({ noticeId: 3, noticeMessage: "t-streaming-not-allowed" });
    expect(deriveEngineEvents(withNotice, untranslated, idle)).toEqual([]);
    expect(deriveEngineEvents(withNotice, withNotice, idle)).toEqual([]);
  });
});
