// The Castlabs Electron fork (github:castlabs/electron-releases) has no
// postinstall script in its package.json, so a plain `npm install` never
// downloads the platform binary into node_modules/electron/dist. That is why
// electron-vite fails with "Electron uninstall" on machines other than this one.
// This postinstall hook runs the fork's own install.js whenever the dist
// binary is missing, so `npm install` alone is enough to boot the app.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const electronModuleDir = dirname(
  fileURLToPath(new URL("../node_modules/electron/package.json", import.meta.url)),
);

const distVersionFile = join(electronModuleDir, "dist", "version");
if (existsSync(distVersionFile)) {
  process.exit(0);
}

const installScript = join(electronModuleDir, "install.js");
if (!existsSync(installScript)) {
  process.exit(0);
}

console.log("Electron binary not found — downloading from the Castlabs mirror…");
const result = spawnSync(process.execPath, [installScript], {
  cwd: electronModuleDir,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error(
    "Failed to download the Castlabs Electron binary. " +
      "Check network access to github.com/castlabs/electron-releases.",
  );
  process.exit(result.status ?? 1);
}