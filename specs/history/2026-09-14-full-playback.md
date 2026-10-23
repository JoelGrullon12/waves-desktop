# SESSION HANDOFF — Full-length playback (30s preview solved)

Fecha: 2026-09-14 — Rama: `feat/electron-migration`, HEAD `92ed834`.
Cambios SIN commitear: 7 archivos modificados + 1 nuevo (`electron/main/webSessionAuth.ts`).

> ⚠️ La cuenta de TIDAL del usuario es su **cuenta principal de pago**. Este feature usa una sesión
> de primera parte del web player (TIDAL la otorga al usuario, no a una app de desarrollador). Es
> el mismo mecanismo que reproductores como tidal-hifi/hifi-api. Riesgo tolerado por el usuario,
> demostrado y sin olas de baneo documentadas para reproductores.

## Qué se logró

**Reproducción completa (>30s) verificada empíricamente por el usuario**: varias canciones
cruzan los 30 s con barra temporal, siguiente/anterior, búsqueda, volumen — todo funcional.

**Causa raíz del preview de 30s**: el `CredentialsProvider` del player usaba SOLO el token de la
app de desarrollador del Dashboard (`RMcL1jkX0cj4euaW`). TIDAL otorga `assetPresentation` por el
**lado del servidor** según a quién pertenece el token (tier), no por banderas del cliente:
`/v2/trackManifests` con token dashboard → `trackPresentation: "PREVIEW"`,
`previewReason: "FULL_REQUIRES_HIGHER_ACCESS_TIER"`.

**Solución**: segunda sesión de auth "web" (web player de primera parte) y usar ese token en el
`CredentialsProvider`.

## Arquitectura implementada

### Sesión web (`electron/main/webSessionAuth.ts` — NUEVO, ~371 líneas)
- Client web listen.tidal.com: `client_id = CzET4vdadNUFQ5JU` (de primera parte del web
  player), `redirect_uri = https://listen.tidal.com/login/auth`.
- Flow: `login.tidal.com/authorize` con `appMode=WEB` + PKCE (`S256`) + `scope=r_usr w_usr`
  → se abre en el **navegador del sistema** (`shell.openExternal`, sin BrowserWindow).
- Al volver, TIDAL navega a `https://listen.tidal.com/login/auth?code=...`. El usuario **copia
  el `code` y lo pega** en la app ("Complete"); el main hace `exchange` en
  `https://login.tidal.com/oauth2/token` (POST form con `code_verifier`).
- Bundle guardado en `~/.config/waves-desktop/tidal-web-session` (safeStorage); el `code_verifier`
  pendiente en `waves-web-login-pending`.
- Refresh automático (token web dura ~24 h) vía el mismo token endpoint con `grant_type=refresh_token`.
- IPC:
  - `web-auth:login` → abre navegador, devuelve `{success, pending}`.
  - `web-auth:complete-login(pasted)` → exchange (acepta el `code` puro o un URL completo).
  - `web-auth:logout`, `web-auth:is-connected`.
  - `web-auth:get-session-credentials` → `{client_id, access_token, user_id}` (refresca si toca).
  - `web-auth:get-playback-stream(trackId)` → `playbackinfopostpaywall/v4`…
    **POR AHORA SIN USAR** (Plan B; ver abajo).

### Integración al playback (la parte que desbloquea el FULL)
- `src/store/playerStore.ts` — `buildCredentialsProvider().getCredentials()` ramifica:
  si `session.isWebSessionConnected` → usa el token web; si no → dashboard (comportamiento
  previo intacto). El SDK llama `getCredentials()` en cada `load`, así que NO hace falta
  reinicializar; el cambio aplica al reproducir.
- El SDK pide `/v2/trackManifests/{id}` (`load-uTL4eiru.js`, fn `ct()`) con ese token; al
  ser de la cuenta suscrita, el servidor devuelve FULL.

### UI
- `src/views/LibraryView.tsx` — tarjeta "Full-length playback": Conectar → abre navegador →
  estado pendiente con instrucciones + input para pegar el code + "Complete" → "Disconnect".
- `src/store/sessionStore.ts` — estado `isWebSessionConnected`, `webLoginPending`,
  `webLoginError`; `init()` consulta ambas sesiones; acciones `webLogin/completeWebLogin/
  webLogout` y `getWebSessionCredentials()`.
- `electron/preload/contextBridge.ts` + `src/types/global.d.ts` — expuestos y tipados.

### Fix
- `electron/main/auth.ts` (handler `auth:get-session-credentials`): devolvía el `TokenBundle`
  entero como `access_token` (→ `Bearer [object Object]`). Ahora devuelve `accessToken`.
- `electron/main/index.ts`: registra `registerWebSessionHandlers()`.

## Lecciones técnicas (importantes para no repetir)

1. **El preview no se arregla desde la app del Dashboard** — es corte server-side por tier
   de la app; ninguna bandera del SDK lo salta.
2. **Un `BrowserWindow` que cargue el SPA de TIDAL CRASHEA en este entorno**:
   `render-process-gone { reason: 'launch-failed', exitCode: 1002 }` + `ERR_FAILED (-2)`.
   Contexto: Electron castlabs `#v44.1.0+wvcus`, lanzado `--no-sandbox --in-process-gpu`,
   Wayland. Por eso el login web usa el navegador del sistema + copiar/pegar (mismo patrón
   que `auth.ts` ya usaba con `shell.openExternal` + callback local).
3. Endpoints verificados: `login.tidal.com/authorize` (DataDome bloquea curl frío, no
   Chromium), `login.tidal.com/oauth2/token` (intercambio + refresh; acepta el client web).
4. `formats=AAC` en trackManifests → 400 `INVALID_VALUE_TYPE`; el SDK manda lista
   (`formats=AACLC,HEAACV1`, etc.).
5. El bundle de sesión se lee SOLO desde el proceso main (safeStorage). Con tests headless no
   se puede descifrar desde terminal.
6. SDK: `setEventSender` noop es obligatorio (requiere `hasEventSender()` para `load`).
7. `rg` no existe en el entorno — usar `grep`.

## Estado del working tree (sin commitear)

- Modificado: `electron/main/auth.ts`, `electron/main/index.ts`,
  `electron/preload/contextBridge.ts`, `src/store/playerStore.ts`,
  `src/store/sessionStore.ts`, `src/types/global.d.ts`, `src/views/LibraryView.tsx`.
- Nuevo: `electron/main/webSessionAuth.ts`.
- Verificación: `npm run typecheck` (tsconfig.node.json + tsconfig.json) y `npm run build` limpios.

## Próxima fase (Plan B, solo si hiciera falta)

`web-auth:get-playback-stream` ya consulta `playbackinfopostpaywall/v4` con
`audioquality=LOSSLESS`, `assetpresentation=FULL` (patrón de hifi-api). NO se necesitó porque el
swap del token vía el SDK ya entregó FULL por `trackManifests`. Queda como alternativa para
casos en que TIDAL cambie el comportamiento de v2 o revoque scopes. Si se usa, habrá que
alimentar el manifest al shaka del SDK (o un player propio) — no está implementado.

## Ideas para continuar (no iniciadas)

- Commit del avance (usuario aún no lo pidió).
- "Your collection is coming soon" en `LibraryView` — fase de librería pendiente.
- Mostrar indicador "full playback activo" en el PlayerBar / manejar desconexión de la sesión
  web mientras se reproduce (el provider ya hace fallback a dashboard).
- El BrowserWindow del login fue eliminado del flujo (ya no existe `acquireWebAuthorizationCode`).