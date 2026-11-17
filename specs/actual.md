# Sesion actual — cambios de details.md (2026-11-16)

Rama `fable-dev`. Plan aprobado por el usuario; sin preguntas abiertas.


## Contexto
El usuario usa la versión empaquetada (AppImage; en Windows el .exe) y anotó en `details.md` fallos, detalles visuales, mejoras de uso y propuestas. El problema principal: la app empaquetada no tiene `.env`, así que Turso y otros ajustes no se pueden configurar. Windows además se queda sin sonido en `npm run dev` y en pantalla en blanco con el `.exe`. Objetivo: resolver todo lo anotado, por fases, con un commit verificado por fase y push de `fable-dev` (`main` no se toca).

## Investigación de las propuestas (API v2, spec OpenAPI oficial)
- **Letras: sí.** `GET /tracks/{id}/relationships/lyrics` con `include=lyrics`.
  - El recurso `lyrics` trae `text`, `lrcText` (LRC con marcas de tiempo, sirve para sincronizar), `direction`, `provider` y `technicalStatus`.
  - Acepta el token de la app.
  - Falta comprobar con tu cuenta cuántas canciones traen `lrcText`; si una no lo trae, se muestra el texto sin sincronizar.
- **Créditos: sí, pero solo por canción.** `GET /tracks/{id}/relationships/credits` devuelve `credits` (`name`, `role`) con relación `artist` (para enlazar al artista) y `category`. No hay créditos de álbum: los del álbum completo se arman juntando los de sus canciones.
- **Editar una playlist: sí.**
  - Nombre y descripción: `PATCH /playlists/{id}` (`description`, máximo 4096 caracteres).
  - Portada: `PATCH /playlists/{id}/relationships/coverArt`. Subir una imagen propia necesita `POST /artworks`, que pide el scope `w_usr` y quizá no lo tengamos. Si falla, se elige entre las portadas que TIDAL sugiere (`GET /playlists/{id}/relationships/suggestedCoverArts`).
- La descripción de las playlists ya viene en `attributes.description`; hoy la app no la lee.

## Decisiones tomadas (respuestas del usuario)
- Una canción solo empieza a sonar con el botón ▶ de su fila o con Play en el menú contextual. El clic en la fila no hace nada.
- El panel "Now playing" ocupa la pantalla y tapa la vista, pero no la barra inferior.
  - Izquierda: portada grande, datos y el switch Info/Letras.
  - Derecha: la cola, que se abre sola.
  - Se cierra con Esc o con otro clic en la barra.
- Créditos en el panel de la canción que suena y en la vista del álbum (todas sus canciones).
- Windows: arreglos a ciegas más un log en archivo; la prueba real la hace el usuario en Windows.
- Desde Settings se podrá cambiar: Turso (URL y token), el puerto del control remoto, las credenciales de TIDAL y la ubicación de los datos de la app. El `.env` sigue como opción de desarrollo y, si trae valores, se usan en lugar de los guardados.
- Los ajustes comunes (tiempos, contadores, tamaños, orden, tema...) se guardan en un `settings.ini` legible.
- "Waves" solo en la barra lateral y en el título de la ventana. `productName` y la carpeta de datos no cambian.
- Portada de playlist: subir imagen propia; si TIDAL lo rechaza, elegir entre las sugeridas.
- Las playlists de una canción salen de la copia local. Si está apagada, se muestra un aviso con enlace a Settings.

## Fases

### Fase 1 — Configuración que funciona sin `.env`
- **`settings.ini`** en la carpeta de datos.
  - Parser y escritor INI propios, puros y con tests, en `electron/main/iniFile.ts`.
  - Las preferencias que hoy viven en la tabla `user_preferences` pasan al INI. Al primer arranque se migran y la tabla queda sin uso.
  - El contrato `preferences:*` y `src/lib/preferences.ts` no cambian; solo cambia el almacenamiento en `preferencesRepository.ts`.
  - La cola guardada sigue en SQLite.
- **Secretos cifrados.** Un único archivo `app-secrets` (safeStorage, modo 0600, como `tidalAppCredentials.ts`).
  - Guarda Turso (URL y token) y las credenciales de TIDAL. Las credenciales actuales se migran desde `tidal-app-credentials`.
  - Ningún IPC devuelve un secreto: solo dicen "configurado" y de dónde viene (`env` o `stored`).
- **Turso.** `tursoSync.ts` lee la configuración resuelta (`.env` y, si no hay, lo guardado). Settings permite guardar, probar la conexión y borrar; al guardar, la sincronización arranca de nuevo sin reiniciar.
- **Puerto del control remoto.** Se edita en Settings y se guarda en el INI; si el remoto está encendido, se reinicia.
- **Credenciales de TIDAL.** Editar o borrar desde Settings; borrar cierra la sesión.
- **Ubicación de los datos.**
  - Settings muestra la ruta y un botón "Open folder".
  - "Change location" mueve `settings.ini`, la base de datos y los secretos cifrados, y reinicia la app.
  - La ruta elegida se apunta en `waves-location.ini` dentro de la carpeta del sistema: `~/.config/waves-desktop` en Linux, `%APPDATA%\waves-desktop` en Windows.
  - La sesión de Chromium y Widevine se quedan en la carpeta del sistema, para no perder el inicio de sesión ni el CDM.
- **Cuenta.** El botón Log out pasa de la barra lateral a Settings, en la sección Account.
- Todo IPC nuevo pasa por `handleTrusted` y `validation.ts` (validar URL `libsql://`/`https://`, puerto 1024-65535 y una ruta absoluta existente).

### Fase 2 — Windows (a ciegas) y log en archivo
- `electron/main/fileLog.ts` copia `console.*` del proceso principal en `<datos>/logs/main.log`, con rotación por tamaño.
- También registra los fallos del renderer y del motor:
  - `did-fail-load`, `render-process-gone`, `preload-error` y los errores de consola.
  - Errores de medios y de EME de la ventana del motor, y su volumen y silencio.
- Pantalla en blanco del `.exe`:
  - Revisar la carga de `index.html` y del preload `.mjs` desde el asar en Windows, y la CSP de producción.
  - Mostrar una página de error con la ruta del log en vez de dejarla en blanco.
- Sin sonido en Windows:
  - Con los nuevos logs se verá si TIDAL niega la licencia o si el audio sale silenciado.
  - Si falta la firma VMP de Castlabs (EVS), se documenta el paso, que es una cuenta gratuita de castlabs y lo haría el usuario.
- Con ImageMagick (`magick`, solo como herramienta, no como dependencia) se genera un `icon.ico` multitamaño hasta 256 px a partir del `icon.png` nuevo. El actual mide solo 32×32 y el instalador NSIS pide 256.

### Fase 3 — Barra lateral y detalles visuales
- **Barra lateral.**
  - Arriba: el icono de la app (`resources/icon.png` reducido para la interfaz), el texto "Waves" y un botón con icono para plegar o desplegar la barra.
  - Navegación en este orden: Home, Songs, Search y "Show more…". "Show more…" abre Library, Favorites, New releases, Settings y "Show less…"; queda recordado en las preferencias.
  - Se quitan el pie con Collapse y Log out.
  - La lista de playlists tiene scroll invisible y, con la barra plegada, las portadas se ven completas y centradas.
- **Botones Shuffle y Repeat activos:** fondo circular, como el botón de play.
- **Cola:** portada del álbum en cada fila.
- **Imagen en grande:** al hacer clic se abre un visor a pantalla completa con la imagen en alta resolución. Funciona en la portada de la barra inferior, la cabecera de álbum o playlist y la imagen del artista en su vista. `MediaCard` no cambia.
- **Menú contextual:** se muestran todos los artistas, con scroll si son muchos (se quita `MAX_ARTIST_ENTRIES`).
- **Descripción de la playlist:** el parser lee `description` y la cabecera de la playlist la muestra.

### Fase 4 — Listas, cola y barra inferior
- `TrackList`: el clic en la fila no reproduce; el botón ▶ de la columna del número sí (también con teclado).
- **Buscador dentro de la playlist** (y del álbum): filtra la lista ya cargada con `src/lib/textSearch.ts`. Al reproducir con el filtro puesto, la cola es lo filtrado.
- **Cola:**
  - Arrastrar y soltar con HTML5 nativo, que reutiliza `moveInQueue`.
  - Menú contextual con "Place next in queue", que mueve la canción a `currentIndex + 1`, y "Remove from queue".
- **Clic derecho en la barra inferior:** el mismo menú de canción que en las listas (agregar a playlists, me gusta, ir al álbum o al artista).
- **"Playing from".**
  - `PlaybackSource` gana `sourceTitle` y la ruta a su vista (playlist, álbum, mix, Songs, Favorites, búsqueda).
  - Debajo del artista, en la barra inferior, sale un enlace a esa vista.
  - En la cabecera de la cola aparece "Playing from …".
  - La cola guardada conserva el título.
- **Search, sección "My collection":** columna nueva "In n playlists" con los nombres enlazados en una línea. Si no caben, un botón "See all…" despliega como acordeón la lista completa con sus enlaces.

### Fase 5 — Panel "Now playing", letras y créditos
- Clic en la barra inferior, fuera de los controles: el panel sube animado y la cola se abre a la derecha.
- **Pestaña Info:**
  - Portada grande, que abre el visor.
  - Título, álbum y todos los artistas, cada uno con su enlace.
  - Número de reproducciones (`stats:*`).
  - Playlists que la contienen, desde la copia local (`cache:get-memberships`), o el aviso para encenderla.
  - Créditos de la canción.
- **Pestaña Lyrics:**
  - Parser LRC puro con tests en `src/lib/lyrics.ts`.
  - La línea actual se resalta y sigue a `position`.
  - Clic en una línea: salta a ese momento (`seek`).
  - Sin `lrcText`, texto plano. Sin letra, el mensaje "No lyrics".
- **IPC nuevos:** `catalog:get-lyrics` y `catalog:get-track-credits`, con id validado; la caché la lleva TanStack Query.

### Fase 6 — Editar playlists y créditos del álbum
- Icono de lápiz junto al nombre de la playlist (solo en las tuyas). Abre un diálogo con nombre, descripción, portada y "Delete playlist", que hoy está en la cabecera y se mueve ahí.
- **Portada:**
  - Primero se intenta subir una imagen propia: `POST /artworks`, después el PUT al `uploadLink` y luego `PATCH coverArt`.
  - Si TIDAL lo rechaza por permisos, el diálogo ofrece las portadas sugeridas.
  - Ese resultado se comprueba con tu cuenta al empezar la fase, probando y revirtiendo.
- Los cambios se reflejan en la barra lateral, en Library y en la copia local, que gana un `LibraryChange` "playlist-updated".
- **Créditos del álbum:** sección "Credits" en la vista del álbum que junta, por rol, los créditos de todas sus canciones.
  - Se piden al abrir la sección, con pausas entre peticiones para respetar los 429.
  - Cada canción enlaza a sus créditos.

## Archivos principales
- **Proceso principal.**
  - Nuevos: `iniFile.ts`, `appSettings.ts` (ruta de datos, INI y secretos), `fileLog.ts`.
  - Se modifican: `preferencesRepository.ts`, `tidalAppCredentials.ts`, `tursoSync.ts`, `remoteControl.ts`, `database.ts`, `index.ts`, `catalog.ts`, `tidalParsers.ts`, `metadataCache.ts` y `validation.ts`.
- **Puente:** `electron/preload/contextBridge.ts` y `src/types/global.d.ts`.
- **Renderer.**
  - Nuevos: `NowPlayingPanel`, `ImageViewer`, `PlaylistEditDialog`, `src/lib/lyrics.ts` y secciones de Settings (Sync, App data, Account).
  - Se modifican: `Sidebar.tsx`, `SidebarPlaylists.tsx`, `PlayerBar.tsx`, `QueuePanel.tsx`, `TrackList.tsx`, `TrackContextMenu.tsx`, `MediaDetailView.tsx`, `SearchView.tsx`, `SettingsView.tsx`, `queueStore.ts` y `playerStore.ts`.
- **Reutilizar:**
  - `writePrivateFile` y el patrón safeStorage de `tidalAppCredentials.ts`.
  - `handleTrusted` y `validation.ts`.
  - `textSearch.ts` y `artworkUrl`.
  - `moveInQueue`, `playNext` y `usePlaylistDialogStore`.
  - `cache.memberships`, `apiGet` y el control de 429 de `tidalApiClient.ts`.
- **Documentación:** `AGENTS.md` (configuración sin `.env`, INI, log, letras y créditos), `README.md`, `ROADMAP.md` y `specs/actual.md`. En `actual.md` se guardan antes de escribir código este plan y las decisiones, como pide CLAUDE.md.

## Verificación
- Por fase: `npm run verify` (typecheck, lint, tests y build), con tests nuevos para el parser INI, la migración de preferencias, la validación de la configuración, el parser LRC, los parsers de letras, créditos y descripción, y el reordenado de la cola.
- En la app real, conducida por CDP (`node scripts/runElectron.mjs dev --remote-debugging-port=9222` y `scripts/driveApp.mjs`) con tu cuenta, probando y revirtiendo:
  1. Turso configurado desde Settings sin `.env`.
  2. INI creado y migrado.
  3. Cambio de carpeta de datos y reinicio.
  4. Barra lateral.
  5. Cola: arrastrar y "Place next".
  6. "Playing from".
  7. El panel con letras sincronizadas y el salto al tocar una línea.
  8. Créditos.
  9. Editar nombre y descripción de una playlist de prueba y luego borrarla.
- Al final, `npm run package:linux`: el AppImage arranca y la sincronización de Turso funciona sin `.env`. Además `npm run package:win` genera el zip para que lo pruebes en Windows.
- Un commit por fase (inglés, verbo imperativo, sin trailers) y push de `fable-dev`.

## Pendiente heredado
- Validar en Windows 11 el `.zip` portable (o generar el instalador NSIS allí).
- Probar el control remoto con un teléfono real (y abrir el puerto 47836 en firewalld si lo bloquea).
- Probar las teclas multimedia del teclado físico (siguiente / anterior).
- `catalog:get-mixes` devuelve 404 en esta cuenta: la fila de mixes de Home queda vacía.

## Progreso
- [x] Fase 1 — Configuración sin `.env`
- [x] Fase 2 — Windows y log en archivo (a ciegas; falta probar en Windows con `logs/main.log`)
- [x] Fase 3 — Barra lateral y detalles visuales
- [x] Fase 4 — Listas, cola y barra inferior
- [x] Fase 5 — Now playing, letras y créditos (vía sesión web: la API v2 no las da al token de la app)
- [x] Fase 6 — Editar playlists y créditos del álbum (portada: TIDAL la rechaza con el token de la app)
