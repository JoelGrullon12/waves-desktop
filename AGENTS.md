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
| TIDAL web player | `https://tidal.com/` in a hidden window | Audio playback — the only playback path (see "Playback engine") |

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
returns no component for this request). `components.whenReady()` is wrapped in try/catch and a
20 s timeout (it has also been seen to never answer) in
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
| `@libsql/client` (`/web` entry, HTTP only, no native module) | Turso (cloud SQLite) client for cross-device play count sync |
| `ws` + `node:http` | Phone remote: page and WebSocket served on the local network |
| `qrcode-generator` | (renderer) QR code that pairs a phone with the remote |
| `dotenv` | Loads `.env` at startup |

### IPC Bridge

A `contextBridge` preload script exposes a typed `window.api` object to the renderer.
The exact contract is typed once in `src/types/global.d.ts` — that file is the source of
truth (do not duplicate it into docs). Channel families:
- `credentials:*` — TIDAL dashboard client id/secret (asked on first launch, editable in Settings)
- `app-data:*` — data folder (info, open, move through a native folder picker, back to default)
- `auth:*` — Dashboard app session (login, logout, is-authenticated). No handler returns a token.
- `web-auth:*` — first-party web session used by the playback engine (login, logout, is-connected)
- `catalog:*` / `library:*` — TIDAL v2 reads (search, albums, playlists, mixes, artists, liked
  tracks, releases feed, collection albums/artists) and writes (like/unlike, add to playlist,
  create/delete playlist)
- `player:*` — playback engine commands, plus the `player:state` and `player:media-key` events
- `preferences:*` / `queue:*` — settings and the saved play queue (SQLite)
- `stats:*` — play counts, smart shuffle order, top played
- `sync:*` — Turso sync status / run now / get, save (checked first) and clear its settings
- `remote:*` — phone remote (info, on/off, port, new pairing code, state publishing, `remote:command` event)
- `cache:*` — local library copy (status, on/off, refresh, search, playlist memberships,
  `cache:status` event)
- `debug:api-get` — only answered with `WAVES_DEBUG_API=1`

Every handler is registered through `handleTrusted` (`electron/main/secureIpc.ts`): the sender
frame must be the dev server or a `file:` page, and every argument is validated by
`electron/main/validation.ts` (IDs `[A-Za-z0-9_-]{1,64}`, bounded cursors/queries/lists) before it
reaches a URL. New handlers must follow the same pattern.

### Database

| Technology | Role |
|---|---|
| SQLite via `node:sqlite` | Local database — zero config, lives in `app.getPath('userData')` |
| Turso (libSQL) | Cloud copy of the play counts — cross-device sync |

#### Schema

The source of truth is `electron/main/databaseSchema.ts` (`DATABASE_SCHEMA` + `migrateDatabase`
for changes to existing tables). Tables:
- `track_plays` (`track_id`, `play_count`, `last_played_at`, `baseline_count`) — `baseline_count`
  is the level a track enters smart shuffle at; it is local and never synced.
- `user_preferences` — no longer used: earlier versions kept the settings here; they are moved
  once into `settings.ini` (see "Configuration and data folder") and the rows are deleted.
- `queued_tracks` — the play queue as it was when the app closed.
- `cached_tracks`, `cached_collections`, `cached_collection_items` — the optional local library copy.

No ORM, raw SQL. Repositories take the connection in their constructor so they are unit-tested
against an in-memory database with the real schema.

### External Services

| Service | Role |
|---|---|
| `openapi.tidal.com/v2` | TIDAL v2 API — catalog, search, playlists, mixes (JSON:API) |
| `auth.tidal.com/v1/oauth2` | OAuth 2.0 Authorization Code + PKCE |
| `https://tidal.com/` | TIDAL's web player, loaded in a hidden window — audio playback with Widevine DRM |
| Turso | Cloud SQLite for play count sync |

## Configuration and data folder

A packaged build has no `.env`, so everything the user configures is kept in the **data folder**
(`electron/main/appDataLocation.ts`): by default Electron's `userData`
(`~/.config/waves-desktop`, `%APPDATA%\waves-desktop`). Settings → App data shows it, opens it
and moves it; the chosen folder is written in `waves-location.ini` in `userData`, and moving
copies the files, removes the originals and restarts the app. Chromium's data (TIDAL web
session, Widevine CDM) and the OAuth token bundle always stay in `userData`.

In the data folder:
- `settings.ini` — every renderer setting (keys in `src/lib/preferences.ts`) plus `cache.enabled`,
  `remote.enabled`, `remote.port`. Hand-written INI reader/writer (`iniFile.ts`), sections from
  the first segment of the dotted key; written atomically (`preferencesFile.ts`).
- `app-secrets` — one safeStorage-encrypted JSON (`appSecrets.ts`): TIDAL client id/secret,
  Turso URL/token, the remote's pairing token. No IPC handler returns these values.
- `waves-desktop.db` — SQLite (unless `LOCAL_SQLITE_PATH` points elsewhere).
- `logs/main.log` (`fileLog.ts`, rotated at 2 MB into `main.old.log`) — everything the main
  process prints, renderer errors/warnings, failed loads and crashed processes of the window,
  utility processes that die (`child-process-gone`), DRM-looking console errors of the engine page
  and, once per playback, the state of the engine page's media elements (volume, muted,
  readyState, MediaKeys, error). First thing to read when a packaged build misbehaves, above all on
  Windows. A page that fails to load shows an error page with the log path instead of staying
  blank; a React render error shows `AppErrorBoundary`.

Settings edits Turso (checked with `SELECT 1` before saving, sync restarts without a relaunch),
the remote's port and the TIDAL credentials. A value set in `.env` wins over the saved one
(`resolveTidalAppCredentials` / `resolveTursoConfig` in `validation.ts`) and Settings then shows
it as read-only.

## Environment Variables

Never commit these. Single `.env` file at the project root, **development only** (a packaged
build is configured from Settings). The Electron main process loads it with `dotenv` at startup.

```env
# Development override: a packaged build asks for these on first launch
TIDAL_CLIENT_ID=
TIDAL_CLIENT_SECRET=

# Turso cloud database for play count sync (both empty = sync off, everything stays local)
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# Port of the phone remote (default 47836)
REMOTE_CONTROL_WEBSOCKET_PORT=

# Optional: override SQLite file path (defaults to Electron userData dir)
LOCAL_SQLITE_PATH=
```

`TIDAL_CLIENT_ID` / `TIDAL_CLIENT_SECRET` are a **development override**: a packaged build asks
for them on first launch and stores them in `app-secrets`. When both are set in `.env` they win
over the stored ones (same rule for `TURSO_*` and `REMOTE_CONTROL_WEBSOCKET_PORT`).
The redirect URI is hardcoded in `electron/main/auth.ts`.

Debug-only variables: `WAVES_SHOW_ENGINE=1` (show the engine window), `WAVES_DEBUG_API=1`
(enable `debug:api-get`), `WAVES_SYNC_TABLE` (Turso table name, to test sync against a
throwaway table), `WAVES_USER_DATA_DIRECTORY` (absolute path used as `userData`, to run checks
against a copy of the profile instead of the real one).

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

- Base URL: `https://openapi.tidal.com/v2`. URLs are built with `countryCode=US` and
  `tidalApiClient.ts` replaces it with the account's own country (read once per session).
- Auth: `Authorization: Bearer <access_token>`; `Content-Type: application/vnd.api+json`.
- Track IDs are opaque strings. Durations are ISO 8601 (`PT2M58S`) — parse to seconds.
- **Never use the v1 API** (`api.tidal.com/v1`) — it rejects all modern/dashboard tokens
  with 403/11004 (it validates legacy scope names; no dashboard setting grants them).
- Search: `GET /searchResults?query=...&include=tracks,tracks.albums,tracks.artists`.
  Use the relevance order from the `tracks` relationship array, not the `included` array.
  Albums, artists and playlists need one request per kind (`searchCollections` in
  `libraryCatalog.ts`): a single request fills only one relationship and allows 10 includes.
- `GET /tracks?filter[id]=...` accepts at most **20** ids per request (HTTP 400 above that,
  verified 2026-11-16; it used to accept 50). `getTracksByIds` chunks accordingly.
- Playlist folders can not be read with the v2 API (404). A new playlist takes 1-2 s to be listed.
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
  (300/200 ms) + chunks of `filter[id]` of 20 (`MAX_TRACKS_PER_BATCH = 20`). When a fetch
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
│   │   ├── tidalWebPlayer.ts       # Playback engine: hidden window with TIDAL's web player
│   │   ├── tidalWebPlayerScript.ts # Everything specific to TIDAL's page (Redux actions, snapshot)
│   │   ├── appDataLocation.ts      # Data folder: where it is, moving it + IPC
│   │   ├── appSecrets.ts           # Encrypted secrets file (TIDAL app, Turso, remote token)
│   │   ├── fileLog.ts              # Copies the main process console into logs/main.log
│   │   ├── iniFile.ts              # Pure INI reader/writer
│   │   ├── preferencesFile.ts      # settings.ini store + one-time import from SQLite
│   │   ├── secureIpc.ts            # handleTrusted: sender check for every IPC handler
│   │   ├── validation.ts           # Pure argument validation, sender trust, credential parsing
│   │   ├── privateFile.ts          # Writes files with mode 0600
│   │   ├── widevineInstaller.ts    # Unpacks the cached Widevine CRX into userData
│   │   ├── crxArchive.ts           # CRX3 header + minimal ZIP reader (node:zlib, pure)
│   │   ├── tidalApiClient.ts       # Authorized requests, 429 retries, account country, debug explorer
│   │   ├── catalog.ts              # TIDAL v2 reads and writes (search, albums, playlists, mixes, likes)
│   │   ├── libraryCatalog.ts       # Artists, collection albums/artists, search of albums/artists/playlists
│   │   ├── tidalParsers.ts         # Pure JSON:API → Track parsing
│   │   ├── database.ts             # SQLite connection (node:sqlite)
│   │   ├── databaseSchema.ts       # Schema + migrations (usable with an in-memory database)
│   │   ├── preferencesRepository.ts # Settings singleton, saved queue + IPC
│   │   ├── playCountRepository.ts  # Play counts, baselines, top played + IPC
│   │   ├── smartShuffle.ts         # Pure smart shuffle ordering
│   │   ├── playSync.ts             # Pure merge rules of the cloud sync
│   │   ├── tursoSync.ts            # Turso sync service + IPC
│   │   ├── remoteControl.ts        # Phone remote server (node:http + ws) + IPC
│   │   ├── remoteControlPage.ts    # The self-contained page a phone opens
│   │   ├── remoteProtocol.ts       # Pure validation of remote commands/state and of the token
│   │   ├── metadataCacheRepository.ts # Local library copy: tables and search
│   │   └── metadataCache.ts        # Local library copy: refresh job, mirroring of changes + IPC
│   │
│   └── preload/
│       └── contextBridge.ts        # Exposes window.api to renderer via contextBridge
│
├── scripts/
│   ├── ensureElectron.mjs          # postinstall: downloads fork binary if dist/ missing
│   ├── driveApp.mjs                # Dev helper: drives a running app over the DevTools Protocol
│   ├── runElectron.mjs             # dev/start: spawns electron-vite, Linux-only Chromium flags
│   └── packageApp.mjs              # package:*: fetches the target platform's Electron build, runs electron-builder
│
├── resources/
│   ├── icon.png                    # App icon (AppImage/deb, 2000×2000)
│   └── icon.ico                    # Built from icon.png: magick icon.png -define icon:auto-resize=256,128,64,48,32,24,16 icon.ico
│
└── src/                            # React renderer process
    ├── main.tsx
    ├── App.tsx                     # Router (react-router v8) + global error/session handling
    │
    ├── components/
    │   ├── layout/                 # AppShell, Sidebar, SidebarPlaylists
    │   ├── media/                  # MediaCard, MediaGrid, HorizontalScroll, ArtistCardLink, SortControl,
    │   │                           #   ZoomableImage (click-to-enlarge artwork viewer)
    │   ├── player/                 # PlayerBar, QueuePanel
    │   ├── settings/               # One component per Settings section (sync, remote, cache, TIDAL app, app data)
    │   ├── tracks/                 # TrackList, TrackContextMenu, AddToPlaylistsDialog, ArtistLinks
    │   └── ui/                     # shadcn/ui primitives
    │
    ├── hooks/                      # useTrackCollection, useTrackEnrichment, useMediaActions,
    │                               #   useTopPlayedTracks, useRemoteControlBridge, useAppliedTheme, ...
    ├── lib/                        # Pure helpers (queue order, play counter, engine events, text search,
    │                               #   library sort, preferences, theme...); `*.test.ts` next to the code
    ├── services/
    │   ├── tidalCatalogService.ts  # Calls window.api.* and wraps answers in Result
    │   └── playbackService.ts      # Commands + events of the playback engine (IPC `player:*`)
    │
    ├── store/                      # Zustand: playerStore, queueStore, sessionStore, likedStore, songsStore,
    │                               #   preferencesStore, playlistDialogStore, cacheStore
    ├── types/
    │   ├── global.d.ts             # window.api type declaration (source of truth for IPC)
    │   ├── player.ts               # Shared with the main process (engine, sync, remote, cache types)
    │   ├── auth.ts
    │   ├── media.ts
    │   └── track.ts
    │
    └── views/                      # Login, Home, Songs (liked), Search, Favorites, Library, Releases,
                                    #   Artist, MediaDetail (playlist/album/mix), Settings
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

npm run package:linux # Package Linux (.AppImage + .deb)
npm run package:win   # Package Windows: nsis installer on Windows (or Linux with Wine); portable .zip from Linux without Wine
```

Verification is `npm run verify`. Tests cover pure logic only; anything that needs the
Electron runtime, TIDAL or DRM is checked in the running app: start it with
`node scripts/runElectron.mjs dev --remote-debugging-port=9222` and drive it with
`scripts/driveApp.mjs` (or by hand). New pure
logic (parsers, stores, helpers) ships with a `*.test.ts` next to it.

### Building on a fresh machine (the "clone + npm install + npm start" promise)

1. Node 22+ (`.nvmrc` pins 22). On Windows with nvm: `nvm install 22 && nvm use 22`.
2. `npm install` — the `postinstall` downloads the Castlabs Electron binary for your OS
   from `github.com/castlabs/electron-releases`.
3. `npm run dev` — opens the window. Packaging goes through `scripts/packageApp.mjs`, which
   downloads the Castlabs build of the **target** platform into
   `node_modules/.cache/waves-electron/<platform>-<arch>` and points electron-builder at it, so
   Windows can be packaged from Linux (as a portable zip; the nsis installer needs Wine or Windows).

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
for `connect-src`/`img-src`/`media-src` (artwork comes from TIDAL's CDN). If
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

### Playback engine: TIDAL's web player in a hidden window (2026-11-15)
The only playback path is TIDAL's own web player (`https://tidal.com/`) loaded as-is in a hidden
`BrowserWindow` (`electron/main/tidalWebPlayer.ts`) on the `persist:tidal-web` partition, which it
shares with the sign-in window so it is already signed in.

**Why not the SDK:** with the first-party web session `@tidal-music/player` gets FULL manifests,
but TIDAL's audio CDN answers HTTP 403 (error 54113) to any origin other than `tidal.com`, and the
app does not fake `Origin`/`Referer`. tidal-hifi works the same way (it wraps the web player).

**How it is driven** (everything page-specific lives in `electron/main/tidalWebPlayerScript.ts`):
the page is a React + Redux app; the injected script finds its Redux store through the React root
and dispatches the page's own actions. Verified 2026-11-15:
- `content/FETCH_AND_PLAY_MEDIA_ITEM` `{ itemId, itemType: "track", sourceContext }` replaces the
  page's queue with one track and plays it (~0.4-1 s).
- `content/LOAD_SINGLE_MEDIA_ITEM` + `playQueue/ADD_NEXT` (after `playQueue/CLEAR_UPCOMING`) queue
  exactly one next track; the page then changes track by itself with no gap.
  (`content/FETCH_AND_QUEUE_MEDIA_ITEM` also works but leaves a stray extra item — not used.)
- `playbackControls/PLAY | PAUSE | SEEK (seconds) | SET_VOLUME ({ volume: 0-100 })`.
- `settings/SET_AUTOPLAY false` is forced: with autoplay on, the page appends a 100-track radio
  when its queue ends.
- State is read by polling `playbackControls` (state, `mediaProduct`, `playbackContext`) every
  500 ms. `latestCurrentTime` only syncs on events; the real position is that value plus the time
  since `latestCurrentTimeSyncTimestamp`. `mediaProduct.referenceId` is unique per playback.
- Right after it loads, the page restores the last track of its previous run; asked for that same
  track it loads it but stays paused, so the script dispatches `PLAY` explicitly.
- An unavailable track never reaches `content.mediaItems`; the page shows a notification instead.

**Division of work:** Waves owns the queue (`queueStore`). The web player only ever holds the
current track and the one after it. `src/services/playbackService.ts` sends commands over the
`player:*` IPC channels and turns the polled snapshots (`player:state` events) into
transition / state / ended events (`src/lib/engineEvents.ts`, pure and unit-tested) for
`playerStore`.

**Do not** change the engine window's user agent or fingerprint (same reason as the sign-in
window), and do not move playback back into the renderer. `WAVES_SHOW_ENGINE=1` shows the window
for debugging. When playback breaks after a TIDAL web update, re-verify the action names above
first (they can be listed by grepping the page's scripts for `"playQueue/…"` strings).

The `@tidal-music/*` SDK packages were removed (2026-11-16), together with the IPC that handed
tokens to the renderer for them.

### Sessions and what each one is for
Two sign-ins exist. The **Dashboard app token** (`auth.ts`, OAuth PKCE with the user's own client
id) is used for the v2 API (catalog, collection, playlists). The **first-party web session**
(`webSessionAuth.ts`, web client `49YxDN9a2aFV6RTG`; the older `listen.tidal.com` client
`CzET4vdadNUFQ5JU` is rejected by TIDAL since 2026-11) signs the `persist:tidal-web` partition in,
which is what lets the engine play FULL tracks. Without it nothing plays and the player shows
"Full playback is not connected".

### Play counts and smart shuffle
A play is counted once the listened time of a track passes the threshold (30 s by default,
adjustable in Settings; `src/lib/playCounter.ts`). Smart shuffle (`electron/main/smartShuffle.ts`,
on by default; Settings can switch to plain random) orders the queue by
`play_count + baseline_count` ascending, shuffled inside each level. `baseline_count` keeps new
tracks from monopolising the queue: when a list is first seen, its unknown tracks get the median
of the known ones (only if the known ones are at least as many as the new ones, otherwise 0); a
track first seen by a play gets the library median.

### Queue, shuffle and repeat
Waves owns the queue (`queueStore`, `src/lib/queueOrder.ts`): play order plus original order, so
shuffle can be undone. Repeat modes: `off | one-once | one | all` (`one-once` turns itself off
after its extra play). Volume, shuffle, repeat and the queue are restored on start.

### Turso sync (play counts only)
`tursoSync.ts` + pure rules in `playSync.ts`: full sync at start in the background and a push of
every counted play; per track the higher count and the later date win; failed pushes stay pending
and go out with the next sync. Without a database set (Settings, or `TURSO_*` in `.env`) it is off
and everything stays local.

### Phone remote
`remoteControl.ts` serves one self-contained page and a WebSocket on the local network, off until
enabled in Settings. The pairing token travels in the URL shown as a QR code; every request
without it is refused, and "Make a new code" invalidates paired phones. Commands are validated in
`remoteProtocol.ts` and executed by the renderer (`useRemoteControlBridge`), which also publishes
the state. The firewall may need the port opened.

### Local library copy (optional)
Off by default (Settings → "Local library copy"). When on, `metadataCache.ts` copies the liked
songs and every playlist at each start (and on demand) into the `cached_*` tables. Then the liked
list and playlists are served from it (`setLibraryHooks` in `catalog.ts`), "My collection" search
covers liked songs + playlists with play counts and playlist membership, and the add-to-playlists
dialog marks playlists that already hold the track. Changes made through the app are mirrored;
changes made in other TIDAL apps appear after the next refresh. With it off, collection search
covers the liked songs only. Only reference data is stored — never streams or licences.

### Favorites
`/favorites` is a virtual list: top N tracks by play count among those heard in the last X days
(50 / 30 by default, adjustable). Nothing is written to TIDAL.

### No separate backend server
Single-user personal app. The Electron main process replaces the backend entirely — it has
full OS access, HTTP, SQLite, WebSocket, and secure storage. No server to run or deploy.

### SQLite + Turso
SQLite is zero-config, co-located with the app. Turso provides the same SQLite dialect in
the cloud. No ORM — raw SQL preferred for clarity and control.

### Zustand + TanStack Query
Zustand for client state (player, queue, session): flat, synchronous, minimal boilerplate.
TanStack Query for server state (catalog): caching, deduplication, background refresh out of
the box.

### React Router v8
Declarative mode, flat route tree, **hash routes** (`HashRouter`): the packaged app is a `file://`
page, where a path-based URL points at the disk on reload and carries a drive letter on Windows. Current routes: `/` (Home), `/songs` (liked tracks),
`/search`, `/favorites`, `/library`, `/releases`, `/artists/:artistId`, `/settings`,
`/albums/:albumId`, `/playlists/:playlistId`, `/mixes/:mixType/:mixId`. The phone remote is not a
route: it is a separate page served by the main process.

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
- **Playback goes through TIDAL's web player** (hidden window, see "Playback engine"). Never
  fetch audio from TIDAL's CDN directly and never fake the request origin.
- **Personal use only.** Must not be distributed or made accessible to other users.
- **Widevine on Linux is L3 (software DRM).** For audio this imposes no quality restriction —
  Max quality (HiRes FLAC 24-bit/192kHz) is available. L3 restrictions apply to video
  resolution, not audio. Confirmed by tidal-hifi's production usage on Linux.
- **Always use TIDAL v2 API.** v1 rejects all modern tokens with 403/11004.
- **Always use `github:castlabs/electron-releases`.** Never replace it with the standard
  `electron` package — standard Electron does not bundle Widevine.
- **Turso free tier is sufficient** for a single-user play count database.