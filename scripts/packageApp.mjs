// Packages the app for one platform: `node scripts/packageApp.mjs <linux|win>`.
//
// electron-builder is pointed at a folder holding the Castlabs Electron build
// (`electronDist`), because that fork is not on the standard Electron release
// server. The folder npm installs (node_modules/electron/dist) only has the
// build of the machine doing the install, so packaging for Windows from Linux
// used to hand electron-builder a Linux binary and fail when it looked for
// electron.exe. This script downloads the build of the TARGET platform into
// its own cache folder and packages from there, so either platform can be
// packaged from either machine.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = {
  linux: { electronPlatform: "linux", builderFlag: "--linux", executable: "electron" },
  win: { electronPlatform: "win32", builderFlag: "--win", executable: "electron.exe" },
};
const CASTLABS_MIRROR = "https://github.com/castlabs/electron-releases/releases/download/";

const target = TARGETS[process.argv[2]];
if (!target) {
  console.error("Usage: node scripts/packageApp.mjs <linux|win>");
  process.exit(1);
}

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronModuleDir = join(projectRoot, "node_modules", "electron");
// The fork's own dependencies know how to download and unpack its releases.
const requireFromElectron = createRequire(join(electronModuleDir, "package.json"));
const { version } = requireFromElectron("./package.json");
const architecture = process.env.npm_config_arch || "x64";

async function resolveElectronDist() {
  // The build npm already installed is the right one for this machine.
  if (target.electronPlatform === process.platform && architecture === process.arch) {
    return join(electronModuleDir, "dist");
  }
  const distDir = join(
    projectRoot,
    "node_modules",
    ".cache",
    "waves-electron",
    `${target.electronPlatform}-${architecture}`,
  );
  const versionMarker = join(distDir, ".waves-version");
  const isCached =
    existsSync(join(distDir, target.executable)) &&
    existsSync(versionMarker) &&
    readFileSync(versionMarker, "utf8") === version;
  if (isCached) return distDir;

  console.log(`Downloading Electron ${version} for ${target.electronPlatform}-${architecture}…`);
  const { downloadArtifact } = requireFromElectron("@electron/get");
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    mirrorOptions: { mirror: CASTLABS_MIRROR },
    checksums: requireFromElectron("./checksums.json"),
    platform: target.electronPlatform,
    arch: architecture,
  });
  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  const { extract } = requireFromElectron("@electron-internal/extract-zip");
  await extract(zipPath, { dir: distDir });
  writeFileSync(versionMarker, version);
  return distDir;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const electronDist = await resolveElectronDist();
const builderCli = join(projectRoot, "node_modules", "electron-builder", "cli.js");
const builderArgs = [builderCli, target.builderFlag];
if (target.electronPlatform === "win32" && process.platform !== "win32") {
  const hasWine = spawnSync("wine", ["--version"], { stdio: "ignore" }).status === 0;
  if (!hasWine) {
    // The NSIS installer and the icon/version stamp of the .exe are made by
    // Windows programs, which need Wine here. Without it the app is delivered
    // as a zip: unzip it on Windows and run "Waves Desktop.exe".
    console.log(
      "Wine is not installed: building a portable .zip instead of the installer " +
        "(the .exe keeps Electron's default icon). Package on Windows, or install Wine, " +
        "to get the NSIS installer.",
    );
    builderArgs.push("zip", "-c.win.signAndEditExecutable=false");
  }
}
builderArgs.push(`-c.electronDist=${electronDist}`);
run(process.execPath, builderArgs);
