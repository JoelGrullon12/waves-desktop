# SESSION HANDOFF — Liked Songs (pantalla `/songs`)

Fecha: 2026-09-15 — Rama: `main`, HEAD `39d7289` (docs: translate README).
Cambios SIN commitear: 11 archivos modificados + 5 nuevos (working tree).

> ⚠️ **Estado parcial.** La pantalla Songs es funcional (carga lazy, metadata
> completa, play/shuffle, reproducción), pero **no todo está terminado**: el menú
> contextual y los likes son UI con no-ops. Ver "Pendientes sin consolidar".
> **3.ª iteración (2026-09-15):** fix del observer del sentinel (se quedaba en 50
> filas en la primera entrada — ver "Últimos cambios"), y `page[size]=50` como
> tope (500 y 100 probados, ambos 429 — ver "Hallazgos de API"). El `stash@{0}`
> contiene una **iteración anterior abandonada** (el usuario prefirió rehacer el
> trabajo) — **ignorar el stash**; documentar solo el working tree actual.
>
> **Siguiente fase:** build/distribución (W11 falla con `electron-vite`; 404 de
> electron al empaquetar aquí) → `.opencode/plans/session-handoff-build-distribution.md`.
> **Feature extra planeada:** cache local SQLite de metadata referencial (Phase 7,
> Agents.md) para cargar listas sin requests — no iniciada.

## Qué se logró

**Reproducción de música (consolidado, sesión 2026-09-14):** player E2E con DRM
Widevine, full-length (>30s) vía sesión web first-party (`webSessionAuth.ts`).
Ya commiteado (`92ed834`, `d86f41e`). Detalle: `session-handoff-full-playback.md`.

**Pantalla Songs / liked tracks (working tree, 2026-09-15):**
- Ruta `/songs` (registrada en `App.tsx`) con entrada "Songs" en el Sidebar.
- Lista de canciones "likeadas" que **cargan de manera lazy**: paginación por
  cursor (`useInfiniteQuery`) + `IntersectionObserver` (sentinel, rootMargin 200px).
- Cada fila muestra: coverArt (lazy `<img loading="lazy">`), nombre, artista,
  álbum, duración. Header con total de canciones + duración total.
- **Play/Shuffle cubren TODA la librería, no solo lo cargado:** prefetch de todas
  las páginas en background al abrir; los botones esperan a que terminen las
  páginas pendientes y el enrichment (spinner) antes de armar la cola. Así el
  shuffle siempre baraja la biblioteca completa.
- Los tracks omitidos por la colección de likes (artwork) se **enriquecen on-demand**.

## Hallazgos de API (2026-09-15 — NO volver a investigar)

Fuente: spec OpenAPI descargado en `/tmp/opencode/uct.yml` y `/tmp/opencode/tracks.yml`.

1. **NO existe shuffle server-side.** `sort` en el endpoint de likes solo acepta:
   `addedAt`, `albums.title`, `artists.name`, `duration`, `title` (prefijo `-`
   = descendente). Sin random/aleatorio. El shuffle es necesariamente client-side.
2. **Enrichment REQUERIDO (no optativo):** `GET /userCollectionTracks/me/relationships/items`
   solo acepta `include=items`. Rechaza `items.albums.coverArt` (400) — a diferencia
   de `buildItemsUrl` de playlists/álbumes. El compound document nunca trae artwork,
   por lo que `getTracksByIds` + `songsStore` (enrichment) es OBLIGATORIO para tener
   cover art. **No eliminar el enrichment como si fuera una optimización.**
3. **Play Queues API es tier INTERNAL** — no disponible para clientes registrados.
   No hay forma de que el servidor construya colas aleatorias.
4. Sparse fieldsets no documentados en el spec.
5. **Límite verificado del `page[size]` de la colección de likes: 50.** Probados y
   rechazados por el edge de TIDAL con HTTP 429 (rate-limit): page[size]=500 y
   page[size]=100 — las páginas se arrastran entre retries con backoff (cada página
   puede tardar decenas de segundos). **NO subir este valor** — ver nota en Agents.md.

## Arquitectura implementada

### Main process (`electron/main/catalog.ts` — modificado)
- `COLLECTION_PAGE_SIZES = [50]`: **50 es el tope verificado del `page[size]`.
  page[size]=500 y page[size]=100 provocan 429 de TIDAL (rate-limit edge) y el walk
  de la biblioteca se arrastra entre retries — NO subir este valor.** Probe
  descendente en runtime (400 → siguiente candidato, luego default).** Con 50/página,
  ~1500 likes = ~30 requests con pacing 300 ms (~9 s de prefetch de fondo).
- `MAX_TRACKS_PER_BATCH = 50` para `getTracksByIds`.
- `artworkFileHref(artworkId, byId)`: el `coverArt` relationship expone solo el id
  corto que el CDN rechaza (403); se extrae el href real de `attributes.files`
  eligiendo el ancho más cercano a 320. Search/items ahora piden
  `include=...coverArt`.
- `fetchJson`: retry en HTTP 429 (hasta 4 intentos, respeta `Retry-After`, min 500ms).
- `getLikedTracksPage(cursor)`: paginación server-cursor de
  `userCollectionTracks/me/relationships/items` (pacing 300 ms, probe de `page[size]`).
  Corta en página vacía / sin cursor / cursor no avanzado.
- `getTracksByIds(ids)`: `GET /tracks?filter[id]=...` chunked de 50 con pacing
  200 ms; respeta el orden de los ids.
- IPC nuevos: `catalog:get-favorite-tracks-page`, `catalog:get-tracks-by-ids`
  (expuestos en `contextBridge.ts` + tipados en `global.d.ts`).

### Renderer
- `src/views/SongsView.tsx` (nuevo): infinite scroll, dedupe entre páginas (Set),
  batch de enrich de 50 con retry en la próxima corrida del efecto por ids
  pendientes (`inFlightBatchRef`), Play/Shuffle con espera (spinner) sobre páginas
  + enrichment, `visibleCount` + sentinel para reveal incremental de filas ya
  cacheadas (lazy rendering de ~1500 filas), refs (`hasNextPageRef`,
  `isFetchingNextPageRef`, `displayTracksRef`, `visibleCountRef`) para loops async
  que leen estado fresco.
- `src/store/songsStore.ts` (nuevo): `enrichedById: Map<string, Track|null>`
  (null = ya resuelto como ausente, no re-consultar).
- `src/components/tracks/TrackContextMenu.tsx` (nuevo): menú contextual con
  **acciones placeholder** (ver pendientes).
- `src/components/tracks/TrackList.tsx`: grid adaptable (columna corazón solo si
  `showLikeButton`), per-row `playQueue`, wrap en `TrackContextMenu`,
  `allowRemoveFromLibrary`; nueva prop `queueTracks` — cuando la lista renderizada
  es una ventana (`visibleTracks`), el click resuelve el índice real por id dentro
  de la lista completa (`queueTracks` / `displayTracks`) para que el queue arranque
  desde la canción correcta en la biblioteca entera.
- `src/lib/format.ts`: `formatTotalDuration` (hr/min). `src/lib/tidalImage.ts`:
  artworkUrl deja pasar hrefs CDN `https://` completos.
- `src/types/track.ts`: `FavoriteTracksPage { tracks, nextCursor }`.

## Pendientes sin consolidar (NO funcionales)

1. **`TrackContextMenu`** — todas las entradas van a `runPlaceholder()` (no-op):
   Play next, Add to queue, Add to playlist, Remove from library, Go to album, Go to artist.
2. **Likes decorativos** — el corazón en otras vistas es UI; like/unlike NO conectado
   a `collection.write`.
3. **Remove from library** — visible en Songs (`allowRemoveFromLibrary`) pero inerte.
4. **Shuffle one-shot** — no hay toggle persistente de shuffle ni repeat mode en PlayerBar
   (el botón de Songs sí baraja la librería completa, pero el estado no persiste).
5. **Enrichment edge** — duración/calidad por fila pueden quedar vacías hasta resolver;
   tracks faltantes se cachean como `null` en `songsStore`.

## Lecciones técnicas

1. El CDN no sirve imágenes del id corto de `coverArt` ni de tamaños fuera de la lista;
   usar siempre el href de `attributes.files` del recurso de artwork.
2. `URLSearchParams.set()` reemplaza valores; los `include` repetidos deben ir con
   `append()` para mantener el compound document completo.
3. `page[size]` no está en el spec de OpenAPI del endpoint de la colección:
   probe al runtime con **fallback descendente** (`COLLECTION_PAGE_SIZES = [50]`,
   `collectionPageSizeIndex` global). **50 es el tope verificado: 500 y 100 ambos
   provocaban 429. NO intentar subirlo.**
4. El endpoint de likes NO admite `include=items.albums.coverArt` (400) — solo `items`.
   Por eso el enrichment con `getTracksByIds` es **obligatorio**, no una optimización.
5. No hay shuffle server-side (`sort` limitado a addedAt/albums.title/artists.name/
   duration/title + `-`); barajar siempre en el cliente.
6. El rate limit de TIDAL (429) se limpia respetando `Retry-After` + pacing entre
   páginas/batches (300/200 ms) + chunks de `filter[id]` de a 50. Cuando un fetch
   falla agotando retries, parar y mostrar el error (no esperar infinito).
7. React Query cachea páginas como un todo; dedupe manual con Set obligatorio porque
   un track puede repetirse entre páginas.
8. Para loops async que esperan estado de la query, guardar refs actualizadas en cada
   render (`hasNextPageRef`, `isFetchingNextPageRef`, `displayTracksRef`,
   `visibleCountRef`) y leer de `useSongsStore.getState()` en vez de cerrar valores
   capturados. `loadAllPages` espera pasivamente cuando `isFetchingNextPageRef` es
   true (en lugar de empujar otra ráfaga de fetch simultáneos).

## Estado del working tree

Nota: `Agents.md` y este mismo plan (`session-handoff-liked-songs.md`) son cambios
de esta sesión de documentación y quedan SIN commitear junto con el código.

```
 M Agents.md
 M electron/main/catalog.ts
 M electron/preload/contextBridge.ts
 M src/App.tsx
 M src/components/layout/Sidebar.tsx
 M src/components/tracks/TrackList.tsx
 M src/lib/format.ts
 M src/lib/tidalImage.ts
 M src/services/tidalCatalogService.ts
 M src/types/global.d.ts
 M src/types/track.ts
?? .opencode/plans/session-handoff-liked-songs.md
?? src/components/tracks/TrackContextMenu.tsx
?? src/store/songsStore.ts
?? src/views/SongsView.tsx
```

Verificación: `npm run typecheck` y `npm run build` limpios.

## Últimos cambios de esta pasada (shuffle con librería completa)

2.ª iteración (2026-09-15) — fix del 429 + reveal de filas + error visible:
- `catalog.ts`: `COLLECTION_PAGE_SIZES` de `[500, 100]` → `[100]`. page[size]=500
  rate-limitea (429) y deja las páginas arrastrándose entre retries. 100 es el tope
  verificado (documentado en Agents.md como límite de la API — no subir).
  `MAX_TRACKS_PER_BATCH` sigue 50.
- `SongsView.tsx`:
  - Sentinel desacoplado: ahora reveal de filas cacheadas (`visibleCount` + 50) y
    fetch de la siguiente página son independientes. Antes el reveal solo corría
    cuando `!hasNextPage`, así que con la biblioteca aún paginándose el DOM se
    quedaba en las primeras 50 filas hasta re-entrar a la pantalla.
    El fetch ahora se guarda con `isFetchingNextPageRef` para no apilar requests.
  - `loadAllPages` espera pasivamente (`sleep` mientras otro fetch está en vuelo)
    en vez de lanzar fetchs en cadena; si un fetch agota los retries de TIDAL,
    REJECTA: la espera se corta, el spinner se apaga y se muestra el error.
  - `startLibraryPlayback` manda el error a un `loadError` state, renderizado como
    `role="alert"` bajo los botones. No hay timeout: se espera lo que TIDAL
    necesite (la biblioteca puede ser enorme), pero un error real sí corta.
  - Nuevo ref `isFetchingNextPageRef`.
- `TrackList.tsx`: prop `queueTracks` para que el click arranque el queue en la
  lista COMPLETA (índice resuelto por id), no en la ventana visible.

3.ª iteración (2026-09-15) — fix del observer (primera entrada) + 50/page:
- `catalog.ts`: `COLLECTION_PAGE_SIZES` de `[100]` → `[50]`. 100 aún provocaba 429
  en el walk. 50 es el nuevo tope verificado (Agents.md).
- `SongsView.tsx`: el `<div ref={loadMoreRef}>` se movió fuera del bloque condicional
  `{displayTracks.length > 0 && ...}` para que esté SIEMPRE en el DOM. Antes el
  observer (`useEffect([], [])`) hacía early-return cuando el sentinel no existía
  (sin datos en mount) y nunca se re-ejecutaba — el reveal de filas no funcionaba
  en la primera visita (solo al re-entrar a la pantalla, donde la caché ya tenía
  data y el sentinel existía en el mount). Ahora el observer se adjunta siempre.

## Próximos pasos (fase siguiente)

- Commiteo del working tree (usuario aún no lo pidió).
- Conectar `TrackContextMenu` y like/unlike a la API de colección (`collection.write`)
  y a la navegación (Go to album/artist).
- Shuffle/repeat persistente en PlayerBar (toggle de estado en `queueStore`).
- Pull-to-refresh / refetch por tiempo de la colección.
- Fase 6 del roadmap: GLOBAL playlist (unión liked + playlists) y favorites dinámicos.