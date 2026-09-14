# Waves Desktop

A desktop player for **TIDAL** built with Electron, React, and TypeScript. Privately
authenticated, ad-free: search, albums, playlists, and playback of **full-length** tracks (not
previews) using your paid subscription.

## Project status (current phase)

**Phase 3 — Full-length playback unlocked (verified 2026-09-14).** The app plays TIDAL tracks
**without the 30-second cap**: progress bar, previous/next, search, volume, and queueing. The
preview cause (server-side cut by TIDAL based on the developer app's tier) was solved by
connecting a **first-party web session** from TIDAL's web player and using it in the official
SDK's playback engine.

Currently working:

- OAuth PKCE login against TIDAL (Dashboard) with encrypted token storage.
- First-party web session (`listen.tidal.com`) for **FULL playback**.
- Track search plus library, album, and playlist views.
- Player with progress bar, play/pause, previous/next, queue, and volume (Widevine).

Roadmap (upcoming phases):

- Real library (saved albums, favorites, personal playlists) — currently "coming soon".
- Artwork states, OS media controls (Media Session), and more views.
- Linux/Windows packaging (`package:linux` / `package:win` ready).

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
- **zustand** (state), **@tanstack/react-query** (data), **libSQL** (local catalog),
  **safeStorage** for token encryption.

## Requirements

- Node.js 20+ and npm.
- Linux: Wayland/X11. On Linux the app runs with `--no-sandbox --in-process-gpu`.
- A paid (subscribed) TIDAL account for full-length playback.
- For the Dashboard login: `TIDAL_CLIENT_ID` and `TIDAL_CLIENT_SECRET` from an app created in the
  [TIDAL Dashboard](https://developer.tidal.com/dashboard) (`.env` file).

## Getting started

```bash
npm install
# create .env with TIDAL_CLIENT_ID / TIDAL_CLIENT_SECRET (Dashboard login)
npm run dev
```

Initial flow:

1. **Login (Dashboard)**: press "Login" → your browser opens → you come back authenticated.
2. **Full playback**: in *Your Library* → *Connect full playback* → sign in to TIDAL in your
   browser → copy the `code` from `https://listen.tidal.com/login/auth?code=...` → *Complete*.
   The app stores it encrypted and refreshes the token automatically (~24 h).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development |
| `npm run typecheck` | TypeScript (node + renderer) |
| `npm run build` | Build main + preload + renderer |
| `npm run package:linux` | Package AppImage/deb for Linux |
| `npm run package:win` | Package for Windows |

## Structure

```
electron/main/    auth (Dashboard), webSessionAuth (FULL web session), catalog, database
electron/preload/ contextBridge → window.api
src/store/        sessionStore, playerStore (wraps the SDK), queueStore
src/services/     playbackService (SDK wrapper)
src/views/        LoginView, LibraryView, SearchView, AlbumView, PlaylistView
src/components/   PlayerBar, QueuePanel, AppShell, TrackList, ui/*
```

Architecture details, decisions, and known pitfalls: [AGENTS.md](./AGENTS.md).

## Legal notice

A personal project for learning purposes. Waves is not an official TIDAL product. Playback uses
the authenticated session of your own paid account. It does not ship downloaded content or share
credentials.