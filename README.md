# Waves Desktop

Reproductor de escritorio para **TIDAL** construido con Electron, React y TypeScript. UI en español,
privada y libre de anuncios: búsqueda, álbumes, playlists y reproducción de tracks **completos**
(no previews) con tu suscripción de pago.

## Estado del proyecto (fase actual)

**Fase 3 — Reproducción completa desbloqueada (verificada 2026-09-14).** La app reproduce tracks
de TIDAL **sin el límite de 30 segundos**: barra de progreso, siguiente/anterior, búsqueda,
volumen y encolado. La causa del preview (cortado por TIDAL del lado del servidor según el tier de
la app de desarrollador) se resolvió conectando una **sesión web de primera parte** del web player
de TIDAL y usándola en el motor de reproducción del SDK oficial.

Funcional por ahora:

- Login OAuth PKCE contra TIDAL (Dashboard) con guardado de token cifrado.
- Sesión web de primera parte (`listen.tidal.com`) para **reproducción FULL**.
- Búsqueda de tracks y vista de librería, álbumes y playlists.
- Player con barra temporal, play/pausa, siguiente/anterior, cola y volumen (Widevine).

Roadmap (próximas fases):

- Librería real (guardados, favoritos, playlists personales) — actualmente "coming soon".
- Estado del artwork, controles de medios del sistema (Media Session) y más vistas.
- Empaquetado para Linux/Windows (`package:linux` / `package:win` listos).

## Cómo funciona la reproducción completa

El SDK oficial de TIDAL (`@tidal-music/player`) pide el manifiesto en `/v2/trackManifests/{id}` y
TIDAL decide `FULL` o `PREVIEW` **por el lado del servidor**, según a quién pertenece el token.
El token de la app de desarrollador del Dashboard solo obtiene previews; en cambio, una **sesión
web de primera parte** (el mismo flujo PKCE del web player, client `CzET4vdadNUFQ5JU`) pertenece a
tu cuenta suscrita y entrega assets `FULL`.

Waves combina ambos:
- `CredentialsProvider` del SDK elige el token: sesión web si está conectada, token del Dashboard
  como fallback. Como el SDK consulta las credenciales en cada `load`, conectar la sesión es
  suficiente — no hay que reinicializar.
- Login web sin ventanas embebidas: se abre `login.tidal.com/authorize` en tu navegador del
  sistema, y al volver copias el `code` en la app. (Un `BrowserWindow` con el SPA de TIDAL
  crashea en este entorno — ver `AGENTS.md`.)

> ⚠️ La sesión web es de primera parte de TIDAL. Úsala con tu propia cuenta. El patrón es el
> mismo que usan reproductores de la comunidad como tidal-hifi. Ver el aviso en `AGENTS.md`.

## Stack

- **Electron** (fork [castlabs `#v44.1.0+wvcus`](https://github.com/castlabs/electron-releases))
  para Widevine DRM.
- **React 19 + TypeScript + Tailwind CSS 4** (base-ui/shadcn) y Vite (electron-vite).
- **@tidal-music/player** (SDK web de TIDAL) para reproducción (shaka/browser).
- **zustand** (estado), **@tanstack/react-query** (datos), **libSQL** (catálogo local),
  **safeStorage** para cifrar los tokens.

## Requisitos

- Node.js 20+ y npm.
- Linux: Wayland/X11. En Linux la app corre con `--no-sandbox --in-process-gpu`.
- Una cuenta de TIDAL de pago (suscripción) para la reproducción completa.
- Para el login del Dashboard: `TIDAL_CLIENT_ID` y `TIDAL_CLIENT_SECRET` de una app creada en el
  [Dashboard de TIDAL](https://developer.tidal.com/dashboard) (archivo `.env`).

## Puesta en marcha

```bash
npm install
# crear .env con TIDAL_CLIENT_ID / TIDAL_CLIENT_SECRET (login del Dashboard)
npm run dev
```

Flujo inicial:

1. **Login (Dashboard)**: botón "Login" → se abre tu navegador → vuelves autenticado.
2. **Full playback**: en *Your Library* → *Connect full playback* → inicias sesión en TIDAL en tu
   navegador → copias el `code` de `https://listen.tidal.com/login/auth?code=...` → *Complete*.
   La app lo guarda cifrado y refresca el token automáticamente (~24 h).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Desarrollo |
| `npm run typecheck` | TypeScript (node + renderer) |
| `npm run build` | Build main + preload + renderer |
| `npm run package:linux` | Empaqueta AppImage/deb para Linux |
| `npm run package:win` | Empaqueta para Windows |

## Estructura

```
electron/main/    auth (Dashboard), webSessionAuth (sesión web FULL), catalog, database
electron/preload/ contextBridge → window.api
src/store/        sessionStore, playerStore (wraps SDK), queueStore
src/services/     playbackService (wrapper SDK)
src/views/        LoginView, LibraryView, SearchView, AlbumView, PlaylistView
src/components/   PlayerBar, QueuePanel, AppShell, TrackList, ui/*
```

Detalle de arquitectura, decisiones y trampas conocidas: [AGENTS.md](./AGENTS.md).

## Aviso legal

Proyecto personal con fines de estudio. Waves no es un producto oficial de TIDAL. La reproducción
usa la sesión autenticada de tu propia cuenta de pago. No se distribuye con contenido descargado
ni se comparten credenciales.