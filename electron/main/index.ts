import { app, BrowserWindow, components } from "electron";
import path from "node:path";
import { dataDirectory, registerAppDataHandlers } from "./appDataLocation";
import { SECRETS_FILE } from "./appSecrets";
import { registerAuthHandlers } from "./auth";
import { registerCatalogHandlers } from "./catalog";
import { currentLogFile, startFileLog } from "./fileLog";
import { closeDatabase, DATABASE_FILES, initializeDatabase, isDatabaseInDataDirectory } from "./database";
import { registerLibraryHandlers } from "./libraryCatalog";
import { CACHE_STATUS_CHANNEL, getMetadataCache, registerMetadataCacheHandlers } from "./metadataCache";
import { registerApiExplorer } from "./tidalApiClient";
import { registerStatsHandlers, setPlayCountedListener } from "./playCountRepository";
import { SETTINGS_FILE } from "./preferencesFile";
import { initializePreferences, registerPreferencesHandlers } from "./preferencesRepository";
import {
  getRemoteControl,
  registerRemoteControlHandlers,
  REMOTE_COMMAND_CHANNEL,
} from "./remoteControl";
import { configureTrustedRenderer } from "./secureIpc";
import { registerCredentialHandlers } from "./tidalAppCredentials";
import { registerTrackDetailsHandlers } from "./trackDetails";
import { registerPlaylistEditingHandlers } from "./playlistEditing";
import {
  PLAYER_MEDIA_KEY_CHANNEL,
  PLAYER_STATE_CHANNEL,
  registerPlayerHandlers,
  tidalWebPlayer,
} from "./tidalWebPlayer";
import { registerWebSessionHandlers, setWebSessionListener } from "./webSessionAuth";
import { pushPlayedTrack, registerSyncHandlers, startTursoSync } from "./tursoSync";
import { installWidevineFromCache, type WidevineInstallResult } from "./widevineInstaller";

// Debug only: run against a copy of the profile (TIDAL session, Widevine, data)
// so automated checks never touch the real one. Must run before `ready`.
const debugUserDataDirectory = process.env["WAVES_USER_DATA_DIRECTORY"];
if (debugUserDataDirectory && path.isAbsolute(debugUserDataDirectory)) {
  app.setPath("userData", debugUserDataDirectory);
}

startFileLog(dataDirectory());
console.info(
  `waves: starting ${app.getVersion()} on ${process.platform} ${process.arch} ` +
    `(Electron ${process.versions.electron}, ${app.isPackaged ? "packaged" : "development"})`,
);

// How long the window waits for the Widevine Component Updater. It has been
// seen to never answer; the window must open anyway.
const WIDEVINE_WAIT_MS = 20_000;

// Electron is launched with `--no-sandbox` (see package.json scripts and
// electron-builder.yml). On Linux, the npm-installed Electron fork has no SUID
// chrome-sandbox helper, so Chromium's process sandbox cannot initialize on
// distros like Fedora/Bazzite with SELinux enforcing (zygote crashes at
// startup). The app only renders its own bundled content with contextIsolation
// on, so disabling the sandbox is an acceptable plug-and-play trade-off.

function logWidevineInstall(result: WidevineInstallResult): void {
  if (result.status === "installed") {
    console.info(`Widevine CDM ${result.version} unpacked from the cached package.`);
  } else if (result.status === "failed") {
    console.error(`Widevine CDM unpack failed: ${result.error}`);
  }
}

// Engine events can arrive while the window is closing or reloading, when
// there is no page left to receive them.
function sendToRenderer(targetWindow: BrowserWindow, channel: string, payload: unknown): void {
  if (targetWindow.isDestroyed() || targetWindow.webContents.isDestroyed()) return;
  if (targetWindow.webContents.mainFrame.isDestroyed()) return;
  targetWindow.webContents.send(channel, payload);
}

async function createWindow(): Promise<void> {

  const mainWindow = new BrowserWindow({
    title: "Waves",
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/contextBridge.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload scripts require the sandbox to be disabled. contextIsolation
      // stays on, so the renderer still only talks to the main process through
      // the typed window.api bridge.
      sandbox: false,
    },
  });

  const developmentRenderUrl = process.env["ELECTRON_RENDERER_URL"];
  watchWindowHealth(mainWindow);

  // The renderer only ever shows the app's own pages; navigation elsewhere and
  // new windows are blocked so a stray link can never load remote content next
  // to the IPC bridge.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const isAppPage = developmentRenderUrl
      ? targetUrl.startsWith(developmentRenderUrl)
      : targetUrl.startsWith("file:");
    if (!isAppPage) event.preventDefault();
  });

  const stopForwardingPlayerState = tidalWebPlayer.onSnapshot((snapshot) => {
    sendToRenderer(mainWindow, PLAYER_STATE_CHANNEL, snapshot);
  });
  const stopForwardingMediaKeys = tidalWebPlayer.onMediaKey((command) => {
    sendToRenderer(mainWindow, PLAYER_MEDIA_KEY_CHANNEL, command);
  });
  getRemoteControl().onCommand((command) =>
    sendToRenderer(mainWindow, REMOTE_COMMAND_CHANNEL, command),
  );
  const stopForwardingCacheStatus = getMetadataCache().onStatus((status) => {
    sendToRenderer(mainWindow, CACHE_STATUS_CHANNEL, status);
  });
  mainWindow.on("closed", () => {
    stopForwardingCacheStatus();
    void getRemoteControl().stop();
    stopForwardingPlayerState();
    stopForwardingMediaKeys();
    // The engine window is hidden: without this the app would keep running
    // (and playing) with no visible window.
    tidalWebPlayer.shutDown();
  });

  if (developmentRenderUrl) {
    await mainWindow.loadURL(developmentRenderUrl);
  } else {
    await mainWindow.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
  }
}

let isQuitting = false;
app.on("before-quit", () => {
  isQuitting = true;
});

// A page that fails to load or crashes would otherwise leave a blank window
// with no clue; this logs why and shows it.
function watchWindowHealth(mainWindow: BrowserWindow): void {
  const contents = mainWindow.webContents;
  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    // -3 is a navigation replaced by another one, not a failure.
    if (!isMainFrame || isQuitting || errorCode === -3) return;
    console.error(`window: could not load ${validatedUrl}: ${errorDescription} (${errorCode})`);
    showErrorPage(mainWindow, `The app page could not be loaded: ${errorDescription} (${errorCode}).`);
  });
  contents.on("render-process-gone", (_event, details) => {
    console.error(`window: page process gone (${details.reason}, exit code ${details.exitCode})`);
    // "killed" is the system or the user ending it (also on shutdown); only a
    // real failure gets the error page.
    if (!isQuitting && details.reason !== "clean-exit" && details.reason !== "killed") {
      showErrorPage(mainWindow, `The app page stopped (${details.reason}).`);
    }
  });
  contents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`window: preload ${preloadPath} failed: ${error.stack ?? error.message}`);
  });
  contents.on("console-message", (event) => {
    if (event.level === "error" || event.level === "warning") {
      console.warn(`renderer ${event.level}: ${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });
}

function showErrorPage(mainWindow: BrowserWindow, reason: string): void {
  if (mainWindow.isDestroyed()) return;
  const logFile = currentLogFile() ?? "(no log file)";
  const escape = (text: string) => text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
  const page = `<!doctype html><meta charset="utf-8"><title>Waves</title>
<body style="font-family:system-ui,sans-serif;background:#111;color:#eee;padding:2rem;line-height:1.5">
<h1 style="font-size:1.25rem">Waves could not start its window</h1>
<p>${escape(reason)}</p>
<p>Details are in the log file:<br><code>${escape(logFile)}</code></p></body>`;
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`).catch(() => undefined);
}

// Utility processes (audio, the Widevine CDM, GPU) can die without taking the
// window with them; silent playback is one symptom.
app.on("child-process-gone", (_event, details) => {
  console.error(
    `process gone: ${details.type}${details.name ? ` (${details.name})` : ""} ${details.reason}, exit code ${details.exitCode}`,
  );
});

async function waitForWidevine(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), WIDEVINE_WAIT_MS);
  });
  try {
    const outcome = await Promise.race([components.whenReady().then(() => "ready" as const), timeout]);
    if (outcome === "timeout") {
      console.error(`Widevine component did not answer within ${WIDEVINE_WAIT_MS} ms`, components.status());
    }
  } finally {
    clearTimeout(timer);
  }
}

app.whenReady().then(async () => {
  // Castlabs ECS: the Widevine CDM is fetched and installed by the Component
  // Updater. Await it before creating the window so DRM is ready on first
  // paint. If the install fails (e.g. offline first run), keep going: the
  // window still opens and the CDM can be retried on a later launch.
  // A package cached by an earlier run can be unpacked before Chromium looks
  // for the CDM, so DRM works on this very launch.
  logWidevineInstall(installWidevineFromCache());
  try {
    await waitForWidevine();
  } catch (reason) {
    // The status shows which component (if any) was downloaded but not
    // installed, which is how a missing CDM shows up as DRM error S6001.
    console.error("Widevine component install failed:", reason, components.status());
  }
  // On a clean first run the package is only downloaded during whenReady();
  // unpack it now so the next launch has DRM (Chromium already scanned for it).
  logWidevineInstall(installWidevineFromCache());

  configureTrustedRenderer(process.env["ELECTRON_RENDERER_URL"]);
  registerCredentialHandlers();
  registerAuthHandlers();
  registerCatalogHandlers();
  registerTrackDetailsHandlers();
  registerPlaylistEditingHandlers();
  registerLibraryHandlers();
  registerWebSessionHandlers();
  registerPlayerHandlers();
  registerApiExplorer();
  initializeDatabase();
  initializePreferences();
  registerPreferencesHandlers();
  registerAppDataHandlers({
    movableFiles: () => [SETTINGS_FILE, SECRETS_FILE, ...(isDatabaseInDataDirectory() ? DATABASE_FILES : [])],
    releaseFiles: closeDatabase,
  });
  registerStatsHandlers();
  registerSyncHandlers();
  setPlayCountedListener(pushPlayedTrack);
  void startTursoSync();
  registerRemoteControlHandlers();
  registerMetadataCacheHandlers();
  void getRemoteControl().restore();
  setWebSessionListener((isConnected) => {
    if (isConnected) tidalWebPlayer.warmUp();
    else tidalWebPlayer.shutDown();
  });
  await createWindow();
  tidalWebPlayer.warmUp();
  void getMetadataCache().refresh();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});