import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests cover pure logic only (lib helpers, stores, catalog parsers), so a
// plain Node environment is enough; no DOM or Electron runtime is loaded.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
