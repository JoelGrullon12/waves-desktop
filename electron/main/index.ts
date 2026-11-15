import { app, BrowserWindow, components } from "electron";
import path from "node:path";
import { registerAuthHandlers } from "./auth";
import { registerCatalogHandlers } from "./catalog";
import { initializeDatabase } from "./database";
import { configureTrustedRenderer } from "./secureIpc";
import { registerCredentialHandlers } from "./tidalAppCredentials";
import { registerWebSessionHandlers } from "./webSessionAuth";
import { installWidevineFromCache, type WidevineInstallResult } from "./widevineInstaller";

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

async function createWindow(): Promise<void> {
  await initializeDatabase();

  const mainWindow = new BrowserWindow({
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

  if (developmentRenderUrl) {
    await mainWindow.loadURL(developmentRenderUrl);
  } else {
    await mainWindow.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
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
    await components.whenReady();
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
  registerWebSessionHandlers();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});