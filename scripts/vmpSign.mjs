// VMP-signs the Castlabs Electron build with castlabs' EVS service.
//
// WHY (verified 2026-11-16 on Windows): TIDAL's license server answers every
// Widevine request from an unsigned build with HTTP 400 "Widevine license
// request failed [status: ACCESS_DENIED, ... vmp: null]" and the web player
// shows PlaybackError S6007: the track loads but never sounds. The
// electron.exe.sig shipped by Castlabs is a development signature that
// production license servers refuse. Linux has no VMP, so this only matters on
// Windows (and macOS).
//
// One-time setup (free castlabs account, the tool is not an npm dependency):
//   python -m pip install --upgrade castlabs-evs
//   python -m castlabs_evs.account signup      (or: ... account reauth)
//
// Usage:
//   npm run vmp:sign                 signs node_modules/electron/dist (npm run dev)
//   electron-builder afterSign hook  signs the packaged app before the installer
//                                    is built (see electron-builder.yml)
// Signing must come after anything else that modifies the executable (icon
// stamping, Authenticode), which electron-builder has done by afterSign.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLATFORMS_THAT_NEED_VMP = new Set(["win32", "darwin"]);
// WAVES_SKIP_VMP=1 packages without signing (the result will not play on Windows).
const SKIP_SIGNING = process.env.WAVES_SKIP_VMP === "1";

function pythonCandidates() {
  return process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
}

export function signPackage(packageDirectory) {
  for (const python of pythonCandidates()) {
    const probe = spawnSync(python, ["-c", "import castlabs_evs"], { stdio: "ignore" });
    if (probe.error || probe.status !== 0) continue;
    console.log(`VMP: signing ${packageDirectory} with castlabs EVS…`);
    const result = spawnSync(python, ["-m", "castlabs_evs.vmp", "sign-pkg", packageDirectory], {
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(
        "castlabs EVS signing failed. If the account session expired, run " +
          `"${python} -m castlabs_evs.account reauth" and try again.`,
      );
    }
    return;
  }
  throw new Error(
    "castlabs-evs is not installed. Run \"python -m pip install --upgrade castlabs-evs\" and " +
      "\"python -m castlabs_evs.account signup\" once (free account), or set WAVES_SKIP_VMP=1 " +
      "to package without it (TIDAL then refuses the Widevine license on Windows).",
  );
}

// electron-builder afterSign hook (runs after Authenticode, before the installer
// is built): context.appOutDir is the unpacked app folder.
export async function afterSign(context) {
  const platform = context.electronPlatformName;
  if (!PLATFORMS_THAT_NEED_VMP.has(platform)) return;
  if (SKIP_SIGNING) {
    console.warn("VMP: WAVES_SKIP_VMP=1, the package is NOT signed and will not play on Windows.");
    return;
  }
  signPackage(context.appOutDir);
}

const isCommandLine =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCommandLine) {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const target = process.argv[2]
    ? resolve(process.argv[2])
    : join(projectRoot, "node_modules", "electron", "dist");
  try {
    signPackage(target);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
