# Sesion actual

## Objetivo
Fase C — Consolidación y plug-and-play, **sesión 3: hardening de main + plug-and-play** (ver `ROADMAP.md`).
Criterio: validar IDs/`sender`/CSP/timeouts en main, credenciales en el primer arranque, instalación automática del CDM, login FULL sin pegar el `code`; `npm run verify` verde. Restricción: **cero dependencias npm nuevas**.

## Plan
Prefijo de comandos: `source ~/.nvm/nvm.sh && nvm exec 22 <cmd>`. Cada paso termina con `npm run verify` en verde.
- [x] 1. Polling/seek de `src/store/playerStore.ts`.
- [x] 2. CDM automático sin dependencias (`widevineInstaller.ts` + `crxArchive.ts`).
- [x] 3. Hardening de main (IDs, `sender`, CSP, timeouts, servidor OAuth, permisos 0o600).
- [x] 4. Credenciales TIDAL en el primer arranque; `.env.example` depurado.
- [x] 5. Spike Device Authorization → negativo; plan B: ventana de login embebida.
- [x] 6. Docs (AGENTS.md, ROADMAP, README).
- [x] Extra: diagnóstico de la ventana de login (client web nuevo, `--no-zygote`) y de la reproducción FULL (bloqueo del CDM, spike del motor web).

## Preguntas abiertas
Trasladadas a la próxima sesión (Phase R en `ROADMAP.md`):
- ¿Se cambia la regla de `AGENTS.md` "el SDK es la única vía de reproducción" a favor del motor web de TIDAL?
- Control del motor: DOM, store Redux de la web, o mixto. Recomendado: Redux para controles, DOM solo para iniciar una canción.
- ¿El SDK se mantiene como respaldo de previews o se elimina?

## Hecho
- **Paso 1:** `src/lib/seekCoordinator.ts` (+test) agrupa los seeks del slider (gana el último) y pausa el polling mientras uno está en vuelo; `playerStore` limita el seek a [0, duración] y no re-renderiza si la posición no cambió.
- **Paso 2:** `electron/main/crxArchive.ts` (cabecera CRX3 + lector ZIP sobre `node:zlib`, anti zip-slip, tests) y `widevineInstaller.ts` (extrae el CRX cacheado a `WidevineCdm/<versión>/` vía carpeta `.partial`, escribe `latest-component-updated-widevine-cdm`); `index.ts` lo ejecuta antes y después de `components.whenReady()`. Probado contra el CRX real.
- **Paso 3:** `validation.ts` (IDs, cursores, query, listas, relación de mixes, confianza del `sender`, credenciales, código de redirección; tests), `secureIpc.ts` (`handleTrusted` en todos los handlers IPC), timeouts de 15 s, servidor OAuth con timeout de 5 min y manejo de `error`, `privateFile.ts` (0o600) para tokens/credenciales/SQLite, navegación y `window.open` bloqueados en la ventana principal, CSP solo en el build de producción (plugin en `electron.vite.config.ts`).
- **Paso 4:** `tidalAppCredentials.ts` (client id/secret cifrados con `safeStorage`; `.env` gana si están las dos variables), IPC `credentials:*`, `LoginView` pide las credenciales si faltan, `auth.ts` sin constantes de entorno (state HMAC con clave aleatoria por arranque), `.env.example` depurado.
- **Paso 5:** Device Authorization con el client web → HTTP 400 `Client is not a Limited Input Device client`. Plan B: `webSessionAuth.ts` abre una ventana de login propia que captura `tidal.com/login/auth?code=` en `will-redirect`/`will-navigate` y se cierra sola; se eliminó el pegado manual (IPC `complete-login`, UI de Ajustes, verifier en disco).
- **Client web nuevo:** TIDAL movió el reproductor web a `tidal.com`: client `49YxDN9a2aFV6RTG`, redirect `https://tidal.com/login/auth` (el anterior `CzET4vdadNUFQ5JU`/`listen.tidal.com` da "Algo salió mal").
- **Ventana de login en blanco → `--no-zygote`:** en la instancia lanzada desde VS Code los zygotes de Chromium desaparecían; sin zygote no se lanza el renderer del iframe de verificación de TIDAL (`geo.captcha-delivery.com`, `net::ERR_ABORTED`). Reproducido matando zygotes en una instancia de prueba. `--no-zygote` añadido en `scripts/runElectron.mjs` y `electron-builder.yml` (Linux); verificado login y Widevine (`createMediaKeys`). En Linux la ventana de login no pide sandbox (la app corre con `--no-sandbox`). La ventana registra líneas `web-login:` (navegación, frames, fallos, contenido) para diagnóstico.
- **User-Agent:** el intento de quitar `Electron/` del UA se revirtió (no era la causa y no se altera la huella de la ventana).
- **Audio FULL con el SDK bloqueado:** el manifiesto llega completo, pero el CDN (`sp-ad-fa.audio.tidal.com`) responde 403 Forbidden, Error 54113, a todo origen que no sea `tidal.com`. No se falsea `Origin`/`Referer`; el parche de CORS probado se quitó.
- **Spike motor web OK:** como tidal-hifi (revisado su código: carga `tidal.com` y lo controla vía Redux/DOM). Ventana `tidal.com/track/20115564` en la partición persistente compartida con el login (`persist:tidal-web`), clic en el play de la fila → suena completo (`currentTime` 4,9 → 16,9 s de 370 s, 16-bit 44.1kHz). La partición del login pasó a ser persistente y se borra en el logout.
- README actualizado (ya no describe el pegado manual del `code`).
- `npm run verify` verde: 94 tests.

## Decisiones (y por que)
- **Cero dependencias nuevas (2026-10-23):** solo built-ins de Node/Electron; por eso el lector ZIP y la validación son propios.
- **CDM (2026-10-23):** sin vendorizar ni LFS; la única fuente es el CRX oficial que ya descarga el Component Updater.
- **Primer arranque sin red (2026-10-23):** se acepta quedar sin DRM hasta el siguiente arranque con red (la app no funciona offline).
- **Device Authorization descartado (2026-10-23):** TIDAL lo rechaza para el client web; se usa ventana de login embebida.
- **Client web (2026-11-14):** `49YxDN9a2aFV6RTG` + `https://tidal.com/login/auth`; si vuelve a fallar, copiar la URL real de `login.tidal.com/authorize` desde DevTools del navegador.
- **`--no-zygote` en Linux (2026-11-14):** evita depender de un zygote que puede morir; compatible porque la app ya corre con `--no-sandbox`.
- **No alterar la huella de la ventana de login ni falsear el origen (2026-11-14):** no se esquivan controles de TIDAL; la reproducción completa se buscará con su propio reproductor web.
- **Partición `persist:tidal-web` (2026-11-14):** necesaria para que el motor web reutilice el login; se limpia en el logout.

## Pendiente / proximos pasos
- **Phase R (motor web de TIDAL):** nuevo `electron/main/tidalWebPlayer.ts` (ventana oculta con `tidal.com`, `playTrack(id)`, pause/resume/seek/volumen, estado por IPC) y conectarlo a `src/store/playerStore.ts` / `src/services/playbackService.ts`, conservando la cola de Waves. Referencia del spike: selectores `[data-test="tracklist-row"][data-track-id=…] [data-test="play-button"]`, media `#video-one`; acciones Redux de tidal-hifi `playbackControls/PLAY|PAUSE|SKIP_NEXT|SEEK|SET_VOLUME`.
- **Pruebas manuales pendientes:** seek/pausa; borrar `~/.config/waves-desktop/WidevineCdm` y arrancar; arrancar sin `.env` y loguear; todo con `npm start` (CSP).
- **Validación en Windows 11** (`npm install`, `npm run dev`, `package:win`) — ningún cambio de esta sesión probado allí.
- Riesgo: login social (Google/Apple) en la ventana de login con popups bloqueados.

## Estado del repo
Rama `main`, inicio limpio en `7241306`. Al cierre: todos los cambios de la sesión en un commit en `main`, subido a `origin/main`.
