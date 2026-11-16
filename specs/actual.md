# Sesion actual

## Objetivo
Terminar el reproductor de principio a fin en la rama `fable-dev` (**`main` no se toca**): Phase R, resto de Phase 3 y fases 4-8 de `ROADMAP.md`. Claude desarrolla, prueba y da por buena cada fase por su cuenta (sin `/flujo`).
Criterio: cada fase con `npm run verify` verde + prueba real en la app; un commit por fase y `git push origin fable-dev`.

## Plan
Prefijo de comandos: `source ~/.nvm/nvm.sh && nvm exec 22 <cmd>`.
Pruebas reales: app lanzada con puerto de depuración y manejada por CDP (`scripts/driveApp.mjs`); `LOCAL_SQLITE_PATH` a una base de pruebas para no ensuciar los conteos reales.
- [x] **R — Motor web:** `electron/main/tidalWebPlayer.ts` (ventana oculta `tidal.com`, partición `persist:tidal-web`), IPC `player:*` + evento de estado, `playbackService`/`playerStore` sobre el motor; avance de cola al terminar cada canción.
- [x] **3A — Reproductor + menú + likes:** shuffle/repeat persistentes (repeat: off → canción 1 vez → canción infinita → playlist), cola dinámica (play next / add to queue), escrituras v2 (like/unlike, añadir a playlists, crear playlist), `TrackContextMenu` funcional, `AddToPlaylistsDialog` (checkboxes + "Agregar"), enlaces a álbum/artista.
- [x] **3B — Navegación y biblioteca:** `ArtistView`, `LibraryView` (playlists, carpetas, álbumes, artistas), feed de lanzamientos, `SearchView` con switch TIDAL/Colección, tema claro/oscuro/sistema, Ajustes ampliados, layout adaptable.
- [x] **4 — Smart shuffle + stats:** `baseline_count`, `playCountRepository.ts`, `smartShuffle.ts`, conteo al pasar el umbral (30 s), IPC `stats:*`, Most Listened en Home.
- [x] **5 — Turso:** `tursoSync.ts` (pull al arrancar, push por incremento, reintentos).
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

- **Fase 3A (2026-11-15):** cola con orden de reproducción + orden original (`queueStore`, reglas puras en `src/lib/queueOrder.ts`), shuffle persistente, repetición `off → one-once → one → all` (`one-once` se apaga sola tras repetir), `playNext`/`addToQueue`/mover/quitar, y restauración al arrancar de volumen, shuffle, repeat y cola (ventana de hasta 500 canciones, en pausa). Preferencias en SQLite (`preferencesRepository.ts`, IPC `preferences:*`/`queue:*`, `preferencesStore`, `src/lib/preferences.ts`). Escrituras v2 en `catalog.ts`: like/unlike, añadir a playlist, crear/borrar playlist (IPC `catalog:*`); errores de la API resumidos (`TidalApiError`, ya no se vuelca el intercambio HTTP con el token); mixes 404 → lista vacía. UI: `PlayerBar` (shuffle, repeat con insignia 1×/∞, corazón, calidad en curso), `QueuePanel` (subir/bajar/quitar, ventana alrededor de la actual), `TrackContextMenu` funcional, `AddToPlaylistsDialog` (filtro + checkboxes + "Add", solo playlists `USER`), corazones clicables y enlace al álbum en `TrackList`.
  - Probado por CDP (`.tmp/accept-3a-1..3.js`): shuffle on/off, los tres modos de repetición (incluido que Next sale de "repetir canción"), play next / add to queue / mover / quitar, like+unlike real contra TIDAL (revertido), añadir una canción a dos playlists temporales "Waves test A/B" a la vez (borradas después) y restauración tras reiniciar.
  - Nota: TIDAL tarda ~1-2 s en listar una playlist recién creada; el diálogo refresca la lista en cada apertura.

- **Fase 3B (2026-11-15):** `ArtistView` (`/artists/:id`: top tracks + álbumes), `LibraryView` (`/library`: playlists con crear, álbumes y artistas guardados, filtro), `ReleasesView` (`/releases`: hasta 60 artistas seguidos × 3 álbumes, agrupado por mes), `SearchView` con switch TIDAL (por defecto) / My collection (filtro local sobre los likes, sin acentos ni orden de términos; `src/lib/textSearch.ts`), búsqueda TIDAL también de artistas/álbumes/playlists, tema claro/oscuro/sistema (`src/lib/theme.ts`, `useAppliedTheme`), barra lateral colapsable (y siempre compacta en ventanas estrechas), Ajustes por secciones, nombres de artista enlazados (lista, barra, menú contextual), borrar playlist propia (doble clic de confirmación). Main: `tidalApiClient.ts` (cliente HTTP extraído; **usa el país real de la cuenta**, `DO`, en vez de `US`), `libraryCatalog.ts` (artistas, colección, búsqueda por tipo), teclas multimedia siguiente/anterior reenviadas de la página del motor a la cola de Waves.
  - Probado por CDP (`.tmp/accept-3b*.js`): tema, colapso, 52 playlists / álbumes / artistas, página de artista y reproducción, búsqueda en ambos modos, crear+borrar "Waves test C" desde la UI, lanzamientos en 15 s, ruta de tecla multimedia (simulada con la línea de consola; falta probar con el teclado real).
  - Límites de la API vistos: las **carpetas de playlists** se listan por id pero `/userCollectionFolders/{id}` da 404 → biblioteca en lista plana; `searchResults` solo rellena una relación por petición y admite 10 `include` como máximo; `filter[query]` funciona, la forma por ruta no.
  - `WAVES_DEBUG_API=1` habilita `window.api.debugApiGet(path)` para explorar la API v2 desde `driveApp.mjs` (solo desarrollo).
  - Aviso de proceso: en esta sesión un comando que combine `git push` con otras cosas es rechazado; el push va siempre en un comando aparte.

- **Fase 4 (2026-11-15):** `playCountRepository.ts` (conteos, `baseline_count`, top), `smartShuffle.ts` (grupos por nivel `play_count + baseline_count`, barajado dentro de cada grupo, de menor a mayor), migración `baseline_count` (`databaseSchema.ts`), IPC `stats:*`. Renderer: `PlayCounter` (suma solo escucha real; un salto de posición o la pausa no cuentan; una vez por reproducción), umbral configurable (30 s por defecto), el shuffle usa smart por defecto con caída a aleatorio si falla, Ajustes (tipo de shuffle + umbral), "Most listened" en Home, conteo por canción en la búsqueda de colección.
  - Probado por CDP con base de pruebas limpia (`.tmp/accept-4.js`): 2 escuchas de >5 s cuentan 2; iniciar + saltar + 3 s cuenta 0; la más escuchada sale última 20/20 y el orden varía; la cola de la UI respeta ese orden.

- **Fase 5 (2026-11-15):** `tursoSync.ts` (cliente HTTP `@libsql/client/web`, sin módulo nativo), reglas puras en `playSync.ts` (por canción gana el conteo mayor y la fecha más reciente; la base no se pisa; no se suben filas 0/0), sync completo al arrancar en segundo plano + envío de cada escucha contada, pendientes si falla la red, IPC `sync:get-status` / `sync:run-now`, sección "Play count sync" en Ajustes. Sin variables `TURSO_*` queda desactivado y todo sigue local.
  - Probado: tests contra libSQL en memoria (dos "dispositivos"), y contra el Turso real con la tabla temporal `track_plays_selftest` (subida de una escucha, y arranque con base local vacía que recupera el conteo); tabla temporal borrada. La tabla real `track_plays` se creará en el primer arranque normal.
  - Las ejecuciones de prueba (`.tmp/start.sh`) llevan el sync apagado salvo `WAVES_TEST_SYNC=1`.

## Decisiones (y por que)
- **Motor web en vez del SDK (2026-11-15):** el CDN solo sirve audio a `tidal.com`; el SDK queda como respaldo y se elimina al cierre si no hace falta.
- **Control mixto del motor (2026-11-15):** iniciar canción navegando a `tidal.com/track/{id}` + clic en play; pausa/seek/volumen sobre el `<video>`; estado leído del `<video>`. Si TIDAL cambia un selector solo se rompe una pieza.
- **Canción nueva en el smart shuffle (2026-11-15):** `baseline_count` = mediana al verla por primera vez; se ordena por `play_count + baseline_count`; `play_count` siempre es real (lo usan Favorites y Most Listened).
- **Regla de la base (2026-11-15, afinada al probar):** la mediana se toma de las canciones ya conocidas **de la misma lista** que se baraja, y solo si son al menos la mitad de la lista (lista establecida con recién llegadas). Si la mayoría es nueva (primera vez que se ve la lista) todo lo nuevo entra en 0: con la mediana global, tres canciones escuchadas igualaban a 2000 sin escuchar. Una canción escuchada antes de aparecer en ninguna lista barajada entra con la mediana de toda la biblioteca.
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
