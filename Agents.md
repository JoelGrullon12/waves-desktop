# Waves Desktop — AGENTS.md

> This file is the single source of truth for any AI agent or developer working on this project.
> Read it **entirely** before writing any code or making any architectural decision.
> The project is currently mid-migration from Tauri v2 to Electron. The target stack described
> in this file is Electron — do not introduce Tauri/Rust code or revert to the old stack.
>
> **Sesión 2026-09-15:** la pantalla Songs (liked tracks) está en estado **parcial** — el
> menú contextual y los likes son UI con no-ops, no funcionales. El shuffle/Play cubren ya
> toda la librería (prefetch + espera con spinner), pero sigue sin toggle persistente ni
> repeat. Ver "Current Status" y `.opencode/plans/session-handoff-liked-songs.md`. El
> trabajo de esa pantalla está **sin commitear** (working tree).
>
> **Siguiente fase (pendiente):** arreglar build/distribución — W11 falla con
> `electron-vite` y en esta máquina el empaquetado da 404 con la versión de electron.
> NO es de esta sesión; ver `.opencode/plans/session-handoff-build-distribution.md`.

---

## Project Name & Purpose

**Waves Desktop** is a personal, self-hosted music player built on top of the TIDAL platform.
It is intended exclusively for personal use by a single user — it will never be distributed publicly.

Its core purpose is to provide a superior listening experience over the official TIDAL app by adding:
- Smart shuffle logic that prioritizes lesser-played songs (the most important feature)
- Cross-device play count synchronization via cloud database
- Mobile remote control from the phone browser (no app install required)
- A unified global playlist combining liked tracks and playlist tracks
- A dynamic favorites playlist of top-played tracks in a rolling time window

It runs on **Windows and Linux (Bazzite/Fedora-based)** with identical behavior on both platforms.
The app must be **plug-and-play**: clone, configure `.env`, `npm install`, `npm start` — done.
No system-level dependencies beyond Node.js and the OS itself.

---

## Why Electron (and not Tauri)

The project started on Tauri v2 + Rust but hit a **hard architectural blocker** on Linux:
WebKitGTK — the only webview Tauri uses on Linux — does not implement EME
(Encrypted Media Extensions). TIDAL streams are Widevine DRM-protected. Without
`navigator.requestMediaKeySystemAccess`, the TIDAL Web SDK's Shaka Player cannot initialize
any DRM key, so audio playback is impossible on Linux with Tauri. This is a platform
limitation of WebKitGTK, not a configuration issue — there is no workaround.

Electron solves this because it bundles Chromium, which implements EME natively. Using
**Castlabs' Electron fork** (`@castlabs/electron-releases`), Widevine is bundled inside the
binary itself — no CDM installation required on the user's system. This makes the app
truly plug-and-play on both Windows and Linux.

**What was preserved from the Tauri implementation:**
- The entire React frontend (all components, views, stores, hooks, services)
- All TIDAL v2 API knowledge, OAuth flow, and token handling logic
- The product architecture, routing, and state management decisions

**What changed:**
- Desktop shell: Tauri/Rust → Electron (Node.js main process)
- Token storage: `tauri-plugin-keyring-store` → Electron `safeStorage` (built-in, no extra deps)
- IPC: `invoke()` Tauri commands → `ipcMain.handle()` / `contextBridge`
- SQLite: `tauri-plugin-sql` → `node:sqlite` (built-in Node module)
- Build/package: `cargo tauri build` → `electron-builder`
- Widevine: system CDM (unavailable on Linux) → bundled via Castlabs Electron fork

---

## Current Status

Last updated: 2026-09-15

### Completed (Tauri era — logic preserved, shell being replaced)

- **Phase 0 — Environment scaffolding:** React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui.
  All frontend tooling is in place and unchanged.
- **Phase 1 — TIDAL Authentication:** OAuth Authorization Code + PKCE flow, CSRF state
  verification, automatic token refresh, logout. Fixed redirect URI
  `http://127.0.0.1:8899/tidal-callback` registered in the TIDAL dashboard.
  Login verified end-to-end: opens `login.tidal.com`, exchanges the code at
  `auth.tidal.com/v1/oauth2/token`, stores the token bundle securely, lands on authenticated state.
  Two fixes were required: (1) `.env` loader was CWD-dependent (`tauri dev` changes CWD to
  `src-tauri/`) — now CWD-independent; (2) TIDAL rejected OAuth with error `11102` when using
  a random loopback port — fixed by using the registered fixed URI `http://127.0.0.1:8899/tidal-callback`.
- **Phase 2 — Functional Player MVP:** TIDAL Web SDK (`@tidal-music/player ^0.20.1`) with a
  custom credentials provider (NOT `@tidal-music/auth`). Zustand stores (`playerStore`,
  `queueStore`, `sessionStore`). Catalog proxy to TIDAL v2 API for search, albums, playlists.
  React Router v7. Full UI: AppShell, PlayerBar, QueuePanel, TrackList, SearchView (debounced),
  AlbumView, PlaylistView, LibraryView. Media Session API for OS keyboard controls.
  `npm run build` and `tsc --noEmit` pass.

### In progress — Migration to Electron

Migration Plan Steps 1–9 are done and verified (dev shell, main process, auth,
catalog, database, preload bridge, renderer call-sites, Widevine + playback).
Step 10 (packaging) is pending.

Session achievements (2026-09-14 — playback consolidado en commits):
- Login works end-to-end on Electron. Fixed an ESM ordering bug: `auth.ts` read
  `process.env.*` at module scope before `dotenv.config()` ran (imported modules
  evaluate before the entry body runs). Fix: `dotenv.config()` lives at the top of
  `electron/main/auth.ts`; `index.ts` no longer loads dotenv.
- Playback starts. The TIDAL Web SDK threw "Playback not allowed without an event
  sender" (`hasEventSender()` guard in `load`/`setNext`). Resolved with a noop
  sender — `setEventSender({ sendEvent() {} })` in `src/services/playbackService.ts`.
  This matches TIDAL's own demo; the SDK only invokes `sendEvent()`.
- Volume bug fixed. The store keeps volume 0–100 but the SDK writes the value
  directly to `HTMLMediaElement.volume` (range 0–1). Conversion by `/100` was added
  at the `setVolume` handler and during player init in `src/store/playerStore.ts`.
- Widevine auth verified over CDP: `navigator.requestMediaKeySystemAccess('com.widevine.alpha')`
  resolves and the DRM-configured `load()` produces audio. See the Widevine section
  for how the CDM got installed.
- **Full-length playback (>30s) resolved** with `electron/main/webSessionAuth.ts`
  ("web" session): a first-party `CzET4vdadNUFQ5JU` PKCE flow minted in the system
  browser gives the subscribed account's token, which the server accepts with
  `assetPresentation: FULL`. The SDK's `CredentialsProvider` prefers it over the
  dashboard token. Details in `.opencode/plans/session-handoff-full-playback.md`.

Session achievements (2026-09-15 — Liked Songs, working tree SIN commitear):
- New `/songs` screen (`src/views/SongsView.tsx`) listing liked tracks with
  cursor-based infinite scroll (`useInfiniteQuery`, `IntersectionObserver`
  sentinel with `rootMargin: "200px 0px"`), dedupe across pages, empty state,
  Play / Shuffle buttons, total count + total duration header.
- **IMPORTANT — enrichment is REQUIRED, not optional:** the likes endpoint
  `GET /userCollectionTracks/me/relationships/items` ONLY accepts
  `include=items` (unlike playlists/albums, it rejects `items.albums.coverArt`
  with 400). The items always lack artwork, so the cover art (and any other
  missing field) must come from a second call: `getTracksByIds` +
  `songsStore.ts` enrichment. Do NOT "optimize" this away.
- No server-side shuffle: `sort` on the likes endpoint only accepts
  `addedAt`, `albums.title`, `artists.name`, `duration`, `title` (with `-`
  prefix for descending). Shuffle must be client-side.
- Full-library playback: Play/Shuffle buttons wait (spinner) while the rest of
  the pages and the enrichment finish loading, so the whole library is queued,
  not just the fetched-on-scroll subset. Rows render through a `visibleCount`
  window; `TrackList` got a `queueTracks` prop so clicking a row still starts
  the FULL list (resolving the real index by id), not the visible slice.
- `page[size]` en el endpoint de likes: **50 es el tope verificado.** Probados y
  rechazados por TIDAL (429 rate-limit): page[size]=500 y page[size]=100 — el walk
  se arrastra entre retries. **NO subir este valor en otra sesión.**
  `COLLECTION_PAGE_SIZES = [50]` con probe descendente a default en runtime
  (`getLikedTracksPage` en `electron/main/catalog.ts`).
- Play/Shuffle esperan (spinner, sin timeout) a que TIDAL complete páginas +
  enrichment — la biblioteca puede ser enorme; SOLO un fetch error corta la espera
  y muestra el mensaje de error.
- On-demand enrichment: the likes collection omits artwork; `songsStore.ts`
  caches resolved ids (`Map<string, Track|null>`, null = already-resolved-miss)
  and `SongsView` fetches batches of 50 sequentially, retrying failures on the
  next effect run.
- **3.ª iteración — fix del listado "clavado" en la primera entrada:** el sentinel
  del `IntersectionObserver` se movió FUERA del bloque condicional
  `{displayTracks.length > 0 && ...}`. Antes vivía dentro de ese bloque, así que en
  el primer render de la pantalla no existía (aún no había data), el effect con
  deps `[]` hacía early-return y el observer nunca se adjuntaba → el reveal de
  filas (`visibleCount`) no funcionaba en la primera visita (había que salir y
  volver a entrar, donde la caché ya tenía data y el sentinel existía en el mount).
  Ahora el sentinel está siempre en el DOM y el observer se adjunta desde el primer
  render. Detalle en `.opencode/plans/session-handoff-liked-songs.md`.
- Main-process catalog additions (`electron/main/catalog.ts`): server-cursor
  paging `getLikedTracksPage`, `getTracksByIds` (chunked 50 + 200 ms pacing),
  HTTP 429 retry honoring `Retry-After`, and CDN artwork resolution
  (`artworkFileHref` picks a real href from the artwork's `files` — the short
  id 403s). Search and items URLs now `include=...coverArt`.
- `TrackList.tsx`: adaptive grid (drops heart column in the liked list via
  `showLikeButton`), `loading="lazy"` artwork, `allowRemoveFromLibrary` prop,
  per-row click plays from queue position, wraps rows in `TrackContextMenu`.
- IPC: `window.api.getFavoriteTracksPage(cursor)` and `getTracksByIds(ids)`.
- Added `formatTotalDuration`, `artworkUrl` passthrough for full CDN https hrefs,
  `FavoriteTracksPage` type, "Songs" nav entry in the Sidebar.

  **Estado parcial (NO funcional aún):** `TrackContextMenu` entries (Play next,
  Add to queue, Add to playlist, Remove from library, Go to album/artist) route
  to `runPlaceholder()` no-ops. Like hearts are decorative. Remove-from-library
  is visible but inert. Shuffle is one-shot (no persistent toggle); no repeat mode.
  Play/Shuffle sí cargan la librería completa antes de iniciar (spinner). Live
  handoff: `.opencode/plans/session-handoff-liked-songs.md`.
- Working tree (no commits yet): `git status` — 11 modified + 5 untracked
  (`src/views/SongsView.tsx`, `src/store/songsStore.ts`,
  `src/components/tracks/TrackContextMenu.tsx`,
  `.opencode/plans/session-handoff-liked-songs.md`,
  `.opencode/plans/session-handoff-build-distribution.md`). The stash at `stash@{0}` is
  an **abandoned prior iteration** — ignore it. `npm run typecheck` and
  `npm run build` pass.

### Blocked

**Historical (why the migration exists):** audio playback failed on Linux with
Tauri because WebKitGTK has no EME/Widevine. That blocker is resolved under
Electron — `isDrmSupported()` is true and EME/Widevine works. Keep this context;
do not regress back to WebKitGTK.

**Historical (30s preview):** the dashboard app token only grants
`assetPresentation: PREVIEW` (server-side tier decision). **RESOLVED** on
2026-09-14 with the first-party web session — `webSessionAuth.ts` mints a
listener (web player) token that gets FULL manifests. See Current Status.

**Current (open): the liked-songs screen is only partially functional.**
`TrackContextMenu` actions are UI placeholders (`runPlaceholder()` no-ops):
Play next, Add to queue, Add to playlist, Remove from library, Go to album/artist.
Like hearts are decorative (not wired to `collection.write`); remove-from-library
is visible but inert; shuffle is a one-shot queue shuffle with no persistent
toggle, and there is no repeat mode in PlayerBar. Next steps (Phase 3/6 of the
roadmap): wire context-menu and like/unlike flows to the collection API, add a
persistent shuffle/repeat control, and commit the working tree.

**Current (open, next session — build/distribution):** the app only runs on this
Bazzite machine. Trying `electron-vite` on a Windows 11 machine errored, and
packaging on this machine fails with a 404 on the electron version. Both are
documented in `.opencode/plans/session-handoff-build-distribution.md` (symptoms
only; investigation deferred to that session). Also pending: Step 10 (packaging)
of the Electron migration and an `electron-builder.yml` (not created yet).

### Linux launch runbook (do not remove these flags)

`npm run dev` and `npm start` bake two Chromium flags into the scripts
(in `package.json`):

- `--noSandbox` (electron-vite flag → puts `--no-sandbox` on Electron's argv).
  WHY: the npm-installed fork ships a non-SUID `chrome-sandbox`; on
  Fedora/Bazzite with SELinux enforcing, the Chromium zygote dies at startup
  ("FATAL content/browser/zygote_host/zygote_host_impl_linux.cc:237" →
  "Zygote process exited prematurely"). Verified: `app.commandLine.appendSwitch("no-sandbox")`
  is IGNORED by this build — the flag must reach Electron's argv.
- `-- --in-process-gpu` (electron-vite passthrough → `--in-process-gpu`).
  WHY: on this Wayland session the separate GPU process fails to launch
  ("GPU process launch failed: error_code=1002" then FATAL "GPU process isn't
  usable"), even with `--disable-gpu`. In-process GPU boots reliably.

Keep both in every dev/start script. When packaging (Step 10), replicate via
`linux.executableArgs: ["--no-sandbox", "--in-process-gpu"]` in the
electron-builder config.

---

## Tech Stack

### Frontend (unchanged from Tauri era)

| Technology | Version | Role |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | 5+ | Language — strict mode enabled |
| Vite | 5+ | Build tool via `electron-vite` |
| Zustand | 4+ | Client state: player, queue, session |
| TanStack Query | 5+ | Server state: catalog caching, background refetch |
| Tailwind CSS | 4 | Utility-first styling |
| shadcn/ui | latest | Accessible component primitives |
| React Router | v7 (`react-router`) | Client-side routing |
| TIDAL Web SDK | `@tidal-music/player ^0.20.1` | Audio playback — the only permitted playback path |

### Desktop Shell (Electron)

| Technology | Role |
|---|---|
| `@castlabs/electron-releases` | Electron fork with Widevine bundled — **do not use `electron` npm package directly** |
| `electron-vite` | Vite integration for main + preload + renderer processes |
| `electron-builder` | Cross-platform packaging (.exe installer, .AppImage, .deb) |

#### Why Castlabs and not standard Electron

Standard `electron` does not bundle the Widevine CDM. Castlabs maintains a drop-in
fork of Electron called **Electron for Content Security (ECS)** that supports the
Widevine CDM with VMP (Verified Media Path). This is the same approach used by the
open-source project **tidal-hifi** (github.com/Mastermindzh/tidal-hifi), which has
verified Max quality (24-bit/192kHz HiRes FLAC) working on Linux with Widevine since 2021.

**Installation note (2026):** ECS is **not published on npm**. The old
`@castlabs/electron-releases` npm package no longer exists. Install the fork directly
from the GitHub tag (currently `v44.1.0+wvcus`). Because the repo's package name is
`electron`, it installs into `node_modules/electron` and the `import 'electron'` API
is identical to stock Electron:

```jsonc
// package.json — critical dependency
{
  "devDependencies": {
    "electron": "github:castlabs/electron-releases#v44.1.0+wvcus",
    "electron-vite": "^5.0.0",
    "electron-builder": "^26.0.0"
  }
}
```

**How Widevine is delivered:** the `wvcus` builds do not embed the CDM in the binary.
Designed behavior: on **first launch**, Electron's Component Updater downloads and
installs the CDM; the main process awaits `components.whenReady()` before creating
the `BrowserWindow`. In this environment that auto-install FAILED — `whenReady()`
rejects with "No component available" even though Google's update endpoints are
reachable (the updater returns no component for this request). `components.whenReady()`
is wrapped in try/catch in `electron/main/index.ts` so the window still opens.

**Working fallback (used on 2026-09-14):** pre-install an existing Widevine CDM into
the app user data. Chromium accepts a CDM present on disk in the standard layout
(a `<version>` directory holding `manifest.json` + `libwidevinecdm.so` under
`WidevineCdm/`). Reuse the tidal-hifi CDM that already exists on this machine:

```bash
mkdir -p ~/.config/waves-desktop/WidevineCdm/4.10.3050.0
cp -a ~/.var/app/com.mastermindzh.tidal-hifi/config/tidal-hifi/WidevineCdm/4.10.3050.0/. \
  ~/.config/waves-desktop/WidevineCdm/4.10.3050.0/
```

After this copy, `components.whenReady()` no longer errors and EME resolves.
`~/.config/waves-desktop` is the app's user data dir (app name `waves-desktop`).
If it is ever deleted, re-run the copy (adjust `<version>` to whatever tidal-hifi
ships at the time).

### Main Process (Node.js — replaces Rust/Tauri backend)

| Module / Package | Role |
|---|---|
| `electron` (`safeStorage`) | Token encryption — AES-256, key tied to OS user. Built-in, no extra deps. |
| `electron` (`ipcMain`) | IPC server — handles calls from the renderer process |
| `axios` | HTTP proxy to TIDAL API v2 — credentials never touch the renderer |
| `node:sqlite` (built-in) | Synchronous SQLite — play counts, preferences, queue state |
| `@libsql/client` | Turso (cloud SQLite) client for cross-device sync |
| `ws` | WebSocket server for mobile remote control |
| `dotenv` | Loads `.env` at startup |

### IPC Bridge

A `contextBridge.ts` preload script exposes a typed `window.api` object to the renderer.
Method names mirror the old Tauri `invoke()` calls so renderer changes are minimal.

```typescript
// electron/preload/contextBridge.ts — current shape of window.api
contextBridge.exposeInMainWorld('api', {
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  isAuthenticated: () => ipcRenderer.invoke('auth:is-authenticated'),
  getSessionCredentials: () => ipcRenderer.invoke('auth:get-session-credentials'),
  getAccessToken: () => ipcRenderer.invoke('auth:get-access-token'),

  searchTracks: (query: string) => ipcRenderer.invoke('catalog:search-tracks', query),
  getAlbumTracks: (albumId: string) => ipcRenderer.invoke('catalog:get-album-tracks', albumId),
  getPlaylistTracks: (playlistId: string) =>
    ipcRenderer.invoke('catalog:get-playlist-tracks', playlistId),
  getFavoriteTracksPage: (cursor: string | null) =>
    ipcRenderer.invoke('catalog:get-favorite-tracks-page', cursor),
  getTracksByIds: (trackIds: string[]) =>
    ipcRenderer.invoke('catalog:get-tracks-by-ids', trackIds),

  // First-party web session for FULL playback — see webSessionAuth.ts
  webLogin: () => ipcRenderer.invoke('web-auth:login'),
  completeWebLogin: (pasted: string) =>
    ipcRenderer.invoke('web-auth:complete-login', pasted),
  webLogout: () => ipcRenderer.invoke('web-auth:logout'),
  isWebSessionConnected: () => ipcRenderer.invoke('web-auth:is-connected'),
  getWebSessionCredentials: () => ipcRenderer.invoke('web-auth:get-session-credentials'),
  getWebPlaybackStream: (trackId: string) =>
    ipcRenderer.invoke('web-auth:get-playback-stream', trackId),
})
```

The `stats:*` methods (`incrementPlayCount`, `getSmartShuffleQueue`) were deliberately
stripped during the migration and will be re-added with the main-process repositories
in Phase 3.

The matching declaration lives in `src/types/global.d.ts`:
```typescript
declare global {
  interface Window {
    api: {
      login: () => Promise<{ isAuthenticated: boolean; userId: string | null }>;
      logout: () => Promise<{ isAuthenticated: boolean }>;
      isAuthenticated: () => Promise<boolean>;
      getSessionCredentials: () => Promise<{
        access_token: string;
        client_id: string;
        user_id: string | null;
      } | null>;
      getAccessToken: () => Promise<string | null>;
      searchTracks: (query: string) => Promise<Track[]>;
      getAlbumTracks: (albumId: string) => Promise<Track[]>;
      getPlaylistTracks: (playlistId: string) => Promise<Track[]>;
      getFavoriteTracksPage: (cursor: string | null) => Promise<FavoriteTracksPage>;
      getTracksByIds: (trackIds: string[]) => Promise<Track[]>;
      webLogin: () => Promise<{ success: boolean; pending: boolean; authorizeUrl?: string; error?: string }>;
      completeWebLogin: (pasted: string) => Promise<{ success: boolean; error?: string }>;
      webLogout: () => Promise<{ success: boolean }>;
      isWebSessionConnected: () => Promise<boolean>;
      getWebSessionCredentials: () => Promise<{
        client_id: string;
        access_token: string;
        user_id: string | null;
      } | null>;
      getWebPlaybackStream: (trackId: string) => Promise<string>;
    };
  }
}
```

### Database

| Technology | Role |
|---|---|
| SQLite via `node:sqlite` | Local database — zero config, lives in `app.getPath('userData')` |
| Turso (libSQL) | Cloud mirror of the same SQLite schema — cross-device sync |

#### Core Schema (unchanged from Tauri era)

```sql
CREATE TABLE IF NOT EXISTS track_plays (
    track_id        TEXT PRIMARY KEY,
    play_count      INTEGER NOT NULL DEFAULT 0,
    last_played_at  TEXT
);

CREATE TABLE IF NOT EXISTS user_preferences (
    preference_key   TEXT PRIMARY KEY,
    preference_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queued_tracks (
    position    INTEGER PRIMARY KEY,
    track_id    TEXT NOT NULL,
    added_at    TEXT NOT NULL
);
```

Sync strategy: writes go to both local SQLite and Turso. On startup, pull remote changes
into local. No conflict resolution — single user, last write wins.

### Mobile Remote Control

| Technology | Role |
|---|---|
| React (same codebase, `/remote` route) | Mobile UI served locally from the Electron app |
| `ws` WebSocket server | Real-time bidirectional channel: desktop ↔ phone |
| QR code (generated in-app) | Phone scans to discover the local WebSocket URL |

Phone opens the PWA in its browser — no installation required.

### External Services

| Service | Role |
|---|---|
| `openapi.tidal.com/v2` | TIDAL v2 API — catalog, search, playlists, mixes (JSON:API) |
| `auth.tidal.com/v1/oauth2` | OAuth 2.0 Authorization Code + PKCE |
| `@tidal-music/player` | TIDAL Web SDK — audio playback with Widevine DRM |
| Turso | Cloud SQLite for play count sync |

---

## Environment Variables

Never commit these. Single `.env` file at the project root.
The Electron main process loads it with `dotenv` at startup.

```env
# TIDAL Application credentials (from https://developer.tidal.com/dashboard)
TIDAL_CLIENT_ID=
TIDAL_CLIENT_SECRET=
TIDAL_REDIRECT_URI=http://127.0.0.1:8899/tidal-callback

# Turso cloud database for cross-device sync
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# WebSocket port for mobile remote control
REMOTE_CONTROL_WEBSOCKET_PORT=47836

# Optional: override SQLite file path (defaults to Electron userData dir)
LOCAL_SQLITE_PATH=
```

---

## TIDAL OAuth Redirect URI

TIDAL rejects the Authorization Code request (error `11102`) when the `redirect_uri` does not
exactly match a URI registered in the developer dashboard.

**Fixed redirect URI in use:** `http://127.0.0.1:8899/tidal-callback`

Setup (one-time):
1. Open your app in [TIDAL dashboard](https://developer.tidal.com/dashboard) → edit redirect URI
   to exactly `http://127.0.0.1:8899/tidal-callback`.
2. Enable scopes: `user.read`, `collection.read`, `collection.write`, `playlists.read`,
   `playlists.write`, `playback`, `search.read`.
3. Port and path are constants in `electron/main/auth.ts`. If changed, update both the
   code and the dashboard registration.

Tokens minted before `playback` and `search.read` scopes were added are stale —
log out and log in once to re-mint.

---

## Project Directory Structure

```
waves-desktop/
├── AGENTS.md                        # This file
├── .env                             # All env vars — never commit
├── .gitignore
├── package.json
├── tsconfig.json
├── electron-builder.yml             # Packaging: .exe (Windows), .AppImage + .deb (Linux)
│
├── electron/                        # Electron main + preload processes
│   ├── main/
│   │   ├── index.ts                 # Entry: creates BrowserWindow, registers all IPC handlers
│   │   ├── auth.ts                  # OAuth PKCE, safeStorage token encryption/decryption, refresh
│   │   ├── webSessionAuth.ts        # First-party web session for FULL (non-preview) playback
│   │   ├── catalog.ts               # Proxy to TIDAL v2 API (search, albums, playlists, mixes, liked tracks)
│   │   ├── playCountRepository.ts   # SQLite read/write for play counts
│   │   ├── smartShuffle.ts          # Shuffle algorithm ordered by play count
│   │   ├── database.ts              # SQLite connection, schema migrations (better-sqlite3)
│   │   ├── tursoSync.ts             # Cloud sync on startup and after each write
│   │   └── remoteControl.ts         # WebSocket server for mobile remote control
│   │
│   └── preload/
│       └── contextBridge.ts         # Exposes window.api to renderer via contextBridge
│
├── src/                             # React renderer process — largely unchanged from Tauri era
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── components/
│   │   ├── player/                  # PlayerBar, QueuePanel
│   │   ├── layout/                  # AppShell, sidebar
│   │   ├── tracks/                  # TrackList, TrackContextMenu (right-click menu)
│   │   ├── catalog/                 # Album grid, search
│   │   ├── remote/                  # Mobile remote control UI
│   │   └── ui/                      # shadcn/ui primitives
│   │
│   ├── lib/                         # Pure helpers (format, artwork URLs, media products)
│   │
│   ├── views/
│   │   ├── LoginView.tsx
│   │   ├── LibraryView.tsx
│   │   ├── SongsView.tsx            # Liked tracks with infinite scroll + shuffle (WIP)
│   │   ├── SearchView.tsx
│   │   ├── AlbumView.tsx
│   │   ├── PlaylistView.tsx
│   │   ├── MixesView.tsx
│   │   ├── GlobalPlaylistView.tsx
│   │   └── MobileRemoteView.tsx     # Served to phone browser via /remote route
│   │
│   ├── store/
│   │   ├── playerStore.ts
│   │   ├── queueStore.ts
│   │   ├── songsStore.ts            # Enrichment cache for liked tracks (Map id → Track|null)
│   │   └── sessionStore.ts
│   │
│   ├── services/
│   │   ├── tidalCatalogService.ts   # Calls window.api.* (was invoke())
│   │   ├── playbackService.ts       # TIDAL Web SDK — unchanged
│   │   ├── playCountService.ts      # Calls window.api for play count operations
│   │   ├── smartShuffleService.ts   # Calls window.api.getSmartShuffleQueue
│   │   ├── globalPlaylistService.ts
│   │   └── remoteControlService.ts
│   │
│   ├── hooks/
│   │   ├── useMediaSession.ts       # OS media keys — unchanged
│   │   ├── useSmartShuffle.ts
│   │   └── useRemoteControl.ts
│   │
│   └── types/
│       ├── global.d.ts              # window.api type declaration
│       ├── track.ts
│       ├── playlist.ts
│       ├── album.ts
│       ├── artist.ts
│       ├── playCount.ts
│       └── remoteControlEvent.ts
│
└── resources/
    ├── icon.png
    ├── icon.ico
    └── icon.icns
```

---

## Migration Plan: Tauri → Electron

Complete these steps in order. Do not skip ahead.
The migration is complete when a track plays with audio on Linux.

### Step 1 — Swap dependencies (half day)

```bash
# Remove Tauri
npm uninstall @tauri-apps/api
# Remove any @tauri-apps/plugin-* packages

# Add Electron toolchain (Castlabs ECS fork via GitHub URL — see "Why Castlabs")
npm install --save-dev "electron@github:castlabs/electron-releases#v44.1.0+wvcus" electron-vite electron-builder

# Add main process runtime dependencies
npm install @libsql/client ws dotenv axios
npm install --save-dev @types/ws @types/node

# SQLite uses the built-in node:sqlite module — no native dependency to install.

# Frontend dependencies stay as-is
```

Delete `src-tauri/` entirely once the main process is rewritten.

### Step 2 — Configure electron-vite (half day)

Replace `vite.config.ts` with an `electron-vite` config:

```typescript
// vite.config.ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: { entry: 'electron/main/index.ts' },
  preload: { entry: 'electron/preload/contextBridge.ts' },
  renderer: { plugins: [react(), tailwindcss()] },
})
```

Update `package.json`:
```json
{
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package:linux": "npm run build && electron-builder --linux",
    "package:win": "npm run build && electron-builder --win",
    "typecheck": "tsc --noEmit"
  }
}
```

### Step 3 — Write the main process entry (1 day)

Create `electron/main/index.ts`:

```typescript
import { app, BrowserWindow, components, ipcMain } from 'electron'
import path from 'path'
import dotenv from 'dotenv'
import { registerAuthHandlers } from './auth'
import { registerCatalogHandlers } from './catalog'
import { registerPlayCountHandlers } from './playCountRepository'
import { registerRemoteControlHandlers } from './remoteControl'
import { initializeDatabase } from './database'
import { syncFromTursoOnStartup } from './tursoSync'

dotenv.config()

async function createWindow(): Promise<void> {
  await initializeDatabase()
  await syncFromTursoOnStartup()

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/contextBridge.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // Castlabs ECS: the Widevine CDM is fetched and installed by the Component
  // Updater. Await it before creating the window so DRM is ready on first paint.
  await components.whenReady()

  registerAuthHandlers(ipcMain)
  registerCatalogHandlers(ipcMain)
  registerPlayCountHandlers(ipcMain)
  registerRemoteControlHandlers(ipcMain)
  await createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

### Step 4 — Port auth.ts (1 day)

Port the OAuth PKCE flow from Rust to Node.js. The logic is identical — only the runtime changes.

```typescript
// electron/main/auth.ts (skeleton)
import { shell, safeStorage, app } from 'electron'
import http from 'http'
import path from 'path'
import fs from 'fs'
import axios from 'axios'
import crypto from 'crypto'
import type { IpcMain } from 'electron'

const OAUTH_PORT = 8899
const OAUTH_REDIRECT_PATH = '/tidal-callback'
const TOKEN_FILE_PATH = path.join(app.getPath('userData'), 'token.enc')

// safeStorage encrypts with AES-256 using a key tied to the OS user account.
// Works on Windows (DPAPI) and Linux (libsecret/KWallet via Electron's built-in integration).
// No user configuration required on either platform — unlike tauri-plugin-keyring-store.
function saveTokenBundle(tokenBundle: object): void {
  const encryptedBuffer = safeStorage.encryptString(JSON.stringify(tokenBundle))
  fs.writeFileSync(TOKEN_FILE_PATH, encryptedBuffer)
}

function loadTokenBundle(): object | null {
  if (!fs.existsSync(TOKEN_FILE_PATH)) return null
  const encryptedBuffer = fs.readFileSync(TOKEN_FILE_PATH)
  return JSON.parse(safeStorage.decryptString(encryptedBuffer))
}

export function registerAuthHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('auth:login', async () => {
    // 1. Generate PKCE code verifier and challenge
    // 2. Build authorization URL with client_id, redirect_uri, scopes, code_challenge
    // 3. shell.openExternal(authorizationUrl)
    // 4. Start http.createServer on OAUTH_PORT — wait for GET OAUTH_REDIRECT_PATH
    // 5. Extract `code` and `state` from query params, verify CSRF state
    // 6. POST to auth.tidal.com/v1/oauth2/token with code + code_verifier
    // 7. saveTokenBundle({ accessToken, refreshToken, expiresAt, userId, clientId })
    // 8. Close the callback server
  })

  ipcMain.handle('auth:logout', async () => {
    if (fs.existsSync(TOKEN_FILE_PATH)) fs.unlinkSync(TOKEN_FILE_PATH)
  })

  ipcMain.handle('auth:get-session-credentials', async () => {
    const tokenBundle = loadTokenBundle() as any
    if (!tokenBundle) return null
    // Auto-refresh if within 60 seconds of expiry
    return {
      accessToken: tokenBundle.accessToken,
      userId: tokenBundle.userId,
      clientId: process.env.TIDAL_CLIENT_ID,
    }
  })
}
```

### Step 5 — Port catalog.ts (half day)

Port `commands/catalog.rs` to TypeScript. Logic and v2 API calls are identical.

Critical TIDAL v2 API knowledge to preserve:
- Base URL: `https://openapi.tidal.com/v2`
- Auth: `Authorization: Bearer <access_token>`, `Content-Type: application/vnd.tidal.v1+json`
- Track IDs are opaque strings. Durations are ISO 8601 (`PT2M58S`) — parse to seconds.
- Search: `GET /searchResults?query=...&include=tracks,tracks.albums,tracks.artists`
  Use the relevance order from the `tracks` relationship array, not the `included` array.
- Album tracks: `GET /albums/{id}/relationships/items?include=items.albums,items.artists`
- Playlist tracks: `GET /playlists/{id}/relationships/items?include=items.albums,items.artists`
- Album items have `trackNumber` and `volumeNumber` in their `meta` object.
- **Do NOT use v1 API** (`api.tidal.com/v1`) — it rejects modern tokens with 403/11004.

### Step 6 — Write database.ts (half day)

```typescript
// electron/main/database.ts
import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import { app } from 'electron'

let databaseConnection: DatabaseSync

export function initializeDatabase(): void {
  const databasePath = process.env.LOCAL_SQLITE_PATH
    ?? path.join(app.getPath('userData'), 'waves-desktop.db')

  databaseConnection = new DatabaseSync(databasePath)

  databaseConnection.exec(`
    CREATE TABLE IF NOT EXISTS track_plays (
      track_id        TEXT PRIMARY KEY,
      play_count      INTEGER NOT NULL DEFAULT 0,
      last_played_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      preference_key   TEXT PRIMARY KEY,
      preference_value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS queued_tracks (
      position    INTEGER PRIMARY KEY,
      track_id    TEXT NOT NULL,
      added_at    TEXT NOT NULL
    );
  `)
}

export function getDatabase(): DatabaseSync {
  return databaseConnection
}
```

### Step 7 — Write contextBridge.ts (half day)

```typescript
// electron/preload/contextBridge.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  login: () => ipcRenderer.invoke('auth:login'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSessionCredentials: () => ipcRenderer.invoke('auth:get-session-credentials'),
  searchTracks: (query: string) => ipcRenderer.invoke('catalog:search-tracks', query),
  getAlbumTracks: (albumId: string) => ipcRenderer.invoke('catalog:get-album-tracks', albumId),
  getPlaylistTracks: (playlistId: string) =>
    ipcRenderer.invoke('catalog:get-playlist-tracks', playlistId),
  incrementPlayCount: (trackId: string) =>
    ipcRenderer.invoke('stats:increment-play-count', trackId),
  getSmartShuffleQueue: (trackIds: string[]) =>
    ipcRenderer.invoke('stats:get-smart-shuffle-queue', trackIds),
})
```

### Step 8 — Update renderer call sites (half day)

Find every `invoke(...)` call from `@tauri-apps/api/core` in `src/` and replace with `window.api.*`.
This is mechanical — the logic does not change.

```typescript
// Before (Tauri)
import { invoke } from '@tauri-apps/api/core'
const tracks = await invoke<Track[]>('search_tracks', { query })

// After (Electron)
const tracks = await window.api.searchTracks(query)
```

Also remove all `@tauri-apps/*` imports from the renderer.

### Step 9 — Verify Widevine (1 day)

This is the primary goal. After the Electron shell runs:

1. `npm run dev` — confirm the window opens and login works.
2. Open DevTools (Ctrl+Shift+I) and run:
```javascript
navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
  initDataTypes: ['cenc'],
  videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
}]).then(() => console.log('Widevine OK')).catch(e => console.error('Widevine missing', e))
```
3. If "Widevine OK" — play a track and confirm audio plays.
4. If error — confirm `@castlabs/electron-releases` is installed (not `electron`).
5. Once audio works, optionally change quality in `playbackService.ts` from `HIGH` to `MAX`
   for HiRes FLAC (24-bit/192kHz).

### Step 10 — Package for Windows and Linux (half day)

```yaml
# electron-builder.yml
appId: com.personal.waves-desktop
productName: Waves Desktop
directories:
  output: dist

# Point electron-builder to the Castlabs fork
electronDist: node_modules/electron/dist

win:
  target: nsis
  icon: resources/icon.ico

linux:
  target:
    - AppImage
    - deb
  icon: resources/icon.png
  category: Audio
```

---

## Development Phases (Full Roadmap)

### Phase 0 — Environment Setup ✅ Done
React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui scaffolded.

### Phase 1 — TIDAL Authentication ✅ Done (logic preserved, shell migrating)
OAuth PKCE, fixed redirect URI, token storage, auto-refresh, logout. Verified end-to-end.

### Phase 2 — Functional Player MVP ✅ Done (logic preserved, shell migrating)
TIDAL Web SDK, Zustand stores, TIDAL v2 API catalog proxy, React Router v7, full player UI,
Media Session API, search, album/playlist views.

### Phase M — Electron Migration 🔄 In Progress
Follow Migration Plan Steps 1–10 above.
Milestone: app opens, user logs in, track plays with audio on Linux.

### Phase 3 — Smart Shuffle + Local Stats (4–5 days)
*Start after Phase M is complete.*

- `playCountRepository.ts`: increment play count when a track plays past 30 seconds.
  Use the SDK's `media-product-transition` event as the signal (not track start).
- `smartShuffle.ts` algorithm:
  1. Query play counts for all track IDs in the current context.
  2. Tracks with no record get play count = 0 (highest priority).
  3. Group into buckets by play count.
  4. Shuffle randomly within each bucket (avoids robotic feel while still balancing plays).
  5. Concatenate buckets from lowest to highest play count.
  6. Return the ordered list to the renderer as the new queue.
- The 30-second threshold is stored in `user_preferences` and is adjustable.

### Phase 4 — Cloud Sync with Turso (2–3 days)
- Create a Turso database (free tier is sufficient for a single user).
- `tursoSync.ts`: on startup, pull remote rows into local. On each play count write, also
  write to Turso. No conflict resolution — last write wins.
- Requires `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`.

### Phase 5 — Mobile Remote Control (3–4 days)
- `remoteControl.ts`: `ws` WebSocket server on `REMOTE_CONTROL_WEBSOCKET_PORT`.
- `MobileRemoteView.tsx`: React route at `/remote` — phone opens this in its browser.
- Desktop generates a QR code with local IP + WebSocket port. Phone scans to pair.
- Events: `play`, `pause`, `next`, `previous`, `set_volume`, `state_sync`.
- Desktop pushes `state_sync` (track, artwork URL, progress, volume) on every state change.

### Phase 6 — Global Playlist & Favorites (3–4 days)
- Global playlist: union of all liked tracks + tracks in all playlists, deduplicated by track ID.
  Computed on demand from TIDAL v2 API calls.
- Favorites playlist: top N tracks by `play_count` with `last_played_at` in the last 30 days.
  Computed from local SQLite — no API calls. Window is user-configurable via `user_preferences`.
- Both playlists are virtual — never written back to TIDAL.

### Phase 7 — Local metadata cache (EXTRA FEATURE, planned — not started)
*Optional per-user/per-playlist setting to cut API requests when loading a track list.
Motivation: on a large library the wait starts growing — every screen open re-fetches
the liked/playlist track lists from TIDAL before a single track can play.*

- Store ONLY referential data locally in the existing SQLite (`node:sqlite`,
  `electron/main/database.ts`): track ids, titles, artist/album names, durations,
  artwork hrefs. No stream URLs, no licensing data — those always come from TIDAL
  at playback time.
- Sources to cache: liked tracks (`userCollectionTracks/me/relationships/items`) and
  playlists (`playlists/{id}/relationships/items`).
- **User opt-in, both globally and per playlist** (stored in `user_preferences`),
  e.g. "cache liked tracks: on", "cache playlist X: on/off" — the user decides
  which libraries/playlists to keep locally.
- Behavior: when enabled, screen opens load the list from SQLite (fast, no network);
  Play/Shuffle then send the SAME cached track metadata back to TIDAL — identical
  flow, only the origin of the list changes. Cache invalidation/refresh is a
  decision to make (e.g. manual refresh + Stale-TILL ignored).
- Existing pieces that lean on this: the current page walk + enrichment could be
  replaced by a background "refresh cache" job; `songsStore.enrichedById` and the
  `getTracksByIds` enrichment stay for streaming the full metadata on playback.
- Not wired anywhere yet — design phase only.

---

## Architectural Decisions

### Why Castlabs Electron
Standard Electron requires Widevine to be installed on the system, which is not guaranteed
on all Linux distros (and absent on Bazzite by default). Castlabs' ECS fork downloads and
installs the Widevine CDM automatically via its Component Updater on first launch, making
the app self-contained on both Windows and Linux without any manual configuration.
Proven in production by tidal-hifi since 2021, with confirmed Max quality (HiRes FLAC
24-bit/192kHz) support on Linux.

Caveat (2026-09-14): the automatic CDM Component Updater did not work in this
environment (see "How Widevine is delivered" above). The practical delivery is
copying an existing CDM into the app user data — still no source build required.

### Why Widevine L3 is not a quality limitation for audio
Widevine L3 restricts video resolution (L3 sessions are capped at SD by content licensing
contracts). For audio, no equivalent contractual restriction exists — TIDAL's license servers
grant L3 sessions access to full Max quality audio. This has been confirmed in production
by tidal-hifi users on Linux streaming at 24-bit/192kHz.

### Token storage: safeStorage
`safeStorage` is built into Electron. It uses DPAPI on Windows and libsecret/KWallet on
Linux via Electron's own integration — no user-facing configuration needed. This is a
significant improvement over `tauri-plugin-keyring-store`, which required manually enabling
KWallet's Secret Service API on KDE. The encrypted blob is written to a file in
`app.getPath('userData')` — the file is useless without the OS user's key.

### Renderer never holds credentials
`contextIsolation: true`, `nodeIntegration: false`. All credential access goes through
`ipcMain` handlers. The renderer calls `window.api.*` and receives only the data it needs
(never raw tokens). The main process is the single authority for credentials.

### TIDAL v2 API only
The v1 API (`api.tidal.com/v1`) rejects all dashboard-created clients with 403/11004
(`Required scopes: r_usr`) because it validates against legacy scope names. There is no
dashboard setting that grants legacy scopes. Use v2 (`openapi.tidal.com/v2`) exclusively.

### TIDAL Web SDK with custom credentials provider
`@tidal-music/player` is the only permitted playback path. The custom `CredentialsProvider`
calls `window.api.getSessionCredentials()` — the renderer never stores tokens.
`@tidal-music/auth` is NOT used: it would duplicate auth state that the main process owns.

### Smart shuffle in the main process
The algorithm requires DB access and produces large arrays. Keeping it in Node.js avoids
serializing large datasets across the IPC bridge and allows unit testing independently of the UI.

### Play count increment strategy
A play is counted only when a track plays past 30 seconds. This matches industry convention
and avoids inflating counts from skips. The threshold is stored in `user_preferences`.
Caveat: the first-party web session resolves full-track playback (see Current
Status), so a play crossing 30 s is a genuine listen, not a preview cap.

### No separate backend server
Single-user personal app. The Electron main process replaces the backend entirely — it has
full OS access, HTTP, SQLite, WebSocket, and secure storage. No server to run or deploy.

### SQLite + Turso
SQLite is zero-config, co-located with the app. Turso provides the same SQLite dialect in
the cloud, making sync trivially simple. No ORM — raw SQL preferred for clarity and control.

### Zustand + TanStack Query
Zustand for client state (player, queue, session): flat, synchronous, minimal boilerplate.
TanStack Query for server state (catalog): caching, deduplication, background refresh out of the box.

### React Router v7
Declarative mode, flat route tree, smaller learning surface.
Routes: `/` (library), `/songs` (liked tracks), `/search`, `/albums/:id`, `/playlists/:id`, `/remote`.

---

## Code Conventions

### Language
All code, comments, variable names, function names, file names, and commit messages are in English.

### Naming
- TypeScript variables and functions: `camelCase`
- TypeScript types and interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- File names: `camelCase.ts`
- No abbreviations. Names must be self-explanatory in context without needing a comment.
  - Bad: `trk`, `cnt`, `mgr`, `cfg`, `db`
  - Good: `currentTrack`, `playCount`, `queueManager`, `userPreferences`, `databaseConnection`

### Comments
- Explain **why**, not what.
- Explain **what** only for complex algorithms or non-obvious flows.
- Do not comment obvious code — a well-named function needs no explanation.

```typescript
// Good — explains why, not what
// We count a play only after 30 seconds to match industry convention and
// avoid inflating counts from accidental taps or rapid skips.
const minimumPlayDurationSeconds = 30
```

### Code Style
- Readability over brevity.
- Object-oriented paradigm: classes and services, not scattered functions.
- N-layer architecture: presentation (React) → service (business logic) → data access (IPC/DB).
- **Result pattern** for all operations that can fail:

```typescript
type Result<T> = { success: true; data: T } | { success: false; error: string }

async function incrementPlayCount(trackId: string): Promise<Result<void>> {
  try {
    getDatabase().prepare(
      'INSERT INTO track_plays (track_id, play_count, last_played_at) VALUES (?, 1, ?) ' +
      'ON CONFLICT(track_id) DO UPDATE SET play_count = play_count + 1, last_played_at = ?'
    ).run(trackId, new Date().toISOString(), new Date().toISOString())
    return { success: true, data: undefined }
  } catch (cause) {
    return { success: false, error: `Failed to increment play count for track ${trackId}: ${cause}` }
  }
}
```

---

## Build & Test Scripts

```bash
# Start in development mode (hot reload, opens Electron window)
# Linux: --noSandbox + --in-process-gpu are baked into this script (see Linux Runbook)
npm run dev

# Preview the production build (same Linux flags baked in)
npm start

# Type-check TypeScript without emitting
npm run typecheck

# Build all processes (main + preload + renderer)
npm run build

# Package for Linux (.AppImage + .deb)
npm run package:linux

# Package for Windows (.exe installer)
npm run package:win

# Run frontend unit tests
npm run test

# Lint TypeScript
npm run lint
```

---

## Key Constraints

- **TIDAL playback requires user login.** Client Credentials only gives catalog access and
  30-second previews. Full tracks require Authorization Code OAuth with the user's own account.
  Note (2026-09-14): the dashboard app token only authorizes PREVIEW manifests server-side;
  **full playback** was unlocked with a first-party web session (`webSessionAuth.ts`) — see
  Current Status and `.opencode/plans/session-handoff-full-playback.md`.
- **Use the TIDAL Web SDK for playback.** Streaming directly from TIDAL's CDN violates terms.
  The SDK handles DRM, stream URLs, and license acquisition.
- **Personal use only.** Must not be distributed or made accessible to other users.
- **Widevine on Linux is L3 (software DRM).** For audio, this imposes no quality restriction —
  Max quality (HiRes FLAC 24-bit/192kHz) is available. L3 restrictions apply to video resolution,
  not audio. Confirmed by tidal-hifi's production usage on Linux.
- **Always use TIDAL v2 API.** v1 rejects all modern tokens with 403/11004.
- **Always use `@castlabs/electron-releases`.** Never replace it with the standard `electron`
  package — standard Electron does not bundle Widevine.
- **Turso free tier is sufficient** for a single-user play count database.
