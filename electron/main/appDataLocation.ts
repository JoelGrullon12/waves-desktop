import { app, BrowserWindow, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppDataInfo, AppDataMoveResult } from "../../src/types/player";
import { parseIni, serializeIni } from "./iniFile";
import { handleTrusted } from "./secureIpc";

// Where Waves keeps its own data: settings.ini, the local database, the
// encrypted secrets and the log. By default it is Electron's user data folder
// (~/.config/waves-desktop on Linux, %APPDATA%\waves-desktop on Windows); the
// user can move it from Settings.
//
// Chromium's own data (the signed-in TIDAL web session and the Widevine CDM)
// always stays in the system folder, so moving the data never signs the user
// out or removes DRM. The chosen folder is written in a small pointer file in
// the system folder, which is the one place the app can always find.

const LOCATION_FILE = "waves-location.ini";
const LOCATION_KEY = "data.directory";

type MoveResult = AppDataMoveResult;

let resolvedDirectory: string | null = null;

export function systemDataDirectory(): string {
  return app.getPath("userData");
}

function locationFilePath(): string {
  return path.join(systemDataDirectory(), LOCATION_FILE);
}

function readChosenDirectory(): string | null {
  try {
    if (!fs.existsSync(locationFilePath())) return null;
    const chosen = parseIni(fs.readFileSync(locationFilePath(), "utf8"))[LOCATION_KEY];
    if (!chosen || !path.isAbsolute(chosen)) return null;
    if (!fs.statSync(chosen).isDirectory()) return null;
    return chosen;
  } catch (error) {
    // Unplugged drive or deleted folder: run from the system folder instead
    // of failing to start.
    console.error(`app-data: the chosen folder is not available, using the default one: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export function dataDirectory(): string {
  resolvedDirectory ??= readChosenDirectory() ?? systemDataDirectory();
  return resolvedDirectory;
}

export function appDataInfo(): AppDataInfo {
  const directory = dataDirectory();
  const defaultDirectory = systemDataDirectory();
  return { directory, defaultDirectory, isDefault: path.resolve(directory) === path.resolve(defaultDirectory) };
}

// Copies the given files into `targetDirectory` and, once all are there,
// removes the originals and points the app at the new folder. When the target
// already holds Waves data (another install, a synced folder) that data is
// used as it is and nothing is copied over it.
export function moveDataDirectory(targetDirectory: string, fileNames: readonly string[]): MoveResult {
  const sourceDirectory = dataDirectory();
  const target = path.resolve(targetDirectory);
  if (target === path.resolve(sourceDirectory)) return { success: false, error: "That is already the data folder." };
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.W_OK);
  } catch {
    return { success: false, error: "Waves can not write to that folder." };
  }

  const usedExistingData = fileNames.some((fileName) => fs.existsSync(path.join(target, fileName)));
  if (!usedExistingData) {
    const copied: string[] = [];
    try {
      for (const fileName of fileNames) {
        const sourcePath = path.join(sourceDirectory, fileName);
        if (!fs.existsSync(sourcePath)) continue;
        fs.copyFileSync(sourcePath, path.join(target, fileName), fs.constants.COPYFILE_EXCL);
        copied.push(fileName);
      }
    } catch (error) {
      for (const fileName of copied) fs.rmSync(path.join(target, fileName), { force: true });
      return { success: false, error: `Could not copy the data: ${error instanceof Error ? error.message : error}` };
    }
    for (const fileName of copied) fs.rmSync(path.join(sourceDirectory, fileName), { force: true });
  }

  if (target === path.resolve(systemDataDirectory())) {
    fs.rmSync(locationFilePath(), { force: true });
  } else {
    fs.writeFileSync(
      locationFilePath(),
      serializeIni({ [LOCATION_KEY]: target }, ["Folder where Waves keeps its settings, database and secrets."]),
      "utf8",
    );
  }
  resolvedDirectory = target;
  return { success: true, usedExistingData };
}

export function openDataDirectory(): Promise<string> {
  return shell.openPath(dataDirectory());
}

interface AppDataHandlerOptions {
  // Files that move with the data folder.
  movableFiles: () => readonly string[];
  // Closes whatever holds those files open (the database) before they move.
  releaseFiles: () => void;
}

// Restarts the app so every module opens its files in the new folder. The
// answer reaches the renderer first.
function relaunchSoon(): void {
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 300);
}

export function registerAppDataHandlers(options: AppDataHandlerOptions): void {
  const move = (targetDirectory: string): MoveResult => {
    options.releaseFiles();
    const result = moveDataDirectory(targetDirectory, options.movableFiles());
    // On success and on failure alike the app restarts, because the database
    // was closed to move it.
    relaunchSoon();
    return result;
  };

  handleTrusted("app-data:get-info", () => appDataInfo());
  handleTrusted("app-data:open-folder", async () => {
    const error = await openDataDirectory();
    return error ? { success: false, error } : { success: true };
  });
  // The folder is picked in a native dialog here, so the renderer never sends
  // a path.
  handleTrusted("app-data:change-location", async (event): Promise<MoveResult | null> => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Choose where Waves keeps its data",
      defaultPath: dataDirectory(),
      properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
    };
    const choice = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    const chosen = choice.filePaths[0];
    if (choice.canceled || !chosen) return null;
    if (path.resolve(chosen) === path.resolve(dataDirectory())) {
      return { success: false, error: "That is already the data folder." };
    }
    return move(chosen);
  });
  handleTrusted("app-data:use-default-location", (): MoveResult => {
    if (appDataInfo().isDefault) return { success: false, error: "The data is already in the default folder." };
    return move(systemDataDirectory());
  });
}
