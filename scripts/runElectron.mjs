// Cross-platform wrapper around the electron-vite CLI.
// The Linux session needs two Chromium flags baked into the Electron argv
// (--no-sandbox and --in-process-gpu) to survive the Bazzite/SELinux and
// Wayland GPU-process issues — see the Linux launch runbook in AGENTS.md.
// Those flags are meaningless (and the sandbox flag is a security downgrade)
// on Windows, so they are only appended when running on Linux.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2] ?? "dev";
if (mode !== "dev" && mode !== "preview") {
  console.error("Usage: node scripts/runElectron.mjs <dev|preview>");
  process.exit(1);
}

const electronViteCli = join(
  dirname(fileURLToPath(new URL("../node_modules/electron-vite/package.json", import.meta.url))),
  "bin",
  "electron-vite.js",
);

const linuxOnlyArgs = ["--noSandbox", "--", "--in-process-gpu"];
const args = [mode, ...(process.platform === "linux" ? linuxOnlyArgs : [])];

const child = spawn(process.execPath, [electronViteCli, ...args], { stdio: "inherit" });
child.on("close", (code) => process.exit(code ?? 0));