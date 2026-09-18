# SESSION HANDOFF — Build & Distribution (RESUELTO)

Fecha: 2026-09-15 — Rama `main`.
**Estado: causas raíz encontradas, corregidas y empaquetado Linux verificado.**
Pendiente (usuario): validar dev y `package:win` en la máquina Windows 11.

---

## Causas raíz (antes: solo síntomas)

Los tres problemas apuntaban a una misma raíz: **el fork de Castlabs de Electron
no se comporta como el paquete `electron` estándar de npm.**

1. **El fork NO tiene script `postinstall`/`prepare`** (verificado en el
   `package.json` del tag `v44.1.0+wvcus` en GitHub). Un `npm install` limpio
   jamás descarga el binario a `node_modules/electron/dist`. En esta máquina
   Linux el binario existía porque alguien corrió `install.js` a mano en el
   pasado → por eso `npm run dev` funcionaba aquí y no en la W11.
   - Sintoma W11 (Node 26): `electron-vite` lanzaba `Error: Electron uninstall`
     en `getElectronPath()` porque no existía `node_modules/electron/path.txt`
     ni `dist/electron.exe`.
   - Verificado: Castlabs SÍ publica `electron-v44.1.0+wvcus-win32-x64.zip`
     (HTTP 200) y `checksums.json` incluye su checksum → el `install.js` del
     fork funciona en Windows tal cual.
2. **No existía `electron-builder.yml`.** `electron-builder` resuelve el binario
   contra el repo ESTÁNDAR `github.com/electron/electron/releases/download/
   v44.1.0+wvcus/...` → 404. La solución es `electronDist: node_modules/electron/dist`
   (copia el binario local del fork, no descarga nada). Confirmado en el log:
   `using custom unpacked Electron distribution electronDist=node_modules/electron/dist`.
3. **Node 16 es incompatible.** `@tailwindcss/oxide` (`engines: >=20`), `vite` 7 /
   `electron-vite` 5 (`>=20.19 || >=22.12`) y el fork de Castlabs (`>=22.12.0`).
   Además el npm 8 de Node 16 tiene el bug #4828 de optional-dependencies, que
   dejaba sin instalar `@tailwindcss/oxide-win32-x64-msvc` → "Cannot find native
   binding". Solución: requerir Node >= 22.12 (`.nvmrc` = `22` + `engines`).

## Cambios aplicados

- `package.json`: `"postinstall": "node scripts/ensureElectron.mjs"`,
  `dev`/`start` → `node scripts/runElectron.mjs <dev|preview>`, `engines.node >= 22.12.0`.
- `scripts/ensureElectron.mjs` (nuevo): si falta `node_modules/electron/dist/version`
  ejecuta `node node_modules/electron/install.js` (descarga desde el mirror de
  Castlabs). Hace el `npm install` plug-and-play en cualquier SO.
- `scripts/runElectron.mjs` (nuevo): invoca `bin/electron-vite.js` con
  `--noSandbox -- --in-process-gpu` SOLO en Linux; en Windows no pasa flags
  (el sandbox en Windows es un regreso de seguridad y `in-process-gpu` no aplica).
- `electron-builder.yml` (nuevo): `electronDist`, appId, productName,
  `files: [out/**]`, linux AppImage+deb (con `executableArgs` replicando los
  flags de Linux y `maintainer` para el .deb), win nsis.
- `resources/icon.png` (512x512) + `resources/icon.ico` (multitamaño):
  placeholders generados con PIL (script descartable en
  `/tmp/opencode/generate_icon.py` dentro de esta sesión, no se commitea).
- `.nvmrc`: `22`.

## Empaguetado verificado (esta máquina)

`npm run package:linux` → `dist/Waves Desktop-0.1.0.AppImage` +
`dist/waves-desktop_0.1.0_amd64.deb`. El 404 ya no ocurre.
`npm start` (wrapper) abre la ventana sin el crash de zygote/GPU en esta Bazzite.

## Runbook — PC Windows 11 (pendiente de ejecutar)

```bash
nvm install 22
nvm use 22
cd C:\Proyectos\waves-desktop
git pull            # trae los cambios de esta sesión
npm install         # el postinstall baja electron-v44.1.0+wvcus-win32-x64.zip
npm run dev         # debe abrir la ventana sin "Electron uninstall"
npm run build       # bundle
npm run package:win # .exe (nsis)
```

Notas Windows:
- NO usar Node 16 con ninguna versión de npm: el toolchain lo impide.
- No hace falta tocar el wrapper `runElectron.mjs`; los flags Linux se añaden
  condicionalmente.
- El binario win32 se cachea en `%LOCALAPPDATA%\electron\Cache`; si un
  `npm install` previo lo dejó a medias, borra `node_modules` y `package-lock.json`
  y repite. También puedes forzar con `node node_modules/electron/install.js`.
- Widevine: en esta Linux el Component Updater del fork no bajó la CDM y se usó
  un copiado manual a userData. En Windows el Component Updater tiene mejor
  historial; si `requestMediaKeySystemAccess('com.widevine.alpha')` falla en la
  W11, replicar el approach de copiado de la CDM (ver "How Widevine is
  delivered" en `Agents.md`).

## Objetivos cumplidos / pendientes

- [x] Aislar el 404 del empaquetado (electronDist).
- [x] Arreglar el flujo W11 (postinstall + engines + wrapper multiplataforma).
- [x] Crear `electron-builder.yml` y empaquetar Linux (AppImage + deb).
- [ ] Validar `npm install` + `npm run dev` + `npm run package:win` en la W11 (usuario).
- [ ] (Opcional) `desktopName` + `linux.syncDesktopName: true` en electron-builder
      para asociar la ventana al .desktop (aviso no bloqueante en el empaquetado).