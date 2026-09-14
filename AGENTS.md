# AGENTS.md

Guía para agentes trabajando en **Waves Desktop** (reproductor Electron de TIDAL).

## Proyecto

- App: waves-desktop (`package.json`).
- Stack: Electron (fork castlabs, ver abajo) + React + TypeScript + Tailwind + zustand +
  react-query + `@tidal-music/player` (SDK de TIDAL).
- Lenguaje de UI/UX en español; código en inglés. Parte de la UI actual está en inglés.
- Búsquedas: **`rg` NO existe en este entorno — usar `grep`**.

## Scripts (validados)

- `npm run dev` — desarrollo (lanzado con `--no-sandbox --in-process-gpu`, Wayland).
- `npm run typecheck` — `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.json`.
  **Ejecutarlo SIEMPRE tras editar.**
- `npm run build` — electron-vite build (main + preload + renderer).
- `npm run package:linux` / `package:win` — empaquetado.

## Arquitectura

```
electron/main/
  index.ts          entry; registra handlers IPC y crea la ventana
  auth.ts           OAuth PKCE del Dashboard (login normal con shell.openExternal + callback local)
  catalog.ts        catálogo (search/album/playlist) sobre la DB local
  database.ts       SQLite local (waves-desktop.db)
  webSessionAuth.ts sesión web de primera parte (reproducción FULL) — ver abajo
electron/preload/contextBridge.ts  expone window.api
src/
  store/sessionStore.ts  auth normal + sesión web (isWebSessionConnected, webLogin*)
  store/playerStore.ts   wrapper del SDK; buildCredentialsProvider() elige token
  store/queueStore.ts
  services/playbackService.ts  wrapper @tidal-music/player (load/pause/seek/...)
  lib/mediaProduct.ts        Track → MediaProduct del SDK
  views/  views/       LibraryView, SearchView, AlbumView, PlaylistView, LoginView
  components/          PlayerBar, QueuePanel, AppShell, ui/*
```

- IPC: `auth:*`, `catalog:*`, `web-auth:*`. Tipos en `src/types/global.d.ts`; el preload
  es la fuente de verdad de la superficie.

## Reproducción FULL (30 s preview) — CRÍTICO

**Estado (2026-09-14): resuelto y verificado por el usuario.** El player toca tracks
completos (>30 s) con barra, siguiente/anterior, búsqueda y volumen.

### Cómo funciona
- El token de la app de desarrollador del Dashboard (`RMcL1jkX0cj4euaW`) SOLO obtiene
  PREVIEW: TIDAL corta por el lado del servidor según el **tier de la app**, no por la
  suscripción del usuario ni por banderas del cliente.
- Solución: sesión web de primera parte del web player de TIDAL (client `CzET4vdadNUFQ5JU`,
  el del web player listen.tidal.com) y usar **ese token** en el `CredentialsProvider` del
  SDK. Como `getCredentials()` se consulta en cada `load`, el cambio aplica sin reinicializar.
- `playerStore.buildCredentialsProvider()` ramifica: si `isWebSessionConnected` usa el token
  web; si no, el del Dashboard (fallback intacto).
- El SDK pide `/v2/trackManifests/{id}` (`node_modules/@tidal-music/player/dist/load-uTL4eiru.js`,
  fn `ct()`) con ese token → el servidor devuelve `FULL` por pertenecer a la cuenta suscrita.

### Flujo de login web (electron/main/webSessionAuth.ts)
- `login.tidal.com/authorize` con `appMode=WEB` + PKCE (`S256`) + `scope=r_usr w_usr`,
  abierto en el **navegador del sistema** (`shell.openExternal`).
- Tras loguear, TIDAL navega a `https://listen.tidal.com/login/auth?code=...`; el usuario
  copia el `code` (o el URL completo) y lo pega en la app (“Complete”).
- Exchange en `https://login.tidal.com/oauth2/token` (POST form con `code_verifier`,
  client_id del web).
- Bundle en `~/.config/waves-desktop/tidal-web-session` (cifrado con `safeStorage`); el
  `code_verifier` pendiente en `waves-web-login-pending`. Refresh automático (~24 h de vida).

### ⚠️ Lecciones que NO hay que repetir
1. **Un `BrowserWindow` que cargue el SPA de TIDAL CRASHEA** en este entorno:
   `render-process-gone { reason: 'launch-failed', exitCode: 1002 }` + `ERR_FAILED (-2)`
   (Electron castlabs `#v44.1.0+wvcus`, `--no-sandbox --in-process-gpu`, Wayland). Por eso el
   login web usa navegador del sistema + copiar/pegar (mismo patrón que `auth.ts`).
2. La sesión web se lee SOLO desde el proceso main (safeStorage); sin descifrar desde
   scripts headless/terminal.
3. `playbackinfopostpaywall/v4` (`web-auth:get-playback-stream`) quedó implementado como
   **plan B** pero NO se usa actualmente (el swap vía SDK bastó). Útil si TIDAL cambia el
   comportamiento de v2 o revoca scopes.
4. SDK: requiere `setEventSender(...)` noop para permitir `load()`.
5. DataDome solo bloquea requests HTTP planos (curl), no un Chromium/Electron real.

## Cuenta de prueba / entorno

- Cuenta TIDAL del usuario: **principal (de pago)**. El feature de sesión web es de primera
  parte (como tidal-hifi/hifi-api). Riesgo acotado y aceptado por el usuario; no pedir
  credenciales por chat.
- User ID conocido: `192935581`. Token bundle Dashboard: `~/.config/waves-desktop/tidal-token-bundle`.
- `.env` contiene `TIDAL_CLIENT_ID` / `TIDAL_CLIENT_SECRET` (la app del Dashboard).

## Convenciones de código

- No añadir comentarios salvo que documenten decisiones no obvias (como en webSessionAuth.ts).
- `npm run typecheck` antes de dar tarea por terminada.
- No commitear salvo que el usuario lo pida explícitamente.