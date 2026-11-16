import { describe, expect, it } from "vitest";
import {
  EMPTY_REMOTE_STATE,
  isPairingTokenValid,
  parseRemoteCommand,
  sanitizeRemoteState,
} from "./remoteProtocol";

describe("parseRemoteCommand", () => {
  it("accepts the transport commands", () => {
    for (const type of ["play", "pause", "next", "previous"]) {
      expect(parseRemoteCommand(JSON.stringify({ type }))).toEqual({ type });
    }
  });

  it("accepts volume and seek inside their ranges", () => {
    expect(parseRemoteCommand('{"type":"set_volume","value":42.6}')).toEqual({
      type: "set_volume",
      value: 43,
    });
    expect(parseRemoteCommand('{"type":"seek","value":95.5}')).toEqual({ type: "seek", value: 95.5 });
  });

  it("rejects everything else", () => {
    const rejected = [
      "not json",
      "null",
      '"play"',
      '{"type":"shutdown"}',
      '{"type":"set_volume","value":101}',
      '{"type":"set_volume","value":"50"}',
      '{"type":"seek","value":-1}',
      '{"type":"seek"}',
      JSON.stringify({ type: "play", padding: "x".repeat(300) }),
    ];
    for (const message of rejected) expect(parseRemoteCommand(message)).toBeNull();
  });
});

describe("isPairingTokenValid", () => {
  it("accepts only the exact token", () => {
    expect(isPairingTokenValid("abc123", "abc123")).toBe(true);
    expect(isPairingTokenValid("abc124", "abc123")).toBe(false);
    expect(isPairingTokenValid("abc", "abc123")).toBe(false);
    expect(isPairingTokenValid(null, "abc123")).toBe(false);
    expect(isPairingTokenValid("", "")).toBe(false);
  });
});

describe("sanitizeRemoteState", () => {
  it("keeps the known fields with their types", () => {
    const state = sanitizeRemoteState({
      trackId: "1",
      title: "Song",
      artist: "Artist",
      album: "Album",
      artworkUrl: "https://resources.tidal.com/a.jpg",
      isPlaying: true,
      positionSeconds: 12.5,
      durationSeconds: 200,
      volume: 80,
      accessToken: "secret",
    });
    expect(state).toEqual({
      trackId: "1",
      title: "Song",
      artist: "Artist",
      album: "Album",
      artworkUrl: "https://resources.tidal.com/a.jpg",
      isPlaying: true,
      positionSeconds: 12.5,
      durationSeconds: 200,
      volume: 80,
    });
  });

  it("drops anything unexpected", () => {
    expect(sanitizeRemoteState(null)).toEqual(EMPTY_REMOTE_STATE);
    const state = sanitizeRemoteState({ artworkUrl: "javascript:alert(1)", volume: 900, isPlaying: "yes" });
    expect(state.artworkUrl).toBeNull();
    expect(state.volume).toBe(0);
    expect(state.isPlaying).toBe(false);
  });
});
