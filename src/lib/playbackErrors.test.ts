import { describe, expect, it } from "vitest";
import { canSkipAnother, isPlayInterruption, isSkippableError, MAX_CONSECUTIVE_SKIPS } from "@/lib/playbackErrors";

describe("isPlayInterruption", () => {
  it("recognizes an AbortError by name", () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    expect(isPlayInterruption(error)).toBe(true);
  });

  it("recognizes the browser pause-interruption message", () => {
    const error = new Error(
      "The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22",
    );
    expect(isPlayInterruption(error)).toBe(true);
  });

  it("recognizes the new-load interruption message on plain objects", () => {
    expect(
      isPlayInterruption({ message: "The play() request was interrupted by a new load request." }),
    ).toBe(true);
  });

  it("does not hide real failures", () => {
    expect(isPlayInterruption(new Error("Network down"))).toBe(false);
    expect(isPlayInterruption("interrupted by a call to pause")).toBe(false);
    expect(isPlayInterruption(null)).toBe(false);
  });
});

describe("isSkippableError", () => {
  it("skips tracks the service refuses to play", () => {
    expect(isSkippableError({ errorId: "PENotAllowed", errorCode: "NPBI0" })).toBe(true);
    expect(isSkippableError({ errorId: "PEContentNotAvailableInLocation" })).toBe(true);
    expect(isSkippableError({ errorId: "PEContentNotAvailableForSubscription" })).toBe(true);
  });

  it("does not skip transient or unknown failures", () => {
    expect(isSkippableError({ errorId: "PERetryable" })).toBe(false);
    expect(isSkippableError({ errorId: "PENetwork" })).toBe(false);
    expect(isSkippableError({ errorId: "EUnexpected" })).toBe(false);
    expect(isSkippableError(new Error("boom"))).toBe(false);
    expect(isSkippableError(undefined)).toBe(false);
  });
});

describe("canSkipAnother", () => {
  it("allows skips until the consecutive limit", () => {
    expect(canSkipAnother(0)).toBe(true);
    expect(canSkipAnother(MAX_CONSECUTIVE_SKIPS - 1)).toBe(true);
    expect(canSkipAnother(MAX_CONSECUTIVE_SKIPS)).toBe(false);
  });
});
