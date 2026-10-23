import { describe, expect, it } from "vitest";
import { formatDuration, formatTotalDuration } from "@/lib/format";

describe("formatDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(formatDuration(178)).toBe("2:58");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(9)).toBe("0:09");
  });

  it("drops fractional seconds", () => {
    expect(formatDuration(59.9)).toBe("0:59");
  });

  it("falls back to 0:00 for missing or invalid input", () => {
    expect(formatDuration(undefined)).toBe("0:00");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });
});

describe("formatTotalDuration", () => {
  it("formats minutes below one hour", () => {
    expect(formatTotalDuration(59 * 60)).toBe("59 min");
  });

  it("formats hours with zero-padded minutes", () => {
    expect(formatTotalDuration(3600 + 5 * 60)).toBe("1 hr 05 min");
    expect(formatTotalDuration(2 * 3600 + 30 * 60)).toBe("2 hr 30 min");
  });

  it("falls back to 0 min for missing or invalid input", () => {
    expect(formatTotalDuration(undefined)).toBe("0 min");
    expect(formatTotalDuration(0)).toBe("0 min");
    expect(formatTotalDuration(Number.POSITIVE_INFINITY)).toBe("0 min");
  });
});
