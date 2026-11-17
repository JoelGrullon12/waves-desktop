import { describe, expect, it } from "vitest";
import { isThemeChoice, resolveTheme } from "@/lib/theme";

describe("resolveTheme", () => {
  it("follows the system only when asked to", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("isThemeChoice", () => {
  it("accepts only known choices", () => {
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("sepia")).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });
});
