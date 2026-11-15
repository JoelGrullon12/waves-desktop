import { describe, expect, it } from "vitest";
import { SeekCoordinator, clampSeekPosition } from "./seekCoordinator";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("SeekCoordinator", () => {
  it("performs a single seek immediately", async () => {
    const seeks: number[] = [];
    const coordinator = new SeekCoordinator(async (seconds) => {
      seeks.push(seconds);
    });
    await coordinator.request(30);
    expect(seeks).toEqual([30]);
    expect(coordinator.isBusy).toBe(false);
  });

  it("keeps only the latest target requested while a seek is in flight", async () => {
    const seeks: number[] = [];
    const gate = deferred();
    const coordinator = new SeekCoordinator(async (seconds) => {
      seeks.push(seconds);
      if (seconds === 10) await gate.promise;
    });
    const first = coordinator.request(10);
    expect(coordinator.isBusy).toBe(true);
    void coordinator.request(20);
    void coordinator.request(30);
    gate.resolve();
    await first;
    expect(seeks).toEqual([10, 30]);
    expect(coordinator.isBusy).toBe(false);
  });

  it("recovers after a failed seek", async () => {
    let shouldFail = true;
    const seeks: number[] = [];
    const coordinator = new SeekCoordinator(async (seconds) => {
      if (shouldFail) throw new Error("seek failed");
      seeks.push(seconds);
    });
    await expect(coordinator.request(5)).rejects.toThrow("seek failed");
    expect(coordinator.isBusy).toBe(false);
    shouldFail = false;
    await coordinator.request(8);
    expect(seeks).toEqual([8]);
  });
});

describe("clampSeekPosition", () => {
  it("clamps into [0, duration]", () => {
    expect(clampSeekPosition(-5, 200)).toBe(0);
    expect(clampSeekPosition(250, 200)).toBe(200);
    expect(clampSeekPosition(90, 200)).toBe(90);
  });

  it("does not cap the upper bound while the duration is unknown", () => {
    expect(clampSeekPosition(90, 0)).toBe(90);
  });

  it("treats non-finite input as the start", () => {
    expect(clampSeekPosition(Number.NaN, 200)).toBe(0);
  });
});
