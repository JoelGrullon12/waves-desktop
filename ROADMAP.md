# ROADMAP — Waves Desktop

> Fases de producto y features planeadas. El estado operativo diario vive en
> `.opencode/plans/` (`session-handoff-active.md` para la sesión actual, `history/`
> para las cerradas). Decisiones estructurales y restricciones → `Agents.md`.
>
> **La Fase 3 se completa ANTES que las features especiales (4-8):** el objetivo es
> un reproductor de suscripción completo antes de añadir nada más.

Última actualización: 2026-09-15 · Leyenda: ✅ completada · 🔄 en proceso · ⏳ planeada

## Completadas

- **Phase 0 — Environment Setup ✅** — React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui.
- **Phase 1 — TIDAL Authentication ✅** — OAuth PKCE, fixed redirect URI, `safeStorage` token
  storage, auto-refresh, logout.
- **Phase 2 — Functional Player MVP ✅** — TIDAL Web SDK, Zustand stores, v2 API catalog proxy,
  full player UI, Media Session API.
- **Phase M — Electron Migration ✅** — Tauri v2 → Electron (Castlabs fork). Milestone logrado:
  login + reproducción completa con audio + empaquetado en Linux.

## Phase 3 — Reproductor completo con funciones tradicionales 🔄

> Se completa antes de las fases 4-8. Varios pendientes actuales (no-ops del menú
> contextual, likes decorativos, shuffle one-shot, ausencia de repeat) son work items
> de esta fase — el detalle diario está en `.opencode/plans/session-handoff-active.md`.

Reproductor de música por suscripción completo, con el mismo conjunto de funciones de
cualquier reproductor tradicional:

1. **Home / resumen de la biblioteca** — pantalla principal con un resumen de la biblioteca
   del usuario (reemplaza el actual "Your collection is coming soon" en `LibraryView`).
2. **Feed de lanzamientos** — últimos lanzamientos de artistas seguidos (v2 API).
3. **Colección del usuario** — lista de playlists, carpetas y música del usuario.
4. **Perfiles y vistas** — perfiles de artistas (`ArtistView`, hoy no existe), álbumes
   (`AlbumView` ✓), playlists (`PlaylistView` ✓).
5. **Reproductor tradicional** — shuffle y **cola dinámica**, **repetición** de canciones
   (estado persistente; hoy el shuffle es one-shot y no hay repeat).
6. **Click derecho + enlaces** — `TrackContextMenu` funcional conectado a `collection.write`
   (Play next, Add to queue, Add to playlist, Remove from library, Go to album/artist) +
   enlaces clicables en nombres y títulos. Incluye **like/unlike** de la biblioteca.
7. **Ajustes visuales** — mejor manejo del espacio, **modo oscuro**, pantalla de
   configuración, reordenamiento de componentes, responsive/adaptable.
8. **Búsqueda en biblioteca personal** — buscar dentro de la colección del usuario (además
   del search global de TIDAL ya existente en `SearchView`).

## Phase 4 — Smart Shuffle + Local Stats ⏳ (4-5 días)

*Antes: Phase 3 (renumerada).*

- `playCountRepository.ts`: incrementar play count cuando un track pasa los 30 s de
  reproducción — usar el evento `media-product-transition` del SDK como señal, no el inicio
  del track.
- `smartShuffle.ts` — algoritmo:
  1. Consultar play counts de todos los ids del contexto actual.
  2. Tracks sin registro → play count 0 (máxima prioridad).
  3. Agrupar en buckets por play count.
  4. Shuffle aleatorio dentro de cada bucket (evita el feel robótico y balancea plays).
  5. Concatenar buckets de menor a mayor play count.
  6. Devolver la lista ordenada al renderer como la nueva cola.
- El threshold de 30 s se guarda en `user_preferences` y es ajustable.
- Re-agregar los IPC `stats:*` (`incrementPlayCount`, `getSmartShuffleQueue`).

## Phase 5 — Cloud Sync con Turso ⏳ (2-3 días)

*Antes: Phase 4 (renumerada).*

- Crear una base Turso (free tier suficiente para un solo usuario).
- `tursoSync.ts`: al arrancar, pull de filas remotas a local; en cada write de play count,
  también a Turso. Sin resolución de conflictos — last write wins.
- Requiere `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en `.env`.

## Phase 6 — Mobile Remote Control ⏳ (3-4 días)

*Antes: Phase 5 (renumerada).*

- `remoteControl.ts`: servidor `ws` en `REMOTE_CONTROL_WEBSOCKET_PORT`.
- `MobileRemoteView.tsx`: ruta `/remote` — el teléfono abre el PWA en su navegador, sin
  instalar nada.
- Código QR generado in-app con la IP local + puerto WebSocket; el teléfono escanea para
  emparejar.
- Eventos: `play`, `pause`, `next`, `previous`, `set_volume`, `state_sync` (push de track,
  artwork URL, progreso, volumen en cada cambio de estado).

## Phase 7 — Global Playlist & Favorites ⏳ (3-4 días)

*Antes: Phase 6 (renumerada).*

- Global playlist: unión de todos los liked tracks + tracks de todas las playlists,
  deduplicada por id. Computada on-demand desde la v2 API.
- Favorites playlist: top N por `play_count` con `last_played_at` en los últimos 30 días
  (ventana configurable en `user_preferences`). Computada desde SQLite local — sin API.
- Ambas son virtuales — nunca se escriben de vuelta a TIDAL.

## Phase 8 — Cache local de metadata ⏳ (opcional, EXTRA)

*Antes: Phase 7 (renumerada).*

> Feature opcional por usuario/playlist para cortar requests al cargar listas. Motivación:
> con bibliotecas grandes el wait crece — cada apertura re-fetchea las listas de
> liked/playlist desde TIDAL antes de poder reproducir.

- Guardar SOLO datos referenciales en el SQLite existente (`node:sqlite`): track ids,
  títulos, artista/álbum, duraciones, artwork hrefs. Nunca stream URLs ni licensing data —
  esos siempre vienen de TIDAL al reproducir.
- Fuentes a cachear: liked tracks y playlists.
- **Opt-in por usuario y por playlist** (en `user_preferences`).
- Comportamiento: con el cache activo, las aperturas cargan desde SQLite (rápido, sin red);
  Play/Shuffle mandan la MISMA metadata al SDK — cambia solo el origen de la lista.
  Invalidación/refresh es una decisión a tomar (p. ej. refresh manual).
- Piezas existentes que apoyan esto: el walk de páginas + enrichment podría pasar a un job
  background de "refresh cache"; `songsStore.enrichedById` y `getTracksByIds` se mantienen
  para el streaming de metadata completa al reproducir.
- No conectado a nada aún — solo diseño.

## Backlog / ideas sin fase

- **Plan B de reproducción:** `web-auth:get-playback-stream` ya consulta
  `playbackinfopostpaywall/v4` (audioquality=LOSSLESS, assetpresentation=FULL, patrón de
  hifi-api). Solo como alternativa si TIDAL cambia v2 o revoca scopes. No implementado.
- **`desktopName` + `linux.syncDesktopName: true`** en electron-builder (asociar la ventana
  al .desktop; aviso no bloqueante en el empaquetado).
- **Pull-to-refresh / refetch por tiempo** de la colección (puede subsumirse en la Fase 3).
- **Validación en la W11 (pendiente de usuario):** `npm install` + `npm run dev` +
  `npm run package:win` — detalle en `.opencode/plans/session-handoff-active.md`.