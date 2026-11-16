# Waves Desktop

A desktop player for **TIDAL** built with Electron, React, and TypeScript. Privately
authenticated, ad-free: search, albums, playlists, and playback of **full-length** tracks (not
previews) using your paid subscription.

## What it does

- Full-length playback (up to Max quality) through TIDAL's own web player, which runs in a
  hidden window; Waves owns the queue and the interface.
- Home, library (playlists, albums, artists — sortable), releases feed, artist pages, liked
  songs, search on TIDAL or inside your own collection.
- Queue with shuffle, repeat (off / once / track / all), restored when the app starts.
- Like / unlike, add to several playlists at once, create and delete playlists.
- **Play counts** kept locally and **smart shuffle** that plays the least heard tracks first.
- **Favorites**: your most played tracks of the last days.
- Optional **Turso sync** of the play counts across devices.
- Optional **phone remote**: scan a QR code and control playback from the phone's browser.
- Optional **local library copy** for instant lists and a collection search that also covers
  your playlists.
- Light / dark / system theme.

See [ROADMAP.md](./ROADMAP.md) for the history of the phases.

## How full playback works

TIDAL's audio CDN only serves full tracks to pages on `tidal.com`. Waves therefore loads TIDAL's
web player as it is in a hidden window, signed in with your own account (Settings → *Connect
full playback*), and tells it what to play. Nothing is downloaded and no request is disguised;
this is the same approach community players such as tidal-hifi use. Details in `AGENTS.md`
("Playback engine").

Two sign-ins exist: the **Dashboard app** (your own client id, used for the catalog API) and the
**web session** (used by the playback engine).

## Stack

- **Electron** (fork [castlabs `#v44.1.0+wvcus`](https://github.com/castlabs/electron-releases))
  for Widevine DRM.
- **React 19 + TypeScript + Tailwind CSS 4** (base-ui/shadcn) and Vite (electron-vite).
- **TIDAL's web player** in a hidden window for playback.
- **zustand** (state), **@tanstack/react-query** (data), **node:sqlite** (local DB),
  **libSQL/Turso** (optional cloud sync), **ws** (phone remote), **safeStorage** for token encryption.

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
| `TIDAL_CLIENT_ID` | No (dev override) | TIDAL Dashboard app; a packaged build asks for it on first launch |
| `TIDAL_CLIENT_SECRET` | No (dev override) | TIDAL Dashboard app secret |
| `TURSO_DATABASE_URL` | No | Turso cloud DB for cross-device play-count sync |
| `TURSO_AUTH_TOKEN` | No | Turso auth token |
| `REMOTE_CONTROL_WEBSOCKET_PORT` | No | Mobile remote-control WebSocket port (default `47836`) |
| `LOCAL_SQLITE_PATH` | No | Override SQLite path (defaults to Electron's user-data dir) |

> Register the redirect URI `http://127.0.0.1:8899/tidal-callback` in the Dashboard.
> TIDAL scopes to enable in the Dashboard: `user.read`, `collection.read`, `collection.write`,
> `playlists.read`, `playlists.write`, `playback`, `search.read`. If the redirect URI or scopes
> change, re-create the `.env` and log out/in once to re-mint tokens.

### Initial flow (first run)

1. **Login (Dashboard)**: press "Login" → your browser opens → you come back authenticated.
2. **Full playback**: in *Settings* → *Connect full playback* → sign in to TIDAL in the window
   that opens; it closes by itself once signed in.
3. **Widevine**: the DRM module is downloaded on the first launch and is ready from the second
   one (see `AGENTS.md`, "How Widevine is delivered").
4. Optional, all in *Settings*: phone remote, local library copy, play threshold, shuffle mode,
   Favorites size. Turso sync is configured in `.env`.

## Packaging & distribution

Packaging uses [`electron-builder`](https://www.electron.build) configured in
`electron-builder.yml`, run through `scripts/packageApp.mjs`. The script downloads the Castlabs
Electron build of the **target** platform (cached in `node_modules/.cache/waves-electron/`) and
points electron-builder at it, so packaging never uses the standard Electron releases.

```bash
npm run package:linux   # → dist/Waves Desktop-*.AppImage, dist/waves-desktop_*_amd64.deb
npm run package:win     # on Windows (or Linux with Wine) → nsis installer
                        # on Linux without Wine → dist/Waves Desktop-*-win.zip (portable)
```

Artifacts land in `dist/` (gitignored). Icons live in `resources/` (`icon.png` for Linux,
`icon.ico` for Windows) — currently placeholders, replace them with real branding when ready.

## Structure

```
electron/main/    auth, webSessionAuth, tidalWebPlayer (engine), catalog, database, play counts,
                  smart shuffle, Turso sync, phone remote, local library copy
electron/preload/ contextBridge → window.api
src/store/        Zustand stores (player, queue, session, liked, preferences, cache)
src/services/     playbackService (engine commands/events), tidalCatalogService
src/views/        Login, Home, Songs, Search, Favorites, Library, Releases, Artist, MediaDetail, Settings
src/components/   layout, media, player, settings, tracks, ui
scripts/          ensureElectron, runElectron, packageApp, driveApp
resources/        App icons (placeholders)
```

Architecture details, decisions, and known pitfalls: [AGENTS.md](./AGENTS.md).
Product roadmap and phases: [ROADMAP.md](./ROADMAP.md).

## Legal notice

A personal project for learning purposes. Waves is not an official TIDAL product. Playback uses
the authenticated session of your own paid account. It does not ship downloaded content or share
credentials.