# Sesion actual

## Objetivo
Terminar el reproductor de principio a fin en la rama `fable-dev` (**`main` no se toca**): Phase R, resto de Phase 3 y fases 4-8 de `ROADMAP.md`. Claude desarrolla, prueba y da por buena cada fase por su cuenta (sin `/flujo`).
Criterio: cada fase con `npm run verify` verde + prueba real en la app; un commit por fase y `git push origin fable-dev`.

## Plan
Prefijo de comandos: `source ~/.nvm/nvm.sh && nvm exec 22 <cmd>`.
Pruebas reales: app lanzada con puerto de depuración y manejada por CDP (`scripts/driveApp.mjs`); `LOCAL_SQLITE_PATH` a una base de pruebas para no ensuciar los conteos reales.
- [x] **R — Motor web:** `electron/main/tidalWebPlayer.ts` (ventana oculta `tidal.com`, partición `persist:tidal-web`), IPC `player:*` + evento de estado, `playbackService`/`playerStore` sobre el motor; avance de cola al terminar cada canción.
- [ ] **3A — Reproductor + menú + likes:** shuffle/repeat persistentes (repeat: off → canción 1 vez → canción infinita → playlist), cola dinámica (play next / add to queue), escrituras v2 (like/unlike, añadir a playlists, crear playlist), `TrackContextMenu` funcional, `AddToPlaylistsDialog` (checkboxes + "Agregar"), enlaces a álbum/artista.
- [ ] **3B — Navegación y biblioteca:** `ArtistView`, `LibraryView` (playlists, carpetas, álbumes, artistas), feed de lanzamientos, `SearchView` con switch TIDAL/Colección, tema claro/oscuro/sistema, Ajustes ampliados, layout adaptable.
- [ ] **4 — Smart shuffle + stats:** `baseline_count`, `playCountRepository.ts`, `smartShuffle.ts`, conteo al pasar el umbral (30 s), IPC `stats:*`, Most Listened en Home.
- [ ] **5 — Turso:** `tursoSync.ts` (pull al arrancar, push por incremento, reintentos).
- [ ] **7 — Favorites:** playlist virtual `/favorites` (top N en ventana de días, configurable).
- [ ] **6 — Control remoto:** `remoteControl.ts` (`node:http` + `ws`, token de emparejamiento), página remota, QR en Ajustes (`qrcode-generator`).
- [ ] **8 — Cache de metadata:** tablas `cached_*`, `metadataCache.ts`, interruptor global, refresco en segundo plano, búsqueda en colección con conteo y playlists.
- [ ] **Cierre:** decidir SDK, docs (`AGENTS.md`, `ROADMAP.md`, `README.md`, `.env.example`), `npm run package:linux`, archivar esta sesión.

## Preguntas abiertas
Ninguna (todas respondidas el 2026-11-15, ver Decisiones).

## Hecho
- **Phase R (2026-11-15):** motor de reproducción = reproductor web de TIDAL en ventana oculta. `electron/main/tidalWebPlayer.ts` (ventana, sondeo cada 500 ms, IPC `player:*`), `tidalWebPlayerScript.ts` (script inyectado: encuentra el store Redux de la página y despacha sus acciones), `src/types/player.ts`, `src/lib/engineEvents.ts` (+tests), `playbackService.ts` y `playerStore.ts` reescritos sobre el motor; se quitó el uso del SDK (`src/lib/mediaProduct.ts` eliminado). Cambio de canción sin cortes dejando la siguiente en la cola de la página. Detalle de acciones verificadas en `AGENTS.md` ("Playback engine").
  - Probado con la UI real por CDP (`scripts/driveApp.mjs`, guion `.tmp/accept-r.js`) en `npm run dev` y en el build de producción (`preview`): inicio ~1 s, pausa/reanudar, seek, siguiente/anterior, 2 avances automáticos seguidos, volumen, fin de cola (se detiene), canción inexistente → `unavailable` en 1 s. FLAC LOSSLESS 16/44.1 FULL.
  - Herramientas de prueba: `scripts/runElectron.mjs` acepta flags extra (`--remote-debugging-port=9222`); `.tmp/` (ignorado por git) guarda `start.sh`/`stop.sh`/`restart.sh`, guiones y logs; filas de `TrackList` llevan `data-track-id`.

## Decisiones (y por que)
- **Motor web en vez del SDK (2026-11-15):** el CDN solo sirve audio a `tidal.com`; el SDK queda como respaldo y se elimina al cierre si no hace falta.
- **Control mixto del motor (2026-11-15):** iniciar canción navegando a `tidal.com/track/{id}` + clic en play; pausa/seek/volumen sobre el `<video>`; estado leído del `<video>`. Si TIDAL cambia un selector solo se rompe una pieza.
- **Canción nueva en el smart shuffle (2026-11-15):** `baseline_count` = mediana al verla por primera vez; se ordena por `play_count + baseline_count`; `play_count` siempre es real (lo usan Favorites y Most Listened).
- **Shuffle (2026-11-15):** smart por defecto; interruptor en Ajustes para aleatorio puro.
- **Repetir canción 1 vez (2026-11-15):** de un solo uso; tras repetir, el modo vuelve a apagado.
- **Cache (2026-11-15):** interruptor global. Apagado: la búsqueda en colección cubre solo los likes con conteo; encendido: likes + playlists con la lista de playlists de cada canción.
- **QR (2026-11-15):** se autoriza la dependencia `qrcode-generator` (única nueva).
- **Turso (2026-11-15):** el token válido es el de base de datos (el API token de plataforma da 401); comprobado con un `SELECT`.
- **Phase 7 (2026-11-15):** solo Favorites; la playlist global se descarta.
- **Pruebas en la cuenta real (2026-11-15):** permitido probar y revertir (playlist "Waves test" creada y borrada; like/unlike de una canción que no esté en likes).
- **Git (2026-11-15):** commit por fase verificada + push de `fable-dev`.

## Pendiente / proximos pasos
- Visto en R, por resolver: `catalog:get-mixes` devuelve 404 (`/userRecommendations/me/relationships/myMixes`); la cuenta es de país `DO` y el catálogo usa `countryCode=US`; teclas multimedia del SO (ahora las atiende la página de TIDAL, que es la que suena); el paquete `@tidal-music/*` se desinstala en el Cierre.
- Validación en Windows 11 (fuera del alcance de esta sesión).
- Prueba del control remoto con un teléfono real (y puerto 47836 en firewalld si hace falta).

## Estado del repo
Rama `fable-dev` desde `73ba375`.
