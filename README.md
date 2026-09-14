# Waves Desktop

Self-hosted music player for TIDAL, built with Electron (Castlabs fork for
Widevine DRM), React, and TypeScript.

## Requirements

- Node.js 22+ (Node 26 recommended)
- The Castlabs Electron fork (`@castlabs/electron-releases`) installs the
  Widevine CDM automatically on first launch.

## Development

```bash
# Install dependencies (downloads the Castlabs Electron binary)
npm install

# Configure environment
cp .env.example .env   # if present; otherwise create .env from AGENTS.md

# Start in development mode (hot reload, opens the Electron window)
npm run dev

# Type-check TypeScript without emitting
npm run typecheck

# Build all processes (main + preload + renderer)
npm run build

# Package for Linux (.AppImage + .deb)
npm run package:linux

# Package for Windows (.exe installer)
npm run package:win
```

See `AGENTS.md` for the full architecture, migration plan, and conventions.