import { describe, expect, it } from "vitest";
import { PlayCounter } from "@/lib/playCounter";

// Feeds half-second progress reports from `from` to `to` and tells whether any
// of them counted a play.
function listen(counter: PlayCounter, from: number, to: number, threshold = 30): boolean {
  let counted = false;
  for (let position = from; position <= to; position += 0.5) {
    if (counter.reportProgress(position, true, threshold)) counted = true;
  }
  return counted;
}

describe("PlayCounter", () => {
  it("counts a play once the threshold has been listened to", () => {
    const counter = new PlayCounter();
    counter.startPlayback();
    expect(listen(counter, 0, 29)).toBe(false);
    expect(listen(counter, 29.5, 31)).toBe(true);
  });

  it("counts only once per playback", () => {
    const counter = new PlayCounter();
    counter.startPlayback();
    expect(listen(counter, 0, 40)).toBe(true);
    expect(listen(counter, 40.5, 120)).toBe(false);
  });

  it("does not count seeking forward as listening", () => {
    const counter = new PlayCounter();
    counter.startPlayback();
    listen(counter, 0, 5);
    expect(counter.reportProgress(200, true, 30)).toBe(false);
    expect(listen(counter, 200.5, 220)).toBe(false);
    expect(listen(counter, 220.5, 226)).toBe(true);
  });

  it("ignores time that passes while paused", () => {
    const counter = new PlayCounter();
    counter.startPlayback();
    listen(counter, 0, 20);
    for (let report = 0; report < 100; report++) counter.reportProgress(20, false, 30);
    expect(listen(counter, 20.5, 29)).toBe(false);
    expect(listen(counter, 29.5, 31)).toBe(true);
  });

  it("starts over for the next playback, including a repeat of the same track", () => {
    const counter = new PlayCounter();
    counter.startPlayback();
    expect(listen(counter, 0, 35)).toBe(true);
    counter.startPlayback();
    expect(listen(counter, 0, 20)).toBe(false);
    expect(listen(counter, 20.5, 31)).toBe(true);
  });

  it("honors a custom threshold", () => {
    const counter = new PlayCounter();
    counter.startPlayback();
    expect(listen(counter, 0, 9, 10)).toBe(false);
    expect(listen(counter, 9.5, 11, 10)).toBe(true);
  });
});
