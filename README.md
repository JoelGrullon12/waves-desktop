# Waves Desktop

A desktop player for **TIDAL** built with Electron, React, and TypeScript. Privately
authenticated, ad-free: search, albums, playlists, and playback of **full-length** tracks (not
previews) using your paid subscription.

## Project status (current phase)

The app plays TIDAL tracks **without the 30-second cap** (verified 2026-09-14): progress bar,
previous/next, search, volume, and queueing. The preview cause (server-side cut by TIDAL based
on the developer app's tier) was solved by connecting a **first-party web session** from
TIDAL's web player and using it in the official SDK's playback engine.

Currently working:

- OAuth PKCE login against TIDAL (Dashboard) with encrypted token storage.
- First-party web session (`listen.tidal.com`) for **FULL playback**.
- Track search plus library, album, and playlist views.
- **Songs (liked tracks)** screen with cursor-based infinite scroll and full-library
  shuffle/play — partially functional: the context-menu actions and like hearts are still
  UI no-ops (covered by **Phase 3** of the roadmap).
- Player with progress bar, play/pause, previous/next, queue, and volume (Widevine).

See [ROADMAP.md](./ROADMAP.md) for the complete product roadmap. Current focus: **Phase 3 —
a complete subscription-style player** (home/library overview, release feed, artist profiles,
dynamic queue with shuffle/repeat, functional context menu, visual settings, and search within
your collection), which lands before the special features (smart shuffle, sync, remote, etc.).

## How full playback works

The official TIDAL SDK (`@tidal-music/player`) requests the manifest at
`/v2/trackManifests/{id}`, and TIDAL decides `FULL` or `PREVIEW` **on the server side**, based on
who owns the token. The developer Dashboard app token only ever gets previews; a **first-party web
session** (the same PKCE flow as the web player, client `CzET4vdadNUFQ5JU`) belongs to your
subscribed account and serves `FULL` assets.

Waves combines both:

- The SDK's `CredentialsProvider` picks the token: the web session when connected, the Dashboard
  token otherwise. Because the SDK requests credentials on every `load`, connecting the session is
  enough — no re-initialization required.
- No embedded windows for the web login: `login.tidal.com/authorize` opens in your system browser,
  and you paste the `code` back into the app. (A `BrowserWindow` loading TIDAL's SPA crashes in
  this environment — see `AGENTS.md`.)

> ⚠️ The web session is first-party to TIDAL. Use it with your own account. This is the same
> pattern community players such as tidal-hifi use. See the note in `AGENTS.md`.

## Stack

- **Electron** (fork [castlabs `#v44.1.0+wvcus`](https://github.com/castlabs/electron-releases))
  for Widevine DRM.
- **React 19 + TypeScript + Tailwind CSS 4** (base-ui/shadcn) and Vite (electron-vite).
- **@tidal-music/player** (TIDAL web SDK) for playback (shaka/browser).
- **zustand** (state), **@tanstack/react-query** (data), **node:sqlite** (local DB),
  **libSQL/Turso** (cloud sync, planned), **safeStorage** for token encryption.

## Requirements

- **Node.js ≥ 22.12** and npm (`.nvmrc` pins 22). Node 16/18 do **not** work: the Castlabs
  Electron fork, `vite`, `electron-vite`, and Tailwind's native `oxide` binding all require
  Node ≥ 20/22 (Tailwind >= 20, the rest >= 22.12).
  - With [nvm](https://github.com/nvm-sh/nvm) on Windows: `nvm install 22 && nvm use 22`.
- Linux: Wayland/X11. On Linux the app launches with `--no-sandbox --in-process-gpu`, applied
  automatically by `scripts/runElectron.mjs` (those flags are Linux-only and are not passed on
  Windows).
- A paid (subscribed) TIDAL account for full-length playback.
- For the Dashboard login: `TIDAL_CLIENT_ID` and `TIDAL_CLIENT_SECRET` from an app created in the
  [TIDAL Dashboard](https://developer.tidal.com/dashboard) (`.env` file — see below).

## Getting started

```bash
npm install   # postinstall downloads the Castlabs Electron binary for your OS automatically
cp .env.example .env
npm run dev   # opens the app window
```

`npm install` is plug-and-play on every OS: the `postinstall` hook
(`scripts/ensureElectron.mjs`) runs the Electron fork's own installer when the binary is missing,
so no manual download step is needed.

### Environment variables (`.env`)

Create `.env` from `.env.example` and fill in the values (never commit `.env`):

| Variable | Required | Purpose |
|---|---|---|
| `TIDAL_CLIENT_ID` | Yes | TIDAL Dashboard app (OAuth PKCE) |
| `TIDAL_CLIENT_SECRET` | Yes | TIDAL Dashboard app secret |
| `TIDAL_REDIRECT_URI` | Yes (register it) | `http://127.0.0.1:8899/tidal-callback` — must match the Dashboard exactly |
| `TURSO_DATABASE_URL` | No | Turso cloud DB for cross-device play-count sync |
| `TURSO_AUTH_TOKEN` | No | Turso auth token |
| `REMOTE_CONTROL_WEBSOCKET_PORT` | No | Mobile remote-control WebSocket port (default `47836`) |
| `LOCAL_SQLITE_PATH` | No | Override SQLite path (defaults to Electron's user-data dir) |

> TIDAL scopes to enable in the Dashboard: `user.read`, `collection.read`, `collection.write`,
> `playlists.read`, `playlists.write`, `playback`, `search.read`. If the redirect URI or scopes
> change, re-create the `.env` and log out/in once to re-mint tokens.

### Initial flow (first run)

1. **Login (Dashboard)**: press "Login" → your browser opens → you come back authenticated.
2. **Full playback**: in *Your Library* → *Connect full playback* → sign in to TIDAL in your
   browser → copy the `code` from `https://listen.tidal.com/login/auth?code=...` → *Complete*.
   The app stores it encrypted and refreshes the token automatically (~24 h).
3. **Widevine (Linux only)**: the Castlabs Component Updater can fail to auto-install the Widevine
   CDM in some environments. If `navigator.requestMediaKeySystemAccess('com.widevine.alpha')`
   rejects, copy an existing CDM into the app's user-data dir (`~/.config/waves-desktop/WidevineCdm/…`)
   — full steps in `Agents.md` ("How Widevine is delivered").

## Scripts

| Command | What it does |
|---|---|
| `npm install` | Installs deps; `postinstall` downloads the Electron fork binary |
| `npm run dev` | Development (hot reload) — Linux flags applied automatically |
| `npm start` | Preview the production build |
| `npm run typecheck` | TypeScript (node + renderer) |
| `npm run build` | Build main + preload + renderer |
| `npm run package:linux` | Package Linux (`.AppImage` + `.deb`) — run on Linux |
| `npm run package:win` | Package Windows (`.exe`, nsis) — run on Windows |

## Packaging & distribution

Packaging uses [`electron-builder`](https://www.electron.build) configured in
`electron-builder.yml`. The key setting is `electronDist: node_modules/electron/dist`: it copies
the already-downloaded Castlabs fork binary (which bundles Widevine), so packaging **never
downloads Electron from the standard repository**. Before this setting existed, `electron-builder`
tried to resolve `v44.1.0+wvcus` against `github.com/electron/electron` and failed with a 404.

Build **on the OS you are targeting** (the local `node_modules/electron/dist` is single-platform,
and Windows NSIS builds need tooling that is not available on Linux by default):

```bash
# On Linux
npm run package:linux   # → dist/Waves Desktop-*.AppImage, dist/waves-desktop_*_amd64.deb

# On Windows
npm run package:win     # → dist/Waves Desktop-Setup-*.exe
```

Artifacts land in `dist/` (gitignored). Icons live in `resources/` (`icon.png` for Linux,
`icon.ico` for Windows) — currently placeholders, replace them with real branding when ready.

## Structure

```
electron/main/    auth (Dashboard), webSessionAuth (FULL web session), catalog, database
electron/preload/ contextBridge → window.api
src/store/        sessionStore, playerStore (wraps the SDK), queueStore, songsStore
src/services/     playbackService (SDK wrapper)
src/views/        LoginView, LibraryView, SongsView (liked), SearchView, AlbumView, PlaylistView
src/components/   PlayerBar, QueuePanel, AppShell, TrackList, ui/*
scripts/          ensureElectron.mjs (postinstall binary download), runElectron.mjs (dev/start)
electron-builder.yml   Packaging config (electronDist → Castlabs fork)
resources/        App icons (placeholders)
```

Architecture details, decisions, and known pitfalls: [AGENTS.md](./AGENTS.md).
Product roadmap and phases: [ROADMAP.md](./ROADMAP.md).

## Legal notice

A personal project for learning purposes. Waves is not an official TIDAL product. Playback uses
the authenticated session of your own paid account. It does not ship downloaded content or share
credentials.