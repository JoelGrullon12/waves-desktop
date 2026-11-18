# Sesión actual — Primera release de GitHub (0.5.1)

Inicio: 2026-11-17 · Fase: **Phase 10** (`ROADMAP.md`), solo la release 0.5.1 · Estado: 🔄 en curso

> **Alcance reducido (2026-11-17, usuario):** esta sesión hace solo el Bloque A (publicar la 0.5.1).
> El updater (Bloque B) queda para otra sesión; su plan y decisiones se conservan abajo.

## Estado inicial de los repos
- `waves-desktop`: rama `main`, último commit `71cddeb` (Add VMP signing for Windows…), sin tags.
- Sin commit: `CLAUDE.md` (repo público) y `ROADMAP.md` (Phase 10/11), más este archivo.
- `dist/`: ya están los paquetes 0.5.1 de las dos plataformas: `Waves Desktop Setup 0.5.1.exe`
  (+ blockmap, 15:05) y `Waves Desktop-0.5.1.AppImage` + `waves-desktop_0.5.1_amd64.deb` (19:01),
  todos construidos después de `71cddeb` (14:42) y sin cambios de código desde entonces.
- En esta máquina no hay `gh` ni Wine: el `.exe` se construye en el PC con Windows (firma VMP);
  Linux, aquí. `package.json` ya está en `0.5.1`.

## Decisiones de esta sesión (2026-11-17, acordadas con el usuario)
1. La 0.5.1 se publica a mano como primera release de GitHub (sin updater), dentro de esta sesión.
2. Primera versión con updater: **0.6.0**.
3. **Preguntar antes de bajar**: busca sola; si hay versión nueva avisa "Versión X disponible ·
   Descargar"; descargada, "Lista · Reiniciar para actualizar"; si no se reinicia, se instala al cerrar.
4. Busca al arrancar y cada 6 h, más un botón manual en Settings.
5. **Canal beta con interruptor** en Settings (`allowPrerelease`); apagado solo ve releases estables.
   Apagarlo estando en una beta no baja de versión: espera a la siguiente estable.
6. "Personal use only" de `AGENTS.md` se reescribe: proyecto personal con repo y releases públicos;
   cada usuario pone su cuenta TIDAL y credenciales del dashboard; nada de TIDAL (CDM, streams,
   tokens) va en el repo ni en las releases.
7. Publicación: cada máquina sube sus archivos a una release **en borrador** del mismo tag
   (`releaseType: draft`); el usuario la publica a mano en GitHub cuando están Windows y Linux
   (marcándola pre-release si es beta). Sin GitHub Actions (la firma VMP necesita la cuenta EVS).
8. Linux: AppImage + `.deb` en cada release; solo la AppImage se autoactualiza.

## Plan

### Bloque A — Release 0.5.1 (a mano)
- [ ] **A1. Revisión de repo público.** `git log --all` sin `.env`, `app-secrets`, `*.db`,
  `WidevineCdm`; grep de tokens/emails en el árbol. Corregir el comentario viejo de
  `electron-builder.yml` ("package on the matching OS"). Verifica: salidas vacías; `npm run verify`.
- [ ] **A2. Commit** de `CLAUDE.md`, `ROADMAP.md`, `specs/actual.md` (mensaje propuesto, orden del
  usuario); tag `v0.5.1` y push cuando el usuario lo ordene.
- [ ] **A3. Linux:** `npm run package:linux` → AppImage + `.deb` 0.5.1. Verifica: la AppImage
  arranca, inicia sesión y reproduce FULL.
- [ ] **A4. Windows:** usar el `.exe` 0.5.1 ya firmado con VMP (el probado el 2026-11-17 en Win10);
  si no es ese, reconstruir en Windows con `npm run package:win`.
- [ ] **A5. Release en GitHub (UI, el usuario):** tag `v0.5.1`, assets `.exe`, AppImage, `.deb`;
  notas en inglés redactadas por mí (requisitos: cuenta TIDAL, app del dashboard + redirect URI;
  aviso de SmartScreen por no tener Authenticode; la 0.6.0 se instala a mano una vez).

### Bloque B — Phase 10 (0.6.0) · para otra sesión
- [ ] **B1. Dependencia** `electron-updater` (en `dependencies`). Verifica: `npm run verify`.
- [ ] **B2. `electron-builder.yml`:** `publish: { provider: github, owner: JoelGrullon12, repo:
  waves-desktop, releaseType: draft }`; `artifactName` sin espacios (p. ej.
  `waves-desktop-${version}.${ext}`, nsis `waves-desktop-setup-${version}.${ext}`). Se mantienen
  `appId` y `productName` para que la 0.6.0 se instale encima de la 0.5.1.
  Verifica: `package:linux` genera `latest-linux.yml` cuyo `path`/`url` coincide con el archivo.
- [ ] **B3. Lógica pura + tests** (`electron/main/appUpdateState.ts` + `.test.ts`): estado
  `AppUpdateStatus` (`unsupported | idle | checking | available | not-available | downloading |
  downloaded | error`) a partir de los eventos del updater, y `updateSupport(...)`: no soportado en
  dev (`!app.isPackaged`), en Linux sin `APPIMAGE` (`.deb`) y sin `resources/app-update.yml`
  (zip portable). Verifica: `npm test`.
- [ ] **B4. `electron/main/appUpdater.ts`** (patrón de `metadataCache.ts`): `autoDownload = false`,
  `autoInstallOnAppQuit = true`, `allowPrerelease` desde `updates.prerelease` en `settings.ini`,
  logger al `main.log`. Primera búsqueda ~10 s tras abrir la ventana, luego cada 6 h. IPC con
  `handleTrusted`: `updater:get-status`, `updater:check`, `updater:download`, `updater:install`
  (`quitAndInstall` silencioso y relanzando), `updater:set-prerelease`; evento `updater:status`.
  Verifica: typecheck/lint; en `npm run dev` el estado es `unsupported` y no sale ninguna petición.
- [ ] **B5. Renderer:** tipos (`src/types/player.ts`, `src/types/global.d.ts`), preload, store/hook;
  `src/components/settings/UpdatesSection.tsx` (versión actual, estado, "Buscar actualizaciones",
  "Descargar", progreso, "Reiniciar para actualizar", interruptor beta con su aclaración); aviso
  discreto abajo en `Sidebar.tsx` cuando hay versión disponible o lista, que lleva a Settings.
  Verifica: `npm run verify` + revisión en `npm run dev`.
- [ ] **B6. `scripts/packageApp.mjs --publish`** + `release:linux` / `release:win`: pasa
  `--publish always`; exige `GH_TOKEN` en el entorno (nunca empaquetado); se niega con
  `WAVES_SKIP_VMP=1` en Windows y con el árbol git sucio. Verifica: sin token falla con mensaje claro.
- [ ] **B7. Docs:** `AGENTS.md` (updater y publicación, regla de uso personal reescrita, canales
  `updater:*`, árbol, `GH_TOKEN` solo de desarrollo), `README.md` (cómo sacar una release, beta
  incluida), `ROADMAP.md` (Phase 10 → ✅).
- [ ] **B8. Prueba real** (el usuario en Windows; Linux aquí):
  1. Release 0.6.0 (borrador → publicada); instalarla a mano encima de la 0.5.1 en Windows
     (conserva datos y sesión); AppImage 0.6.0 en Linux.
  2. Publicar `0.6.1-beta.1` como pre-release: con beta apagado no se ofrece; encendido se ofrece,
     "Descargar" (el log muestra descarga diferencial), "Reiniciar", arranca la versión nueva,
     reproduce FULL (VMP en Windows) y conserva `settings.ini`, BD, `app-secrets` y sesión.
  3. Linux: la AppImage nueva relanza con `--no-sandbox --in-process-gpu --no-zygote` (riesgo a
     comprobar; si no los pasa, ajustar el relanzamiento).

**Criterio de aceptación** (Phase 10): desde una versión con updater, publicar una release en GitHub
basta para que Windows (nsis) y Linux (AppImage) se actualicen sin reinstalar a mano, reproduzcan
FULL y conserven configuración, BD y sesión.

## Preguntas abiertas

(Ninguna.)

Resueltas:
- ~~Licencia del repo público~~ → sin licencia por ahora (respuesta del usuario, 2026-11-17).

## Hecho
- **A1 (2026-11-17):** historial revisado: nunca se subió `.env`, `app-secrets`, BD, CDM ni tokens;
  los `libsql://…`/tokens del historial son datos de prueba. El email personal del usuario figura
  como autor en 43 commits (metadato de git, ya público; no se reescribe la historia). `ROADMAP.md`
  nombra la BD (`waves-db`) y el token (`waves-token`) de Turso, sin valores. Corregido el
  comentario de `electron-builder.yml` sobre empaquetar por plataforma.
- **A3/A4:** no hace falta reconstruir: los paquetes 0.5.1 de `dist/` corresponden a `71cddeb`.
- **A5 (notas):** `Waves Desktop v0.5.md` (fuera de git, por pedido del usuario) corregido: textos
  cortados, letras sincronizadas en Now playing, seek en el remoto, calidad "lossless" (solo está
  verificado FLAC 16/44.1, no Max), aviso de SmartScreen, `chmod +x` de la AppImage, nombres de
  archivo como los deja GitHub (espacios → puntos).
