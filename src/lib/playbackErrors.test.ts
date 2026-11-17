import { describe, expect, it } from "vitest";
import {
  canSkipAnother,
  isPlayInterruption,
  isSkippableError,
  MAX_CONSECUTIVE_SKIPS,
  PlaybackFailure,
} from "@/lib/playbackErrors";

describe("isPlayInterruption", () => {
  it("recognizes a play request replaced by a newer one", () => {
    expect(isPlayInterruption(new PlaybackFailure("superseded"))).toBe(true);
  });

  it("does not hide real failures", () => {
    expect(isPlayInterruption(new PlaybackFailure("timeout"))).toBe(false);
    expect(isPlayInterruption(new Error("Network down"))).toBe(false);
    expect(isPlayInterruption(null)).toBe(false);
  });
});

describe("isSkippableError", () => {
  it("skips tracks TIDAL refuses to play", () => {
    expect(isSkippableError(new PlaybackFailure("unavailable"))).toBe(true);
  });

  it("does not skip transient or engine failures", () => {
    expect(isSkippableError(new PlaybackFailure("timeout"))).toBe(false);
    expect(isSkippableError(new PlaybackFailure("engine-unavailable"))).toBe(false);
    expect(isSkippableError(new PlaybackFailure("not-logged-in"))).toBe(false);
    expect(isSkippableError(new Error("boom"))).toBe(false);
    expect(isSkippableError(undefined)).toBe(false);
  });
});

describe("PlaybackFailure", () => {
  it("carries a message meant for the user", () => {
    expect(new PlaybackFailure("not-logged-in").message).toContain("Settings");
  });
});

describe("canSkipAnother", () => {
  it("allows skips until the consecutive limit", () => {
    expect(canSkipAnother(0)).toBe(true);
    expect(canSkipAnother(MAX_CONSECUTIVE_SKIPS - 1)).toBe(true);
    expect(canSkipAnother(MAX_CONSECUTIVE_SKIPS)).toBe(false);
  });
});
