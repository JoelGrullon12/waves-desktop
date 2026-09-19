# SESSION HANDOFF — Plan activo (siguiente feature)

Fecha: 2026-09-15 — Rama: `main`, HEAD `6dcaad0`.
Working tree: limpio. El plan de la sesión anterior (restructura de docs) se
archivó en `history/session-handoff-docs-restructure.md`.

## Resumen de esta sesión
- Sesión de documentación: `Agents.md` quedó solo estructural (stack,
  convenciones, decisiones, runbook, restricciones de API); se creó
  `ROADMAP.md` con fases renumeradas y una nueva Fase 3 prioritaria;
  los handoffs cerrados se movieron a `.opencode/plans/history/` (git mv) y
  se creó un plan activo de sesión.
- Archivos principales: `Agents.md`, `README.md`, `ROADMAP.md` (nuevo),
  `.opencode/plans/history/{session-handoff-liked-songs,build-distribution,full-playback}.md`
  + `history/_README.md`. Commit: `6dcaad0`.
- Decisión de diseño de la sesión: separar la documentación en 3 capas para que
  el estado/progreso no contamine la referencia estructural, y renumerar las
  fases insertando la Fase 3 (reproductor completo) ANTES de las features
  especiales (Smart Shuffle, sync, remote, global playlist, cache).

## Estado actual del proyecto
- `npm run typecheck` y `npm run build` pasan sin errores (verificado en el
  cierre de sesión; build con Vite 7, 2124 módulos en el renderer). No hay
  suite de tests (verificación = typecheck + build).
- Deuda técnica / TODOs intencionales: los pendientes de la pantalla `/songs`
  (menú contextual no-op, likes decorativos, shuffle one-shot, sin repeat) son
  work items de la Fase 3 y NO se atienden en esta iteración (ver ROADMAP.md);
  validación de `npm install` + `npm run dev` + `package:win` en la W11 sigue
  pendiente de usuario (runbook en `history/session-handoff-build-distribution.md`).

## Siguiente feature a desarrollar
- Fase 3: Reproductor completo con funciones tradicionales
- Punto 1: **Home / resumen de la biblioteca** — pantalla principal con un
  resumen de la biblioteca del usuario (reemplaza el actual "Your collection is
  coming soon" en `LibraryView`).

### Descripcion de la feature
- En esta sesion se va a desarrollar el punto 1 y una pantalla de detalle de
  Playlist que se detallara mas adelante, los demas puntos de la fase 3 se
  exploraran despues.
- La pantalla a modificar sera de Your Library y se le cambiara el nombre por
  Home y tendra la siguiente estructura:
  1. Vistazo a la biblioteca: Lista horizontal de 10 playlists al azar del
     usuario, cada una con el nombre de la playlist en la parte inferior y el
     coverArt.
  2. Most Listened: Lista horizontal de las 10 ultimas playlists de My Most
     Listened de los ultimos meses.
  3. Ultimos lanzamientos: Lista horizontal de los 10 ultimos albumes lanzados
     por los artistas que el usuario sigue.
  4. Mixes personalizados: Lista horizontal de los mixes personalizados que
     Tidal le recomienda al usuario.
  5. Top 10 semanal: Lista vertical con las 10 canciones mas escuchadas por el
     usuario en la semana; por ahora aun no se registra ningun dato estadistico,
     asi que carga 10 canciones al azar del usuario.
- Las listas horizontales deben tener scroll para poder desplazar sus elementos,
  deben tener el coverArt en alta calidad de la playlist o album. Debajo del
  coverArt tener el titulo de la playlist/album, y debajo del titulo, un
  subtitulo con el nombre del artista (o artistas en caso de ser una playlist de
  Tidal).
- La lista vertical debe tener la misma estructura que la pantalla de canciones
  de la biblioteca, con el coverArt en pequeño, nombre de la cancion, artista,
  album, duracion.
- Al hacer hover sobre los coverArts de las playlists deben aparecer 2 botones
  en la parte inferior izquierda del coverArt, play y shuffle, con sus simbolos;
  al darle click, se debe cargar la lista de canciones de dicha playlist/album y
  comenzar su reproduccion.
- Al hacer click sobre el componente de playlist/album en cualquier otro lugar
  que no sea los botones de reproduccion, se debe abrir la pantalla de detalle
  de playlist/album.
- La pantalla de detalle de playlist/album debe mostrar una estructura parecida
  a la lista de canciones de la biblioteca; el coverArt, nombre de la
  playlist/album, artista, cantidad de canciones, duracion total, y debajo la
  lista de canciones con todos sus detalles, en este caso mostrando a cuales
  canciones se les ha dado like o no.

### Detalles tecnicos
- **Hallazgos de API ya verificados en el cierre de sesión (`tidal-api-oas.json`):**
  - **Mixes personalizados: EXISTE.** `/userRecommendations/{id}/relationships/{myMixes,discoveryMixes,newArrivalMixes,offlineMixes}` con `id=me`, y los items via `/user{...}Mixes/{id}/relationships/items` (`id=me`, `page[cursor]`, `countryCode`, `include=items`). Usar `myMixes`/`discoveryMixes` para la sección 4. Confirmar en runtime qué shape devuelven (¿entidad "mix" con artwork propio?).
  - **Most Listened: NO existe** en la spec pública (sin coincidencias most/listen/popular). Ver "Preguntas abiertas".
  - **Ultimos lanzamientos de artistas seguidos: sin endpoint directo** en la spec. Candidatos: artistas seguidos via `/userCollectionArtists/{id}/relationships/items` (`id=me`) + el ultimo album de cada uno via `/artists/{id}/relationships/albums`; o el mix `/userNewReleaseMixes` / la relación `newArrivalMixes`. Ver "Preguntas abiertas".
  - Playlists del usuario: `/userCollectionPlaylists/{id}` (`id=me`, params `countryCode`, `locale`, `include`).
- Antes de cada seccion, releer la OAS (`tidal-api-oas.json`) para confirmar el
  endpoint final y repetir el patron del repo: usar siempre el href real de
  `attributes.files` del artwork (el id corto 403 en el CDN), pacing + retry de
  429 honrando `Retry-After`, y `include=...coverArt` donde el endpoint lo acepte
  (a diferencia de liked tracks, playlists/albums aceptan coverArt; verificar
  por endpoint).
- Componente reutilizable de elemento Playlist/Album (ej. `MediaCard`): props =
  `type: 'playlist' | 'album'`, `coverUrl`, `title`, `artist`, `id`. Los 2
  botones (play/shuffle) trabajan solo con `{ id, type }`.
- Componente reutilizable de lista horizontal (horizontal scroll, rows de
  `MediaCard`), usado en las 4 secciones horizontales.
- Pantalla de detalle generica (ej. `MediaDetailView`): props = `id`, `type`,
  `coverUrl`; ella consulta las canciones (reutilizar `TrackList` con
  `queueTracks` + indicador de like). Enrutar `/playlists/:playlistId` y
  `/albums/:albumId` (rutas ya existentes en `src/App.tsx`) hacia esta vista
  generica.
- Reproductor: play/shuffle desde un `MediaCard` debe REEMPLAZAR la cola actual
  y reproducir SOLO las canciones de esa playlist/album. Revisar el patron de
  `SongsView.startLibraryPlayback` (cargar todo antes de arrancar) y la API de
  `queueStore`/`playerStore`.
- El bloque "Full-length playback" (conectar sesion web) vive hoy en
  `LibraryView`; decidir su nueva ubicacion al rediseñar (ver "Preguntas
  abiertas").
- `Home` reemplaza `LibraryView`: renombrar titulo a "Home" y reutilizar
  TanStack Query con los mismos patrones de cache/paginacion vigentes.

### Criterios de aceptacion
- La nueva pantalla debe mostrar todas los resumenes de secciones correctamente.
- Se deben mostrar los coverArts de albumes en alta calidad.
- Al hacer click sobre los botones de reproduccion de los albumes, se debe
  eliminar la cola actual y reproducir y agregar a la cola de reproduccion SOLO
  la musica de dicho album/playlist.
- Al hacer click sobre el coverArt, nombre o artistas del album/playlist se debe
  redirigir a una pantalla de detalle con toda la info relevante y canciones de
  dicha lista.

## Preguntas abiertas para el humano
1. **"Most Listened" no tiene endpoint publico de v2** (no existe en la spec del
   repo). Alternativas: (a) dejar la seccion fuera por ahora hasta conseguir el
   endpoint interno tipo DAO (el proyecto ya usa `playbackinfopostpaywall/v4`
   como patrón), (b) reemplazarla temporalmente por otro mix existente, (c) otra
   fuente que el humano indique.
2. **"Ultimos lanzamientos de artistas seguidos" no tiene endpoint directo.**
   Alternativas: (a) combinacion de artistas seguidos + ultimo album por artista
   (N llamadas, lento), (b) usar `userNewReleaseMixes`/`newArrivalMixes` como
   feed de nuevos lanzamientos, (c) otro enfoque que el humano indique.
3. **Ubicacion del bloque "Full-length playback"** (hoy en `LibraryView`, que se
   convierte en Home): mantenerlo dentro de Home (p. ej. banner colapsable),
   moverlo a una vista de Settings, o dejarlo fuera por ahora.