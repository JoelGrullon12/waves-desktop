import { app, BrowserWindow, components, ipcMain } from "electron";
import path from "node:path";
import { registerAuthHandlers } from "./auth";
import { registerCatalogHandlers } from "./catalog";
import { initializeDatabase } from "./database";

// Electron is launched with `--no-sandbox` (see package.json scripts and
// electron-builder.yml). On Linux, the npm-installed Electron fork has no SUID
// chrome-sandbox helper, so Chromium's process sandbox cannot initialize on
// distros like Fedora/Bazzite with SELinux enforcing (zygote crashes at
// startup). The app only renders its own bundled content with contextIsolation
// on, so disabling the sandbox is an acceptable plug-and-play trade-off.

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
  try {
    await components.whenReady();
  } catch (reason) {
    console.error("Widevine component install failed:", reason);
  }

  registerAuthHandlers();
  registerCatalogHandlers(ipcMain);
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});