import { describe, expect, it } from "vitest";
import { buildEngineCall, ENGINE_GLOBAL } from "./tidalWebPlayerScript";

describe("buildEngineCall", () => {
  it("is valid JavaScript that ends with the requested call", () => {
    const script = buildEngineCall("play", "12345");
    expect(() => new Function(script)).not.toThrow();
    expect(script.trimEnd().endsWith(`window.${ENGINE_GLOBAL}.play("12345");`)).toBe(true);
  });

  it("embeds arguments as JSON so a value can never become code", () => {
    const hostile = '"); window.hacked = true; ("';
    const script = buildEngineCall("play", hostile);
    expect(script).toContain(JSON.stringify(hostile));
    expect(() => new Function(script)).not.toThrow();
  });

  it("serializes null, numbers and no arguments", () => {
    expect(buildEngineCall("setNext", null).trimEnd().endsWith(".setNext(null);")).toBe(true);
    expect(buildEngineCall("seek", 12.5).trimEnd().endsWith(".seek(12.5);")).toBe(true);
    expect(buildEngineCall("snapshot").trimEnd().endsWith(".snapshot();")).toBe(true);
  });
});
