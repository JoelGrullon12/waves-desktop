import { describe, expect, it } from "vitest";
import {
  readBooleanPreference,
  readChoicePreference,
  readJsonPreference,
  readNumberPreference,
} from "@/lib/preferences";
import { isRepeatMode } from "@/lib/queueOrder";

describe("readNumberPreference", () => {
  it("returns the stored number when it is inside the range", () => {
    expect(readNumberPreference({ volume: "35" }, "volume", 80, 0, 100)).toBe(35);
    expect(readNumberPreference({ volume: "0" }, "volume", 80, 0, 100)).toBe(0);
  });

  it("falls back for missing, empty, invalid or out-of-range values", () => {
    expect(readNumberPreference({}, "volume", 80, 0, 100)).toBe(80);
    expect(readNumberPreference({ volume: "" }, "volume", 80, 0, 100)).toBe(80);
    expect(readNumberPreference({ volume: "loud" }, "volume", 80, 0, 100)).toBe(80);
    expect(readNumberPreference({ volume: "250" }, "volume", 80, 0, 100)).toBe(80);
  });
});

describe("readBooleanPreference", () => {
  it("reads true and false and falls back otherwise", () => {
    expect(readBooleanPreference({ shuffle: "true" }, "shuffle", false)).toBe(true);
    expect(readBooleanPreference({ shuffle: "false" }, "shuffle", true)).toBe(false);
    expect(readBooleanPreference({ shuffle: "yes" }, "shuffle", true)).toBe(true);
    expect(readBooleanPreference({}, "shuffle", false)).toBe(false);
  });
});

describe("readChoicePreference", () => {
  it("accepts only known choices", () => {
    expect(readChoicePreference({ repeat: "one-once" }, "repeat", isRepeatMode, "off")).toBe(
      "one-once",
    );
    expect(readChoicePreference({ repeat: "forever" }, "repeat", isRepeatMode, "off")).toBe("off");
  });
});

describe("readJsonPreference", () => {
  const isSource = (value: unknown): value is { sourceId: string } =>
    typeof value === "object" && value !== null && typeof (value as { sourceId?: unknown }).sourceId === "string";

  it("parses a valid stored object", () => {
    expect(readJsonPreference({ source: '{"sourceId":"p1"}' }, "source", isSource)).toEqual({
      sourceId: "p1",
    });
  });

  it("returns null for missing, malformed or mismatching values", () => {
    expect(readJsonPreference({}, "source", isSource)).toBeNull();
    expect(readJsonPreference({ source: "{broken" }, "source", isSource)).toBeNull();
    expect(readJsonPreference({ source: "42" }, "source", isSource)).toBeNull();
  });
});
