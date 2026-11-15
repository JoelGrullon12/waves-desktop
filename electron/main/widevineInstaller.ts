import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { isSafeEntryName, readCrxEntries } from "./crxArchive";

// The Component Updater downloads the official Widevine package into
// component_crx_cache/ but sometimes fails to install it, leaving
// WidevineCdm/ empty (DRM error S6001). This unpacks that cached package
// ourselves so a clean checkout needs no manual CDM copy.

const WIDEVINE_COMPONENT_ID = "oimompecagnajdejgnnjijobebaeigek";
const CRX_CACHE_DIRECTORY = "component_crx_cache";
const CRX_CACHE_METADATA_FILE = "metadata.json";
const CDM_DIRECTORY = "WidevineCdm";
const LATEST_VERSION_POINTER_FILE = "latest-component-updated-widevine-cdm";

export type WidevineInstallResult =
  | { status: "already-installed" }
  | { status: "installed"; version: string }
  | { status: "no-package" }
  | { status: "failed"; error: string };

function hasInstalledVersion(cdmDirectory: string): boolean {
  if (!fs.existsSync(cdmDirectory)) return false;
  return fs
    .readdirSync(cdmDirectory, { withFileTypes: true })
    .some(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(cdmDirectory, entry.name, "manifest.json")),
    );
}

function findCachedWidevinePackage(cacheDirectory: string): string | null {
  const metadataPath = path.join(cacheDirectory, CRX_CACHE_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) return null;
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
    hashes?: Record<string, { appid?: string }>;
  };
  for (const [hash, details] of Object.entries(metadata.hashes ?? {})) {
    const packagePath = path.join(cacheDirectory, hash);
    if (details.appid === WIDEVINE_COMPONENT_ID && fs.existsSync(packagePath)) return packagePath;
  }
  return null;
}

export function installWidevineFromCache(): WidevineInstallResult {
  try {
    const userDataPath = app.getPath("userData");
    const cdmDirectory = path.join(userDataPath, CDM_DIRECTORY);
    if (hasInstalledVersion(cdmDirectory)) return { status: "already-installed" };

    const packagePath = findCachedWidevinePackage(path.join(userDataPath, CRX_CACHE_DIRECTORY));
    if (!packagePath) return { status: "no-package" };

    const entries = readCrxEntries(fs.readFileSync(packagePath));
    const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
    if (!manifestEntry) throw new Error("Widevine package has no manifest.json.");
    const { version } = JSON.parse(manifestEntry.data.toString("utf8")) as { version?: string };
    if (!version || !/^[0-9.]+$/.test(version)) {
      throw new Error("Widevine package has an invalid version.");
    }

    // Written to a sibling folder first so an interrupted run never leaves a
    // half-extracted version that looks installed.
    const versionDirectory = path.join(cdmDirectory, version);
    const stagingDirectory = `${versionDirectory}.partial`;
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    for (const entry of entries) {
      if (!isSafeEntryName(entry.name)) throw new Error(`Unsafe entry "${entry.name}".`);
      const destination = path.join(stagingDirectory, entry.name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, entry.data);
    }
    fs.rmSync(versionDirectory, { recursive: true, force: true });
    fs.renameSync(stagingDirectory, versionDirectory);
    fs.writeFileSync(
      path.join(cdmDirectory, LATEST_VERSION_POINTER_FILE),
      JSON.stringify({ Path: versionDirectory }),
    );
    return { status: "installed", version };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
