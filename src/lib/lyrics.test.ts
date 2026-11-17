import { describe, expect, it } from "vitest";
import { activeLineIndex, parseLrc } from "@/lib/lyrics";

describe("parseLrc", () => {
  it("reads one line per timestamp, in time order", () => {
    const lines = parseLrc("[00:13.71]First line\n[00:26.29]Second line\n\n[01:02]Third");
    expect(lines).toEqual([
      { timeSeconds: 13.71, text: "First line" },
      { timeSeconds: 26.29, text: "Second line" },
      { timeSeconds: 62, text: "Third" },
    ]);
  });

  it("repeats a line with several timestamps and keeps empty pauses", () => {
    expect(parseLrc("[00:10.00][00:30.00]Chorus\n[00:20.00]\n[ar:Someone]")).toEqual([
      { timeSeconds: 10, text: "Chorus" },
      { timeSeconds: 20, text: "" },
      { timeSeconds: 30, text: "Chorus" },
    ]);
  });

  it("ignores lines without a leading timestamp", () => {
    expect(parseLrc("plain text\nmid [00:01.00] stamp")).toEqual([]);
  });
});

describe("activeLineIndex", () => {
  const lines = parseLrc("[00:05.00]a\n[00:10.00]b\n[00:15.00]c");

  it("finds the last line that has started", () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 5)).toBe(0);
    expect(activeLineIndex(lines, 12.3)).toBe(1);
    expect(activeLineIndex(lines, 600)).toBe(2);
    expect(activeLineIndex([], 3)).toBe(-1);
  });
});
