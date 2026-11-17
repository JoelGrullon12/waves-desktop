# Waves Desktop

A desktop player for **TIDAL** built with Electron, React, and TypeScript. Privately
authenticated, ad-free: search, albums, playlists, and playback of **full-length** tracks (not
previews) using your paid subscription.

## What it does

- Full-length playback (up to Max quality) through TIDAL's own web player, which runs in a
  hidden window; Waves owns the queue and the interface.
- Home, library (playlists, albums, artists — sortable), releases feed, artist pages, liked
  songs, search on TIDAL or inside your own collection.
- Queue with shuffle, repeat (off / once / track / all), drag and drop reordering and "Place next
  in queue", restored when the app starts; "Playing from …" links back to the playlist or album.
- **Now playing** panel: large artwork, every artist, play count, the playlists holding the track,
  credits and **synced lyrics** (click a line to jump to it).
- Like / unlike, add to several playlists at once, create, edit (name, description) and delete
  playlists; search inside a playlist or album; album credits.
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
web player as it is in a hidden window, signed in with your own account (*Settings → Playback
session → Connect playback*), and tells it what to play. Nothing is downloaded and no request is disguised;
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
- Linux: Wayland/X11. On Linux the app launches with `--no-sandbox --in-process-gpu --no-zygote`,
  applied automatically by `scripts/runElectron.mjs` and by the packaged builds (those flags are
  Linux-only and are not passed on Windows).
- **Windows only:** Python 3 and a free castlabs EVS account to VMP-sign Electron; without it
  nothing sounds (see [Windows only: VMP signing](#windows-only-vmp-signing-with-castlabs-evs)).
  Linux needs nothing of this.
- A paid (subscribed) TIDAL account for full-length playback.
- For the Dashboard login: a client id and secret from an app created in the
  [TIDAL Dashboard](https://developer.tidal.com/dashboard) (asked on first launch; `.env` in development).

## Getting started

```bash
npm install        # postinstall downloads the Castlabs Electron binary for your OS automatically
cp .env.example .env   # optional (Windows: copy .env.example .env); without it the app asks in Settings
npm run vmp:sign   # Windows only, once per Electron install (see the VMP section below)
npm run dev        # opens the app window
```

`npm install` is plug-and-play on every OS: the `postinstall` hook
(`scripts/ensureElectron.mjs`) runs the Electron fork's own installer when the binary is missing,
so no manual download step is needed.

### Environment variables (`.env`)

Development only: a packaged build is configured from *Settings* and keeps everything in its data
folder (`settings.ini`, the database and an encrypted secrets file; *Settings → App data* shows
and moves it). Values set in `.env` win over the saved ones. Never commit `.env`:

| Variable | Required | Purpose |
|---|---|---|
| `TIDAL_CLIENT_ID` | No (dev override) | TIDAL Dashboard app; a packaged build asks for it on first launch |
| `TIDAL_CLIENT_SECRET` | No (dev override) | TIDAL Dashboard app secret |
| `TIDAL_REDIRECT_URI` | No | Dashboard login callback (default `http://127.0.0.1:8899/tidal-callback`; loopback http with port and path) |
| `TURSO_DATABASE_URL` | No (dev override) | Turso cloud DB for cross-device play-count sync |
| `TURSO_AUTH_TOKEN` | No | Turso auth token |
| `REMOTE_CONTROL_WEBSOCKET_PORT` | No | Mobile remote-control WebSocket port (default `47836`) |
| `LOCAL_SQLITE_PATH` | No | Override SQLite path (defaults to the data folder) |

> Register the redirect URI `http://127.0.0.1:8899/tidal-callback` in the Dashboard (or the one set
> in `TIDAL_REDIRECT_URI`; a packaged build always uses the default).
> TIDAL scopes to enable in the Dashboard: `user.read`, `collection.read`, `collection.write`,
> `playlists.read`, `playlists.write`, `playback`, `search.read`. If the scopes change, log out
> and in once to re-mint the tokens.

### Initial flow (first run)

1. **TIDAL app credentials**: without `.env` the app asks for the Dashboard client id and secret
   once and keeps them encrypted in its data folder (editable in *Settings → TIDAL app*).
2. **Login (Dashboard)**: press "Login" → your browser opens → you come back authenticated.
3. **Full playback**: *Settings → Playback session → Connect playback* → sign in to TIDAL in the
   window that opens; it closes by itself once signed in. Lyrics and credits use this session too.
4. **Widevine**: the DRM module is downloaded on the first launch and is ready from the second
   one (see `AGENTS.md`, "How Widevine is delivered"). On Windows the build must also be
   VMP-signed (see below).
5. Optional, all in *Settings*: phone remote, local library copy, play threshold, shuffle mode,
   Favorites size, *Play count sync* (Turso), TIDAL credentials, *App data* (data folder) and
   *Account* (log out).

If something misbehaves, read `logs/main.log` in the data folder (*Settings → App data → Open
folder*): it records failed loads, crashed processes and the state of every playback.

## Packaging & distribution

Packaging uses [`electron-builder`](https://www.electron.build) configured in
`electron-builder.yml`, run through `scripts/packageApp.mjs`. The script downloads the Castlabs
Electron build of the **target** platform (cached in `node_modules/.cache/waves-electron/`) and
points electron-builder at it, so packaging never uses the standard Electron releases.

```bash
npm run package:linux   # → dist/Waves Desktop-*.AppImage, dist/waves-desktop_*_amd64.deb
npm run package:win     # on Windows (or Linux with Wine) → VMP-signed nsis installer
                        # on Linux without Wine → dist/Waves Desktop-*-win.zip (portable)
```

Artifacts land in `dist/` (gitignored). Icons live in `resources/` (`icon.png` for Linux,
`icon.ico` for Windows).

### Windows only: VMP signing with castlabs EVS

> **This step is only for Windows.** On Linux there is no VMP check: `npm run dev`,
> `npm run package:linux`, the AppImage and the .deb play without any signing.

On Windows, TIDAL's license server only grants Widevine licenses to an Electron build carrying a
production **VMP signature** (Verified Media Path). The Castlabs build ships with a development
signature only, so without re-signing a track loads but never sounds (the web player reports
`PlaybackError: S6007`; the server answers `ACCESS_DENIED, vmp: null`). Castlabs signs builds for
free through its **EVS** service.

**1. Create the EVS account (once per person).** Python 3 is needed; the tool is not an npm
dependency.

```powershell
python -m pip install --upgrade castlabs-evs
python -m castlabs_evs.account signup     # asks for name, email and password, then a code sent by email
```

On any other machine (or when the session expires and signing fails), log in again with the same
account instead of signing up:

```powershell
python -m castlabs_evs.account reauth
```

**2. Sign the development build** (needed for sound in `npm run dev` on Windows):

```powershell
npm run vmp:sign      # signs node_modules/electron/dist
```

Repeat it whenever the Electron binary is reinstalled (fresh clone, `node_modules` deleted,
Electron upgraded).

**3. Package.** `npm run package:win` signs the packaged app automatically (`scripts/vmpSign.mjs`
is electron-builder's `afterSign` hook, so it runs after any Authenticode signing and before the
installer is built). If EVS is not installed the command fails with these instructions;
`WAVES_SKIP_VMP=1` packages without signing, but that build will not play on Windows.

The signature travels inside the package (`Waves Desktop.exe.sig` next to the executable), so a
signed installer works on **any** Windows PC: Python and the EVS account are only needed on the
machine that builds it. Every new build is signed again by the hook.

## Structure

```
electron/main/    auth, webSessionAuth, tidalWebPlayer (engine), catalog, database, play counts,
                  smart shuffle, Turso sync, phone remote, local library copy
electron/preload/ contextBridge → window.api
src/store/        Zustand stores (player, queue, session, liked, preferences, cache)
src/services/     playbackService (engine commands/events), tidalCatalogService
src/views/        Login, Home, Songs, Search, Favorites, Library, Releases, Artist, MediaDetail, Settings
src/components/   layout, media, player, settings, tracks, ui
scripts/          ensureElectron, runElectron, packageApp, vmpSign, driveApp
resources/        App icons
```

Architecture details, decisions, and known pitfalls: [AGENTS.md](./AGENTS.md).
Product roadmap and phases: [ROADMAP.md](./ROADMAP.md).

## Legal notice

A personal project for learning purposes. Waves is not an official TIDAL product. Playback uses
the authenticated session of your own paid account. It does not ship downloaded content or share
credentials.