# Waves Desktop — AGENTS.md

> This file is the single source of truth for any AI agent or developer working on
> this project's **fixed architecture, conventions, and constraints**. Read it
> entirely before writing code or making architectural decisions.
>
> Work-in-progress state is intentionally NOT in this file:
> - Product phases and future features → `ROADMAP.md`
> - Current session activity and pending tasks → `specs/actual.md`
> - Closed sessions → `specs/history/`
>
> Historical note: this project began on Tauri v2 + Rust and was fully migrated to
> Electron (the Rust backend was removed). The target stack is **Electron** — do not
> introduce Tauri/Rust code or revert to the old stack.

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

## Why Electron (and not Tauri)

The project started on Tauri v2 + Rust but hit a **hard architectural blocker** on Linux:
WebKitGTK — the only webview Tauri uses on Linux — does not implement EME
(Encrypted Media Extensions). TIDAL streams are Widevine DRM-protected. Without
`navigator.requestMediaKeySystemAccess`, the TIDAL Web SDK's Shaka Player cannot initialize
any DRM key, so audio playback is impossible on Linux with Tauri. This was a platform
limitation of WebKitGTK, not a configuration issue — there is no workaround.

Electron solves this because it bundles Chromium, which implements EME natively. Using
**Castlabs' Electron fork** (`github:castlabs/electron-releases`), Widevine is bundled inside
the binary itself — no CDM installation required on the user's system. This makes the app
truly plug-and-play on both Windows and Linux.

**What was preserved from the Tauri implementation:**
- The entire React frontend (components, views, stores, hooks, services)
- All TIDAL v2 API knowledge, OAuth flow, and token handling logic
- The product architecture, routing, and state management decisions

**What changed during the migration (decisions that stand):**
- Desktop shell: Tauri/Rust → Electron (Node.js main process)
- Token storage: `tauri-plugin-keyring-store` → Electron `safeStorage` (built-in, no extra deps)
- IPC: `invoke()` Tauri commands → `ipcMain.handle()` / `contextBridge`
- SQLite: `tauri-plugin-sql` → `node:sqlite` (built-in Node module)
- Build/package: `cargo tauri build` → `electron-builder`
- Widevine: system CDM (unavailable on Linux) → bundled via Castlabs Electron fork

## Tech Stack

### Frontend

| Technology | Version | Role |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | ~5.8 | Language — strict mode enabled |
| Vite | ^7 | Build tool via `electron-vite` |
| Zustand | 5+ | Client state: player, queue, session, songs |
| TanStack Query | 5+ | Server state: catalog caching, background refetch |
| Tailwind CSS | 4 | Utility-first styling |
| shadcn/ui (`shadcn` + base-ui) | latest | Accessible component primitives |
| React Router | v8 (`react-router`) | Client-side routing |
| TIDAL Web SDK | `@tidal-music/player ^0.20.1` | Audio playback — the only permitted playback path |

### Desktop Shell (Electron)

| Technology | Role |
|---|---|
| `github:castlabs/electron-releases#v44.1.0+wvcus` | Electron fork with Widevine bundled — **do not use the `electron` npm package directly** |
| `electron-vite` | Vite integration for main + preload + renderer processes |
| `electron-builder` | Cross-platform packaging (.exe installer, .AppImage, .deb) |

#### Why Castlabs and not standard Electron (and how Widevine is delivered)

Standard `electron` does not bundle the Widevine CDM. Castlabs maintains a drop-in
fork of Electron called **Electron for Content Security (ECS)** that supports the
Widevine CDM with VMP (Verified Media Path). This is the same approach used by the
open-source project **tidal-hifi** (github.com/Mastermindzh/tidal-hifi), which has
verified Max quality (24-bit/192kHz HiRes FLAC) working on Linux with Widevine since 2021.

ECS is **not published on npm**. Install the fork directly from the GitHub tag (currently
`v44.1.0+wvcus`). Because the repo's package name is `electron`, it installs into
`node_modules/electron` and the `import 'electron'` API is identical to stock Electron:

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
Designed behavior: on **first launch**, Electron's Component Updater downloads and installs
the CDM; the main process awaits `components.whenReady()` before creating the
`BrowserWindow`. In this environment that auto-install FAILED — `whenReady()` rejects with
"No component available" even though Google's update endpoints are reachable (the updater
returns no component for this request). `components.whenReady()` is wrapped in try/catch in
`electron/main/index.ts` so the window still opens.

**Automatic install (2026-10-23):** the Component Updater downloads the official package
(`oimompecagnajdejgnnjijobebaeigek`) into `userData/component_crx_cache/` but may fail to
install it, leaving `WidevineCdm/` empty (DRM error `S6001`). `electron/main/widevineInstaller.ts`
unpacks that cached CRX into `userData/WidevineCdm/<version>/` (and writes
`latest-component-updated-widevine-cdm`) when no version folder exists. It runs before and
after `components.whenReady()`; on a clean first launch the package is only downloaded during
`whenReady()`, so DRM is available from the **next** launch (accepted: the app needs network
anyway). The CRX/ZIP reading lives in `electron/main/crxArchive.ts` on `node:zlib` — no archive
dependency, and no CDM binary is vendored in the repo. `~/.config/waves-desktop` is the user
data dir (app name `waves-desktop`).

### Main Process (Node.js)

| Module / Package | Role |
|---|---|
| `electron` (`safeStorage`) | Token encryption — AES-256, key tied to OS user. Built-in, no extra deps. |
| `electron` (`ipcMain`) | IPC server — handles calls from the renderer process |
| `axios` | HTTP proxy to TIDAL API v2 — credentials never touch the renderer |
| `node:sqlite` (built-in) | Synchronous SQLite — play counts, preferences, queue state |
| `@libsql/client` | Turso (cloud SQLite) client for cross-device sync (Phase 5) |
| `ws` | WebSocket server for mobile remote control (Phase 6) |
| `dotenv` | Loads `.env` at startup |

### IPC Bridge

A `contextBridge` preload script exposes a typed `window.api` object to the renderer;
method names mirror the old Tauri `invoke()` calls so renderer changes were minimal.
Current capabilities:
- **App credentials:** `getCredentialsStatus`, `saveCredentials` (TIDAL dashboard
  `client_id`/`client_secret`, asked on first launch)
- **Auth:** `login`, `logout`, `isAuthenticated`, `getSessionCredentials`, `getAccessToken`
- **Catalog:** `searchTracks`, `getAlbumTracksPage`, `getPlaylistTracksPage`, `getMixTracksPage`
- **Home / detail:** `getUserPlaylists`, `getRecentAlbums`, `getMixes`, `getAlbumDetail`,
  `getPlaylistDetail`, `getMixDetail`
- **Liked tracks:** `getFavoriteTracksPage(cursor)`, `getLikedTrackIdsPage(cursor)`,
  `getTracksByIds(ids)`
- **First-party web session (FULL playback):** `webLogin` (opens a sign-in window that captures
  the redirect code by itself), `webLogout`, `isWebSessionConnected`,
  `getWebSessionCredentials`, `getWebPlaybackStream`

Every handler is registered through `handleTrusted` (`electron/main/secureIpc.ts`): the sender
frame must be the dev server or a `file:` page, and every argument is validated by
`electron/main/validation.ts` (IDs `[A-Za-z0-9_-]{1,64}`, bounded cursors/queries/lists) before it
reaches a URL. New handlers must follow the same pattern.

The exact contract is typed once in `src/types/global.d.ts` — that file is the source of
truth (do not duplicate it into docs). The `stats:*` methods (`incrementPlayCount`,
`getSmartShuffleQueue`) were deliberately stripped during the migration and will be re-added
with the main-process repositories in **Phase 4** (see `ROADMAP.md`).

### Database

| Technology | Role |
|---|---|
| SQLite via `node:sqlite` | Local database — zero config, lives in `app.getPath('userData')` |
| Turso (libSQL) | Cloud mirror of the same SQLite schema — cross-device sync (Phase 5) |

#### Core Schema

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

Sync strategy: writes go to both local SQLite and Turso; on startup, pull remote changes
into local. No conflict resolution — single user, last write wins. (The Turso sync itself
is Phase 5 of the roadmap; the local schema is already in place.)

### External Services

| Service | Role |
|---|---|
| `openapi.tidal.com/v2` | TIDAL v2 API — catalog, search, playlists, mixes (JSON:API) |
| `auth.tidal.com/v1/oauth2` | OAuth 2.0 Authorization Code + PKCE |
| `@tidal-music/player` | TIDAL Web SDK — audio playback with Widevine DRM |
| Turso | Cloud SQLite for play count sync (Phase 5) |

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

`TIDAL_CLIENT_ID` / `TIDAL_CLIENT_SECRET` are a **development override**: a packaged build asks
for them on first launch and stores them encrypted (`safeStorage`, file mode 0600) in
`userData/tidal-app-credentials`. When both are set in `.env` they win over the stored ones.
Besides those, the main process only reads `LOCAL_SQLITE_PATH`. The redirect URI is hardcoded in
`electron/main/auth.ts` (`TIDAL_REDIRECT_URI` is documentation only), and the `TURSO_*` /
`REMOTE_CONTROL_*` variables are reserved for Phases 5 and 6 (see `.env.example`).

## TIDAL OAuth Redirect URI

TIDAL rejects the Authorization Code request (error `11102`) when the `redirect_uri` does not
exactly match a URI registered in the developer dashboard.

**Fixed redirect URI in use:** `http://127.0.0.1:8899/tidal-callback`

Setup (one-time):
1. Open your app in the [TIDAL dashboard](https://developer.tidal.com/dashboard) → edit
   redirect URI to exactly `http://127.0.0.1:8899/tidal-callback`.
2. Enable scopes: `user.read`, `collection.read`, `collection.write`, `playlists.read`,
   `playlists.write`, `playback`, `search.read`.
3. Port and path are constants in `electron/main/auth.ts`. If changed, update both the code
   and the dashboard registration.

Tokens minted before `playback` and `search.read` scopes were added are stale —
log out and log in once to re-mint.

## TIDAL v2 API — Critical Knowledge

- Base URL: `https://openapi.tidal.com/v2`; default country code `US`.
- Auth: `Authorization: Bearer <access_token>`; `Content-Type: application/vnd.api+json`.
- Track IDs are opaque strings. Durations are ISO 8601 (`PT2M58S`) — parse to seconds.
- **Never use the v1 API** (`api.tidal.com/v1`) — it rejects all modern/dashboard tokens
  with 403/11004 (it validates legacy scope names; no dashboard setting grants them).
- Search: `GET /searchResults?query=...&include=tracks,tracks.albums,tracks.artists`.
  Use the relevance order from the `tracks` relationship array, not the `included` array.
- Album tracks: `GET /albums/{id}/relationships/items?include=items.albums,items.artists`.
- Playlist tracks: `GET /playlists/{id}/relationships/items?include=items.albums,items.artists`.
- Album items have `trackNumber` and `volumeNumber` in their `meta` object.
- Artwork: the short `coverArt` id 403s on the CDN — resolve the real href from the artwork
  resource's `attributes.files` (see `artworkFileHref` in `electron/main/catalog.ts`).
- Search and items URLs now request `include=...coverArt`.

### Liked tracks (`/userCollectionTracks/me/relationships/items`) — hard rules

Verified constraints; do not "optimize" around them:
- **Enrichment is REQUIRED, not optional.** This endpoint only accepts `include=items`
  (it rejects `items.albums.coverArt` with 400 — unlike playlists/albums), so the items
  always lack artwork. Cover art (and any other missing field) must come from a second call:
  `getTracksByIds` + `songsStore.ts` enrichment. Do not remove the enrichment path.
- **`page[size]` max = 50.** `COLLECTION_PAGE_SIZES = [50]` with a descending probe to a
  server default at runtime (`getLikedTracksPage` in `electron/main/catalog.ts`). Values 500
  and 100 are both rejected by TIDAL's edge with HTTP 429 (rate-limit). **Do not raise this
  value in another session.**
- **No server-side shuffle.** `sort` on this endpoint only accepts `addedAt`, `albums.title`,
  `artists.name`, `duration`, `title` (with `-` prefix for descending). Shuffle must be
  client-side.
- **Rate limits:** 429 retries must honor `Retry-After` + pacing between pages/batches
  (300/200 ms) + chunks of `filter[id]` of 50 (`MAX_TRACKS_PER_BATCH = 50`). When a fetch
  exhausts retries, stop and show the error — do not wait forever.

## Project Directory Structure

```
waves-desktop/
├── AGENTS.md                       # This file (CLAUDE.md imports it)
├── ROADMAP.md                      # Product phases & future features
├── CLAUDE.md                       # Claude Code rules (imports this file)
├── specs/                          # Session workflow (flujo plugin)
│   ├── actual.md                   # Current session
│   └── history/                    # Closed sessions (YYYY-MM-DD-<slug>.md)
├── README.md
├── .env                            # All env vars — never commit
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── electron-builder.yml            # Packaging: .exe (Windows), .AppImage + .deb (Linux)
├── electron.vite.config.ts
├── eslint.config.js                # Flat ESLint config (typescript-eslint + react-hooks)
├── vitest.config.ts                # Unit tests (Node environment, `@` alias)
│
├── electron/                       # Electron main + preload processes
│   ├── main/
│   │   ├── index.ts                # Entry: creates BrowserWindow, registers all IPC handlers
│   │   ├── auth.ts                 # OAuth PKCE, safeStorage token encryption/decryption, refresh
│   │   ├── tidalAppCredentials.ts  # First-launch TIDAL client id/secret (safeStorage) + IPC
│   │   ├── webSessionAuth.ts       # First-party web session for FULL playback (sign-in window)
│   │   ├── secureIpc.ts            # handleTrusted: sender check for every IPC handler
│   │   ├── validation.ts           # Pure argument validation, sender trust, credential parsing
│   │   ├── privateFile.ts          # Writes files with mode 0600
│   │   ├── widevineInstaller.ts    # Unpacks the cached Widevine CRX into userData
│   │   ├── crxArchive.ts           # CRX3 header + minimal ZIP reader (node:zlib, pure)
│   │   ├── catalog.ts              # Proxy to TIDAL v2 API (search, albums, playlists, mixes, liked tracks)
│   │   ├── tidalParsers.ts         # Pure JSON:API → Track parsing (unit-tested, no electron/axios imports)
│   │   └── database.ts             # SQLite via node:sqlite — connection + schema
│   │
│   └── preload/
│       └── contextBridge.ts        # Exposes window.api to renderer via contextBridge
│
├── scripts/
│   ├── ensureElectron.mjs          # postinstall: downloads fork binary if dist/ missing
│   └── runElectron.mjs             # dev/start: spawns electron-vite, Linux-only Chromium flags
│
├── resources/
│   ├── icon.png                    # Placeholder (AppImage/deb) — replace when real branding exists
│   ├── icon.ico                    # Placeholder (nsis installer)
│   └── icon.icns
│
└── src/                            # React renderer process
    ├── main.tsx
    ├── App.tsx                     # Router (react-router v8) + global error/session handling
    │
    ├── components/
    │   ├── layout/                 # AppShell, Sidebar
    │   ├── media/                  # MediaCard, HorizontalScroll (Home rows)
    │   ├── player/                 # PlayerBar, QueuePanel
    │   ├── tracks/                 # TrackList, TrackContextMenu (right-click menu)
    │   └── ui/                     # shadcn/ui primitives
    │
    ├── hooks/
    │   ├── useMediaSession.ts      # OS media keys
    │   ├── useLogout.ts            # Stops playback, then logs out
    │   ├── useTrackCollection.ts   # Infinite query + background prefetch + full-collection playback
    │   └── useTrackEnrichment.ts   # Batches getTracksByIds into songsStore
    │
    ├── lib/                        # Pure helpers (format, artwork URLs, media products, logger, random, mediaPlayback);
    │                               #   `*.test.ts` files live next to the code they cover
    │
    ├── services/
    │   ├── tidalCatalogService.ts  # Calls window.api.* (was invoke())
    │   └── playbackService.ts      # TIDAL Web SDK — the only playback path
    │
    ├── store/
    │   ├── playerStore.ts          # Volume 0-100 (converted to 0-1 for the SDK on set)
    │   ├── queueStore.ts
    │   ├── sessionStore.ts
    │   ├── likedStore.ts           # Set of liked track ids (read-only for now)
    │   └── songsStore.ts           # Enrichment cache for liked tracks (Map id → Track|null)
    │
    ├── types/
    │   ├── global.d.ts             # window.api type declaration (source of truth for IPC)
    │   ├── auth.ts
    │   ├── media.ts                # Home/detail media summaries (playlist, album, mix)
    │   └── track.ts
    │
    └── views/
        ├── LoginView.tsx
        ├── HomeView.tsx            # Library overview: playlists, mixes, new releases
        ├── SongsView.tsx           # Liked tracks with infinite scroll + full-library playback
        ├── SearchView.tsx
        ├── MediaDetailView.tsx     # Generic playlist/album/mix detail (TrackList + header)
        └── SettingsView.tsx        # Full-length playback session controls
```

## Build & Test Runbook

**Node requirement: >= 22.12.0** (pinned by `.nvmrc` = `22` and `package.json` `engines`).
Node 16/18 fail: `@tailwindcss/oxide` native binding, vite/electron-vite, and the Castlabs
fork all require Node >= 20/22. Use nvm on Windows: `nvm install 22` then `nvm use 22`.

`npm install` is plug-and-play on every OS: the `postinstall` hook
(`scripts/ensureElectron.mjs`) runs the fork's `install.js` automatically when
`node_modules/electron/dist` is missing — no manual binary download.

```bash
npm run dev           # Development (hot reload, opens Electron window)
npm start             # Preview the production build
npm run typecheck     # tsc --noEmit for tsconfig.node.json and tsconfig.json
npm run lint          # ESLint (typescript-eslint + react-hooks)
npm test              # Vitest unit tests (pure logic only: lib, stores, catalog parsers)
npm run build         # Build all processes (main + preload + renderer)
npm run verify        # typecheck + lint + test + build — run before every commit

npm run package:linux # Package Linux (.AppImage + .deb) — run ON the Linux machine
npm run package:win   # Package Windows (.exe, nsis) — run ON a Windows machine
```

Verification is `npm run verify`. Tests cover pure logic only; anything that needs the
Electron runtime, the TIDAL SDK or DRM is verified manually with `npm run dev`. New pure
logic (parsers, stores, helpers) ships with a `*.test.ts` next to it.

### Building on a fresh machine (the "clone + npm install + npm start" promise)

1. Node 22+ (`.nvmrc` pins 22). On Windows with nvm: `nvm install 22 && nvm use 22`.
2. `npm install` — the `postinstall` downloads the Castlabs Electron binary for your OS
   from `github.com/castlabs/electron-releases`.
3. `npm run dev` — opens the window. Electron-builder uses
   `electronDist: node_modules/electron/dist` (see `electron-builder.yml`), so packaging
   never touches the standard Electron releases; the local dist is single-platform, so
   package on the matching OS.

### Linux launch runbook (do not remove these flags)

`npm run dev` and `npm start` bake three Chromium flags into the scripts. They are appended by
`scripts/runElectron.mjs` **only on Linux**; Windows runs without them.

- `--noSandbox` (electron-vite flag → puts `--no-sandbox` on Electron's argv).
  WHY: the npm-installed fork ships a non-SUID `chrome-sandbox`; on Fedora/Bazzite with
  SELinux enforcing, the Chromium zygote dies at startup ("Zygote process exited
  prematurely"). Verified: `app.commandLine.appendSwitch("no-sandbox")` is IGNORED by this
  build — the flag must reach Electron's argv.
- `-- --in-process-gpu` (electron-vite passthrough → `--in-process-gpu`).
  WHY: on this Wayland session the separate GPU process fails to launch ("GPU process
  launch failed: error_code=1002" then FATAL "GPU process isn't usable"), even with
  `--disable-gpu`. In-process GPU boots reliably.

- `--no-zygote` (passthrough after `--`, like `--in-process-gpu`).
  WHY (2026-11-14): in some launches (seen from the VS Code terminal) Chromium's zygote
  processes disappear shortly after startup. Without a zygote no new renderer can start: the
  TIDAL sign-in window then stays blank because the cross-site iframe of TIDAL's device check
  (`geo.captcha-delivery.com`) is cancelled with `net::ERR_ABORTED`, and a window that needs a
  fresh renderer fails with `launch-failed`. Reproduced by killing the zygotes of a test
  instance; with `--no-zygote` Chromium launches each process directly and both the sign-in
  page and Widevine (`createMediaKeys`) work. Only valid together with `--no-sandbox`.

During packaging they are replicated via `linux.executableArgs: ["--no-sandbox",
"--in-process-gpu", "--no-zygote"]` in `electron-builder.yml`.

## Architectural Decisions

### Why Castlabs Electron
Standard Electron requires Widevine to be installed on the system, which is not guaranteed
on all Linux distros (and absent on Bazzite by default). Castlabs' ECS fork bundles/downloads
the Widevine CDM, making the app self-contained on both Windows and Linux. Proven in
production by tidal-hifi since 2021, with confirmed Max quality (HiRes FLAC 24-bit/192kHz).
Caveat (2026-09-14): the automatic CDM Component Updater did not work in this environment —
the practical delivery is copying an existing CDM into the app user data (see "How Widevine
is delivered" above). Still no source build required.

### Why Widevine L3 is not a quality limitation for audio
Widevine L3 restricts video resolution (L3 sessions are capped at SD by content licensing
contracts). For audio, no equivalent contractual restriction exists — TIDAL's license servers
grant L3 sessions access to full Max quality audio. Confirmed in production by tidal-hifi
users on Linux streaming at 24-bit/192kHz.

### Token storage: safeStorage
`safeStorage` is built into Electron: DPAPI on Windows, libsecret/KWallet on Linux — no
user-facing configuration needed. Significant improvement over `tauri-plugin-keyring-store`,
which required manually enabling KWallet's Secret Service API on KDE. The encrypted blob is
written to a file in `app.getPath('userData')` — useless without the OS user's key.

### Content Security Policy (production only)
`electron.vite.config.ts` injects a CSP `<meta>` into the **built** `index.html` only (dev needs
inline scripts for hot reload). Scripts/workers are limited to the app; `https:`/`wss:` stay open
for `connect-src`/`img-src`/`media-src` because the TIDAL SDK talks to several TIDAL hosts. If
audio breaks only in `npm start`/packaged builds, check this policy first.

### Sign-in window must stay a plain Electron window
`webSessionAuth.ts` opens `login.tidal.com/authorize` in an app-owned `BrowserWindow`. TIDAL answers
first with a transparent device check (`geo.captcha-delivery.com` interstitial, HTTP 403) that
resolves by itself in a few seconds and reloads into the real login page. **Do not alter the
window's user agent or other fingerprint:** overriding it (stripping the `Electron/` token) made
the check hang on a blank page. Verified 2026-11-14 by driving the built app over the debug port:
the login page rendered. Its `web-login:` log lines are the first thing to read if it goes blank.

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
`setEventSender({ sendEvent() {} })` is REQUIRED — the SDK's `hasEventSender()` guard blocks
`load`/`setNext` otherwise, and the SDK only invokes `sendEvent()`.

### Playback session token priority
Two credential sources exist; `buildCredentialsProvider().getCredentials()` branches: the
**first-party web session** (web player at `tidal.com`, client `49YxDN9a2aFV6RTG`; the older `listen.tidal.com` client `CzET4vdadNUFQ5JU` is rejected by TIDAL since 2026-11) when connected, the
**Dashboard app token** otherwise. Dashboard tokens only ever produce PREVIEW manifests
(`assetPresentation` is decided server-side by token tier); the first-party web session
produces `FULL`. The SDK requests credentials on every `load`, so connecting the session is
enough — no re-initialization required.

### Play count increment strategy (Phase 4)
A play is counted only when a track plays past 30 seconds — matches industry convention and
avoids inflating counts from skips. The threshold is stored in `user_preferences`. The
first-party web session resolves full-track playback, so a play crossing 30 s is a genuine
listen, not a preview cap.

### Smart shuffle in the main process (Phase 4)
The algorithm requires DB access and produces large arrays. Keeping it in Node.js avoids
serializing large datasets across the IPC bridge and allows unit testing independently of
the UI.

### No separate backend server
Single-user personal app. The Electron main process replaces the backend entirely — it has
full OS access, HTTP, SQLite, WebSocket, and secure storage. No server to run or deploy.

### SQLite + Turso
SQLite is zero-config, co-located with the app. Turso provides the same SQLite dialect in
the cloud, making sync trivially simple. No ORM — raw SQL preferred for clarity and control.

### Zustand + TanStack Query
Zustand for client state (player, queue, session): flat, synchronous, minimal boilerplate.
TanStack Query for server state (catalog): caching, deduplication, background refresh out of
the box.

### React Router v8
Declarative mode, flat route tree. Current routes: `/` (Home), `/songs` (liked tracks),
`/search`, `/settings`, `/albums/:albumId`, `/playlists/:playlistId`,
`/mixes/:mixType/:mixId`. `/remote` (mobile remote) is Phase 6.

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
```

## Key Constraints

- **No new npm dependencies without a strong reason.** Prefer Node/Electron built-ins (`fetch`,
  `node:zlib`, `safeStorage`, `node:sqlite`) — the CRX/ZIP reader and argument validation are
  hand-written for this reason.
- **TIDAL playback requires user login.** Client Credentials only gives catalog access and
  30-second previews. Full tracks require Authorization Code OAuth with the user's own
  account; the Dashboard app token only authorizes PREVIEW manifests server-side. Full
  playback comes from the first-party web session (`webSessionAuth.ts`).
- **Use the TIDAL Web SDK for playback.** Streaming directly from TIDAL's CDN violates terms.
  The SDK handles DRM, stream URLs, and license acquisition.
- **Personal use only.** Must not be distributed or made accessible to other users.
- **Widevine on Linux is L3 (software DRM).** For audio this imposes no quality restriction —
  Max quality (HiRes FLAC 24-bit/192kHz) is available. L3 restrictions apply to video
  resolution, not audio. Confirmed by tidal-hifi's production usage on Linux.
- **Always use TIDAL v2 API.** v1 rejects all modern tokens with 403/11004.
- **Always use `github:castlabs/electron-releases`.** Never replace it with the standard
  `electron` package — standard Electron does not bundle Widevine.
- **Turso free tier is sufficient** for a single-user play count database.