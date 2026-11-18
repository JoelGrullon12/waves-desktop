# ROADMAP — Waves Desktop

> Fases de producto y features planeadas. El estado operativo diario vive en
> `specs/` (`actual.md` para la sesión actual, `history/`
> para las cerradas). Decisiones estructurales y restricciones → `AGENTS.md`.
>
> **La Fase 3 se completa ANTES que las features especiales (4-8):** el objetivo es
> un reproductor de suscripción completo antes de añadir nada más.

Última actualización: 2026-11-17 · Leyenda: ✅ completada · 🔄 en proceso · ⏳ planeada

## Completadas

- **Phase 0 — Environment Setup ✅** — React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui.
- **Phase 1 — TIDAL Authentication ✅** — OAuth PKCE, fixed redirect URI, `safeStorage` token
  storage, auto-refresh, logout.
- **Phase 2 — Functional Player MVP ✅** — TIDAL Web SDK, Zustand stores, v2 API catalog proxy,
  full player UI, Media Session API.
- **Phase M — Electron Migration ✅** — Tauri v2 → Electron (Castlabs fork). Milestone logrado:
  login + reproducción completa con audio + empaquetado en Linux.

## Phase 3 — Reproductor completo con funciones tradicionales ✅ (2026-11-15)

> Se completa antes de las fases 4-8. Varios pendientes actuales (no-ops del menú
> contextual, likes decorativos, shuffle one-shot, ausencia de repeat) son work items
> de esta fase — el detalle diario está en `specs/actual.md`.
>
> **Deliverable inmediato:** el **Punto 1** (Home + pantalla de detalle de
> playlist/álbum). El resto de los puntos se exploran en iteraciones posteriores.
> Estado de los datos de Home (verificado contra `tidal-api-oas.json`): mixes
> personalizados ✅ existen (userRecommendations/user*Mixes); "Most Listened" ❌ sin
> endpoint público; últimos lanzamientos de artistas ❌ sin endpoint directo (alternativas
> en `specs/actual.md`).

Reproductor de música por suscripción completo, con el mismo conjunto de funciones de
cualquier reproductor tradicional:

1. **Home / resumen de la biblioteca** ✓ — pantalla principal con un resumen de la
   biblioteca del usuario (`HomeView`: playlists al azar, mixes, lanzamientos). El bloque
   "Most Listened"/top semanal se retira en la Fase C y vuelve en la Fase 4 con play counts locales.
2. **Feed de lanzamientos** ✓ — últimos lanzamientos de artistas seguidos (`/releases`).
3. **Colección del usuario** ✓ — playlists, álbumes y artistas guardados (`/library`). Las **carpetas** quedan fuera: la API pública lista sus ids pero responde 404 al pedir nombre o contenido (2026-11-15).
4. **Perfiles y vistas** — perfiles de artistas (`ArtistView`, hoy no existe); álbumes y
   playlists comparten la vista genérica `MediaDetailView` ✓.
5. **Reproductor tradicional** — shuffle y **cola dinámica**, **repetición** de canciones
   (estado persistente; hoy el shuffle es one-shot y no hay repeat). Nota del desarrollador: la repeticion tendra 3 modos, el primer modo sera repetir la cancion actual 1 vez (a diferencia de la repeticion infinita), el segundo modo sera repetir la cancion actual infinitamente y el tercer modo sera repetir la playlist completa. Es una de las funciones extra que quiero en el reproductor custom
6. **Click derecho + enlaces** — `TrackContextMenu` funcional conectado a `collection.write`
   (Play next, Add to queue, Add to playlist, Remove from library, Go to album/artist) +
   enlaces clicables en nombres y títulos. Incluye **like/unlike** de la biblioteca. Nota del desarrollador: la funcion de agregar a playlist debe permitir agregar a varias playlists al mismo tiempo, al mostrar la pantalla de "agregar a playlists" debe ser una lista con checkbox y abajo un boton de "Agregar"
7. **Ajustes visuales** — mejor manejo del espacio, **modo oscuro**, pantalla de
   configuración, reordenamiento de componentes, responsive/adaptable.
8. **Búsqueda en biblioteca personal** — buscar dentro de la colección del usuario (además
   del search global de TIDAL ya existente en `SearchView`). Nota del desarrollador: para esto, que la pantalla de busqueda tenga una especie de switch para cambiar entre busqueda en Tidal o busqueda dentro de coleccion, que la busqueda en Tidal sea el modo por defecto. Ademas, al buscar una cancion en la coleccion, que traiga informacion de la cancion, como la cantidad de veces que se ha reproducido y en cuantas y cuales playlists esta agregada, si es pesado hacerlo a traves del api, dejalo pendiente hasta hacer la parte de metadata local para usar eso en su lugar
   

## Phase R — Motor de reproducción con el reproductor web de TIDAL ✅ (2026-11-15)

> **Hecha:** el reproductor web de TIDAL corre en una ventana oculta y Waves lo controla despachando las acciones Redux de la propia página (detalle en `AGENTS.md`, "Playback engine"). Audio FULL sin cortes entre canciones; la cola sigue siendo de Waves.

> Origen (2026-11-14): el SDK `@tidal-music/player` recibe manifiestos FULL con la sesión web,
> pero el CDN de audio responde 403 (Error 54113) a todo origen que no sea `tidal.com`. tidal-hifi
> resuelve la reproducción cargando `tidal.com` dentro de Electron y controlándolo desde fuera.
> Spike OK: una canción por id suena completa (16-bit 44.1kHz) en una ventana `tidal.com` que
> comparte la partición persistente del login.

- Ventana oculta "motor" con `tidal.com` (partición `persist:tidal-web`) + controlador en main
  (`tidalWebPlayer.ts`): `playTrack(id)`, pause/resume, seek, volumen; lectura periódica del estado
  (track, posición, duración, estado) enviada al renderer por IPC.
- Waves conserva su propia cola (smart shuffle, conteos): al terminar una canción ordena la siguiente.
- `playerStore`/`playbackService` pasan a usar el motor; el SDK queda (o no) como respaldo de previews.
- Riesgo: depende de internals de la web de TIDAL (selectores `data-test`, acciones Redux), que cambian.

## Phase 4 — Smart Shuffle + Local Stats ✅ (2026-11-15)

*Antes: Phase 3 (renumerada).*

- `playCountRepository.ts`: incrementar play count cuando un track pasa los 30 s de
  reproducción — usar el evento `media-product-transition` del SDK como señal, no el inicio
  del track.
- `smartShuffle.ts` — algoritmo:
  1. Consultar play counts de todos los ids del contexto actual.
  2. Tracks sin registro → play count 0 (máxima prioridad). Nota del desarrollador: para evitar que una cancion nueva se tenga que reproducir 300 veces para estar a la par con las demas (por ejemplo), cuando se agregue una cancion nueva a la lista, se le colocara por defecto la mediana de conteos de todas las canciones, asi una cancion nueva estara a un nivel parecido de las demas canciones. Si tenias una mejor idea para esto, proponlo cuando estes evaluando todo
  3. Agrupar en buckets por play count.
  4. Shuffle aleatorio dentro de cada bucket (evita el feel robótico y balancea plays).
  5. Concatenar buckets de menor a mayor play count.
  6. Devolver la lista ordenada al renderer como la nueva cola.
- El threshold de 30 s se guarda en `user_preferences` y es ajustable.
- Re-agregar los IPC `stats:*` (`incrementPlayCount`, `getSmartShuffleQueue`).

## Phase 5 — Cloud Sync con Turso ✅ (2026-11-15)

*Antes: Phase 4 (renumerada).*

- Crear una base Turso (free tier suficiente para un solo usuario).
- `tursoSync.ts`: al arrancar, pull de filas remotas a local; en cada write de play count,
  también a Turso. Sin resolución de conflictos — last write wins.
- Requiere `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en `.env`.

Nota del desarrollador: cree una cuenta en Turso y cree una BD llamada waves-db, anote la url que me daba en el env, para el auth token no se bien a que se referia, vi una opcion en Settings > API Tokens y cree uno llamado waves-token, lo copie y lo pegue en el .env, si no era ese dime cuando estes revisando y planeando y lo hago. Pero si era eso, creo que con eso ya tienes acceso

## Phase 6 — Mobile Remote Control ✅ (2026-11-16; falta probar con un teléfono real)

*Antes: Phase 5 (renumerada).*

- `remoteControl.ts`: servidor `ws` en `REMOTE_CONTROL_WEBSOCKET_PORT`.
- `MobileRemoteView.tsx`: ruta `/remote` — el teléfono abre el PWA en su navegador, sin
  instalar nada.
- Código QR generado in-app con la IP local + puerto WebSocket; el teléfono escanea para
  emparejar.
- Eventos: `play`, `pause`, `next`, `previous`, `set_volume`, `state_sync` (push de track,
  artwork URL, progreso, volumen en cada cambio de estado).

## Phase 7 — Favorites ✅ (2026-11-15; solo Favorites, sin playlist global)

*Antes: Phase 6 (renumerada).*

- Global playlist: unión de todos los liked tracks + tracks de todas las playlists,
  deduplicada por id. Computada on-demand desde la v2 API.
- Favorites playlist: top N por `play_count` con `last_played_at` en los últimos 30 días
  (ventana configurable en `user_preferences`). Computada desde SQLite local — sin API.
- Ambas son virtuales — nunca se escriben de vuelta a TIDAL.

Nota del desarrollador: se elimino la parte de playlist global ya que seria demasiado pesado a nivel de api y el resultado no tendria tanto valor, solo se hara lo de favorito por X cantidad de tiempo 

## Phase 8 — Cache local de metadata ✅ (2026-11-16; opcional, interruptor en Ajustes)

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

## Phase 9 — Pulido desde `details.md` ✅ (2026-11-16/17)

Archivada en `specs/history/2026-11-17-details-y-windows.md`. Seis bloques: configuración sin `.env` (`settings.ini`,
secretos cifrados, carpeta de datos movible), Windows (log en archivo, arreglos a ciegas),
barra lateral y detalles visuales, listas/cola/barra inferior, panel "Now playing" con letras
sincronizadas y créditos (API v2: `tracks/{id}/relationships/lyrics|credits`), y edición de
playlists (nombre, descripción, portada) con créditos del álbum.

Hallazgos: letras y créditos solo los da la API v2 a la sesión web (el token de la app recibe
vacío); la portada de playlist no se puede cambiar con el token de la app (403 en `/artworks`,
sugeridas vacías). En Windows la pantalla en blanco del `.exe` era la ruta `file:///C:/…` (resuelta
con `HashRouter`) y la falta de sonido, la licencia Widevine negada sin firma VMP de producción
(`ACCESS_DENIED`, S6007): se firma con castlabs EVS (`npm run vmp:sign` y hook `afterSign`).

## Phase 10 — Publicación en GitHub y actualizaciones automáticas 🔄 (sesión en `specs/actual.md`)

> Origen (2026-11-17): el repo es público y la 0.5.1 se sube a mano como primera release de
> GitHub. La siguiente versión trae `electron-updater` (dependencia aceptada) con **GitHub
> Releases como servidor de actualizaciones**: sin servidor propio y, al ser público, sin token
> dentro de la app. La 0.5.1 no lleva el updater, así que la primera versión con él se instala a
> mano una vez; desde ahí se actualiza sola.

**Cómo funciona (acordado)**
- `electron-builder.yml` gana `publish: { provider: github, owner: JoelGrullon12, repo: waves-desktop }`.
  Al publicar se suben a la release: `*.exe` + `*.exe.blockmap` + `latest.yml` (Windows) y
  `*.AppImage` + `latest-linux.yml` (Linux). La release tiene que quedar **publicada**: el
  updater ignora borradores, y las pre-releases solo con el canal beta encendido.
- La app lee el `latest.yml` de la última release y lo compara con `app.getVersion()` (semver).
- Lo que descarga es **el instalador nsis de la versión nueva**, no la carpeta desempaquetada,
  pero en **diferencial**: con los `.blockmap` de la versión vieja y la nueva baja solo los bloques
  que cambiaron y reconstruye el instalador a partir del de la versión actual (nsis lo guarda en
  `%LOCALAPPDATA%\waves-desktop-updater`). Si el diferencial falla, baja el instalador entero.
  Verifica el sha512 antes de usarlo. Los binarios de Electron casi nunca cambian, así que la
  descarga suele ser una fracción de los ~125 MB; cuando se actualiza el fork de Electron, casi todo.
- El instalador nsis **no** es diferencial: corre en silencio y reemplaza todos los archivos del
  programa (segundos). No toca `userData` ni la carpeta de datos (`settings.ini`, BD,
  `app-secrets`, sesión web, CDM de Widevine).
- Linux: la AppImage se reemplaza por la nueva (también con blockmap). El `.deb` no se
  autoactualiza; en Bazzite (inmutable) la vía es la AppImage.
- Los `.blockmap` de releases anteriores deben quedarse en GitHub (el diferencial los necesita).

**Comportamiento (decidido 2026-11-17, ver Decisiones)**
- Primera versión con updater: **0.6.0**.
- Busca al arrancar y cada 6 h (más un botón en Settings); **pregunta antes de descargar**
  ("Versión X disponible · Descargar"); descargada, "Reiniciar para actualizar" o se instala al cerrar.
- Canal beta opcional (interruptor en Settings, `allowPrerelease`); por defecto solo estables.
- Publicación: cada máquina sube a una release **en borrador** del mismo tag (Windows desde el PC con
  Windows por la firma VMP, Linux desde Bazzite) y el usuario la publica a mano en GitHub.
- Linux: AppImage + `.deb` en cada release; solo la AppImage se autoactualiza.

**Que hay que hacer**
- [ ] Release 0.5.1 a mano (primera de GitHub, sin updater): revisión de repo público (sin secretos
  en el historial), tag `v0.5.1`, AppImage + `.deb` de Linux, `.exe` firmado con VMP, notas.
  **Sesión 2026-11-17** (`specs/actual.md`); el resto de la fase (updater) va en una sesión posterior.
- [ ] Dependencia `electron-updater`.
- [ ] `publish` y `artifactName` sin espacios en `electron-builder.yml` (GitHub cambia los espacios
  de los assets por puntos y el `latest.yml` dejaría de apuntar al archivo).
- [ ] `electron/main/appUpdater.ts`: búsqueda, descarga, instalación y eventos; IPC `updater:*` con
  `handleTrusted`; todo al `main.log`. Sin efecto en `npm run dev` (app sin empaquetar).
- [ ] UI: estado en Settings (versión actual, "Buscar actualizaciones", "Descargar", progreso,
  "Reiniciar para actualizar", interruptor beta) y un aviso discreto en la barra lateral cuando hay
  una versión disponible o lista para instalar.
- [ ] `scripts/packageApp.mjs`: modo publicar (`--publish`) con un `GH_TOKEN` de escritura del
  desarrollador en el entorno (nunca empaquetado). En Windows la firma VMP sigue siendo obligatoria:
  no se publica nada con `WAVES_SKIP_VMP=1`.
- [ ] Docs: `AGENTS.md` (updater, publicación, repo público) y `README.md` (cómo sacar una release).
- [ ] Prueba real: versión con updater instalada → publicar una versión de prueba → se actualiza en
  Windows y en la AppImage, sigue sonando (VMP) y conserva datos y sesión.

**Criterio de aceptacion.** Desde una versión instalada con el updater, publicar una release en
GitHub basta para que Windows (nsis) y Linux (AppImage) se actualicen sin reinstalar a mano,
reproduzcan FULL y conserven configuración, BD y sesión.

## Phase 11 — Detalles extra y mejora del control remoto ⏳

> Origen: `details.md` (notas personales, fuera de git; 2026-11-17). Se hace **después de la
> Phase 10**. Las propuestas del final dependen de lo que exponga la API de TIDAL: primero se
> investigan y se decide con el usuario.

**Detalles visuales**
- El panel de la cola empuja y estrecha el contenido en vez de taparlo (el like de las filas sigue visible).
- Al cerrar "Now playing" se cierra también la cola si se abrió con él; si ya estaba abierta, se queda.
- Animaciones de cierre: "Now playing" baja al cerrarse; la cola entra y sale de lado.
- Pantallas grandes: la info de la canción (portada, título, artista) se centra en alto y en ancho,
  sin tapar la cola.
- Portada de la pantalla de detalle (playlist/álbum/artista) un 20 % más grande.
- Barra lateral de playlists un 15 % más ancha y sus portadas un 25 % más grandes.
- Scrollbars propias, discretas y minimalistas, que siguen el tema claro/oscuro (cola, letras, etc.).
- Barra de título propia (ventana sin marco): logo, minimizar, maximizar y cerrar; fuera la barra
  blanca con menús File/Edit en Linux y Windows.
- Library: el combobox de orden al lado del switch de tipo.
- Barras de progreso y volumen: tramo recorrido relleno; el círculo oculto hasta el hover y a la
  mitad de tamaño.

**Features y QOL**
- Letras: al desplazarse a mano se desincronizan y se quedan ahí; un botón arriba a la derecha
  vuelve a sincronizarlas (como el cliente oficial).
- Ordenar canciones por nombre, artista, álbum, duración, etc.
- Diálogo "Añadir a playlists": crear una playlist nueva y quitar de playlists en el mismo diálogo.
- Selección de canciones con clic, Ctrl y Shift; añadir la selección a playlists (ignorando las que
  ya la tengan) o crear una playlist nueva con ella.
- Volver atrás a la búsqueda conserva la búsqueda y sus resultados.
- Compartir la configuración entre clientes a través de la BD online (Turso).

**Features extra**
- Segundo plano con icono en la bandeja: cerrar la ventana deja sonando la música y el servidor del
  control remoto; la bandeja reabre la ventana o cierra la app. Ajuste para elegir entre ocultar a
  la bandeja o cerrar.
- Botones atrás/adelante arriba a la izquierda del panel principal (no en la barra lateral), como
  un navegador. **Requisito de ligereza:** el historial guarda solo referencias de páginas, no
  sus datos; al volver, la página se carga de nuevo (de la API o del disco/BD según su origen).
  Gracia de ~1 min: los datos de la página anterior/siguiente se liberan si el usuario no vuelve en
  ese tiempo. El motor de reproducción no cambia (si TIDAL precarga la siguiente, que siga).
- Compartir la cola actual entre dispositivos a través de la BD online, para dejar de escuchar en
  uno y seguir en otro.

**Control remoto (teléfono)**
- Rediseño en la línea de la app de escritorio, con los mismos iconos (sin emojis).
- Shuffle y repeat junto a anterior/siguiente.
- Info de la canción actual: conteo, playlists que la contienen, like (con poner/quitar) y créditos.

**Propuestas (investigar antes de planear)**
- Marcas de explícito / creado con IA en canciones y álbumes, si la API lo expone.
- Versiones explícita/limpia de un álbum, para elegir una.
- Portadas animadas de álbumes.
- Recomendaciones de canciones al final de las playlists, si TIDAL las expone.
- Icono de la app en Wayland (hoy sale el genérico): `desktopName` + `linux.syncDesktopName: true`
  en electron-builder (antes en el backlog).
- Ver y controlar la cola desde el control remoto: proponer plan y medir el peso en el WebSocket;
  si la cola entera pesa demasiado, solo un tramo cercano.
- Letras sincronizadas en el control remoto, con la misma evaluación de peso.

## Backlog / ideas sin fase

- **Plan B de reproducción:** `web-auth:get-playback-stream` ya consulta
  `playbackinfopostpaywall/v4` (audioquality=LOSSLESS, assetpresentation=FULL, patrón de
  hifi-api). Solo como alternativa si TIDAL cambia v2 o revoca scopes. No implementado.
- **Pull-to-refresh / refetch por tiempo** de la colección (puede subsumirse en la Fase 3).
- Probar el control remoto con un teléfono real y las teclas multimedia del teclado físico.
- `catalog:get-mixes` devuelve 404 en esta cuenta: la fila de mixes de Home queda vacía.

---

## Fase C — Consolidación y plug-and-play 🔄

> **Sesión 3 (cerrada 2026-11-14):** seek/polling, CDM automático desde el CRX, hardening de main, credenciales en el primer arranque, login FULL en ventana propia (client web nuevo, `--no-zygote`). El audio FULL con el SDK queda bloqueado por el CDN (403, Error 54113); spike del motor web de TIDAL OK. Archivada en `specs/history/2026-11-14-fase-c-hardening-y-login-full.md`. **Siguiente:** Phase R (motor de reproducción con el reproductor web de TIDAL), que desbloquea el criterio "reproduce FULL".
>
> **Sesión 2 (cerrada 2026-10-22):** reproducción FULL arreglada (CDM instalado desde el CRX oficial), bugs del renderer, salto de temas no disponibles. Archivada en `specs/history/2026-10-22-fase-c-reproduccion-y-renderer.md`. **Siguiente (sesión 3):** hardening de main y plug-and-play (incluye automatizar el CDM).
>
> **Sesión 1 (cerrada 2026-10-22):** base verde + calidad (Node 22, Most Listened fuera de Home, commit de Home, ESLint, Vitest, `verify`, docs). Archivada en `specs/history/2026-10-22-fase-c-base-verde-calidad.md`. 

> Se ejecuta ANTES de seguir con la Fase 3 (decisión 2026-10-18). Origen: análisis del
> repo al tomar el proyecto desde OpenCode.

**Depende de.** Node 22 disponible en la máquina de desarrollo (hoy ausente en Bazzite).

**Que hay que hacer**
- [x] `npm install` + `typecheck` + `build` en verde (línea base real); Home commiteado (sesión 1, `4a7b005`).
- [x] Quitar "Most Listened"/Top 10 aleatorio de Home (vuelve en Fase 4 con play counts locales).
- [x] Vitest + ESLint + script `verify` (typecheck + lint + test + build); primeros tests en `lib/`, `queueStore` y parsers de `catalog.ts` (35 tests; parsers extraídos a `electron/main/tidalParsers.ts`).
- [x] **Reproducción (diagnosticado 2026-10-22: FULL falla con `S6001` porque `userData/WidevineCdm/` está vacío aunque la app descargó el CDM 4.10.3112.0; preview OK):** arreglar la instalación del CDM; diagnosticar con `npm run dev` y logs si hay fallas reales (CDM de Widevine, sesión FULL, preview de 30 s, cortes); arreglar los bugs de reproducción conocidos (Play colgado si falla el enrichment, `removeAt` sin reprogramar el siguiente, polling/seek, unmute fijo a 80).
- [x] Bugs del renderer (enrichment colgado, Enter en MediaCard, `removeAt`, reset de stores al logout, unmute); queda el polling/seek de `playerStore`.
- [x] Hardening de main: IDs validados (`validation.ts`), chequeo de `sender` (`handleTrusted`), CSP en build, timeouts de 15 s, servidor OAuth con timeout/error, permisos 0o600 (sesión 3).
- [x] Credenciales TIDAL pedidas en el primer arranque (guardadas con `safeStorage`); `.env` solo override de desarrollo (sesión 3).
- [x] Widevine en Linux: instalar automáticamente el CRX oficial cacheado por el Component Updater en `userData/WidevineCdm/` si falta (lector ZIP propio sobre `node:zlib`, sin dependencias nuevas; sin CDM vendorizado).
- [x] Login FULL sin pegar el `code`: el spike de Device Authorization falló (2026-10-23: `Client is not a Limited Input Device client`, HTTP 400) y se implementó el plan B, una ventana de login que captura la redirección automáticamente.
- [x] Validar clon limpio → `npm install` → `npm run dev` → `package:*` en Bazzite y Windows (Windows 10, 2026-11-17, con la firma VMP).
- [x] Sincronizar docs (`.env.example` depurado en la sesión 3): IPC, rutas, árbol y variables realmente leídas ya hechos en la sesión 1; falta `.env.example` (quitar variables que nadie lee o marcarlas como reservadas).

**Criterio de aceptacion.** `npm run verify` verde en Linux y Windows; un clon limpio abre,
inicia sesión y reproduce FULL sin pasos manuales ocultos; el paquete arranca sin `.env` del repo.

## Preguntas abiertas (no se asumen)

- ~~**Fase C / CDM**~~ (resuelta, ver Decisiones): si el CDM descargado por la app (fuente oficial de Google) se instala bien, ¿se adelanta el vendorizado/instalación automática? Recomendado: no en la sesión 2.

**Phase 10 — Publicación y actualizaciones (2026-11-17):** las 5 preguntas se resolvieron el
2026-11-17 (ver Decisiones). Queda la licencia del repo público, abierta en `specs/actual.md`.

## Decisiones tomadas

- **Motor de reproducción (2026-11-15):** el reproductor web de TIDAL en ventana oculta sustituye al SDK; control por acciones Redux de la página (iniciar, encolar la siguiente, pausa/seek/volumen) y estado leído por sondeo. La regla "el SDK es la única vía" de `AGENTS.md` queda reemplazada.

- **Prioridad (2026-10-18):** consolidar y lograr plug-and-play antes de nuevas features de Fase 3.
- **Most Listened (2026-10-18):** se pospone a la Fase 4; no hay endpoint público en TIDAL.
- **Calidad (2026-10-18):** Vitest + ESLint + `verify`.
- **Credenciales (2026-10-18):** se piden en el primer arranque, no se empaquetan.
- **Widevine (2026-10-18, revisada 2026-10-23):** ya no se vendoriza el CDM; se instala desde el CRX oficial cacheado. (Antes: "el repo debe seguir privado"; ver "Repo público".)
- **Repo público (2026-11-17):** el repo pasa a ser público y la app se publica en GitHub Releases. El CDM, `.env`, `app-secrets` y los tokens siguen fuera de git y de las releases.
- **`electron-updater` (2026-11-17):** se acepta como excepción a "cero dependencias nuevas" (diferencial con blockmap e instalación en Windows no compensan a mano). Servidor de actualizaciones: GitHub Releases (Phase 10).
- **Updater: versión, descarga y frecuencia (2026-11-17):** primera versión con updater 0.6.0; pregunta antes de descargar y, descargada, se instala al reiniciar o al cerrar; busca al arrancar y cada 6 h, más botón manual.
- **Canal beta (2026-11-17):** interruptor en Settings para recibir pre-releases (`allowPrerelease`); apagado no baja de versión, espera a la siguiente estable.
- **Publicación de releases (2026-11-17):** borrador en GitHub al que suben ambas máquinas; el usuario lo publica a mano. Sin CI (la firma VMP necesita la cuenta EVS). Linux: AppImage (autoactualizable) + `.deb` (manual).
- **Uso personal con repo público (2026-11-17):** la regla "Personal use only / nunca se distribuye" de `AGENTS.md` se reescribe: proyecto personal con repo y releases públicos; cada usuario pone su propia cuenta TIDAL y credenciales del dashboard; nada de TIDAL (CDM, streams, tokens) va en el repo ni en las releases.
- **`--no-zygote` (2026-11-14):** flag de Linux para no depender de un zygote que puede morir (ventana de login en blanco).
- **Sin esquivar controles de TIDAL (2026-11-14):** no se falsea `Origin`/`Referer` ni la huella de la ventana; el audio completo se obtiene con el propio reproductor web de TIDAL (Phase R).
- **Primer arranque sin red (2026-10-23):** se acepta quedar sin DRM hasta el siguiente arranque con red (la app no funciona offline).
- **Device Authorization (2026-10-23):** no funciona con el client web; se usa una ventana de login embebida.
- **Client web (2026-11-14):** TIDAL pasó el reproductor web a `tidal.com` con client `49YxDN9a2aFV6RTG` y redirect `https://tidal.com/login/auth`; el client anterior (`CzET4vdadNUFQ5JU`, `listen.tidal.com`) da "Algo salió mal". Si vuelve a fallar, copiar la URL real de `login.tidal.com/authorize` desde DevTools del navegador.
- **Dependencias (2026-10-23):** cero dependencias npm nuevas; solo built-ins de Node/Electron.
- **Feed de lanzamientos (2026-10-18):** se mantienen N llamadas por artista.
- **Documentación (2026-10-18):** estática en `AGENTS.md`; `CLAUDE.md` la importa; sesiones en `specs/`.
- **Limpieza de OpenCode (2026-10-22):** se elimina `.opencode/` y el prompt de cierre antiguo; el historial vive en `specs/history/`.
- **CDM (2026-10-22):** el vendorizado/instalación automática se hace en la fase plug-and-play, no en la sesión 2.
- **Estilo de commits (2026-10-22):** mensaje en inglés que empieza con un verbo en imperativo, sin prefijos `feat()`/`fix:` y sin trailers de atribución.
