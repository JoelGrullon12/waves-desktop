# Sesion actual

## Objetivo
**Phase R — Motor de reproducción con el reproductor web de TIDAL** (ver `ROADMAP.md`); desbloquea el criterio "reproduce FULL" de la Fase C.
Criterio propuesto: desde la UI de Waves, Play/Pausa/Siguiente/Seek/Volumen suenan completos a través de `tidal.com` en una ventana oculta, conservando la cola de Waves; `npm run verify` verde.

## Plan
(Borrador desde la sesión anterior; se confirma en `/flujo:inicio`.)
Prefijo de comandos: `source ~/.nvm/nvm.sh && nvm exec 22 <cmd>`.
- [ ] 1. Decidir las preguntas abiertas (regla del SDK en `AGENTS.md`, método de control, futuro del SDK).
- [ ] 2. `electron/main/tidalWebPlayer.ts`: ventana oculta con `tidal.com` en la partición `persist:tidal-web` (la de `webSessionAuth.ts`), `playTrack(id)`, pause/resume, seek, volumen.
- [ ] 3. Lectura de estado (track, posición, duración, play/pausa, fin de canción) y envío al renderer por IPC (`handleTrusted` + `validation.ts`).
- [ ] 4. Conectar `src/services/playbackService.ts` / `src/store/playerStore.ts` al motor, conservando la cola de Waves (al terminar una canción, Waves ordena la siguiente).
- [ ] 5. Docs (`AGENTS.md`: nueva vía de reproducción) y `/flujo:cierre`.

## Preguntas abiertas
- ¿Se cambia la regla de `AGENTS.md` "el SDK es la única vía de reproducción" a favor del motor web de TIDAL? Recomendado: sí, tras el spike OK.
  Respuesta:
- Control del motor: DOM (navegar + clic), store Redux de la web (`playbackControls/*`, como tidal-hifi) o mixto. Recomendado: Redux para controles, DOM solo para iniciar una canción.
  Respuesta:
- ¿El SDK `@tidal-music/player` se mantiene como respaldo de previews o se elimina? Recomendado: mantenerlo hasta que el motor esté estable.
  Respuesta:

## Referencias de la sesión anterior
- Spike OK: `tidal.com/track/{id}` en `persist:tidal-web` ya logueado; play con `[data-test="tracklist-row"][data-track-id="{id}"] [data-test="play-button"]`; media `#video-one` (`currentTime`, `duration`, `paused`). Acciones Redux de tidal-hifi: `playbackControls/PLAY|PAUSE|SKIP_NEXT|SKIP_PREVIOUS|SEEK|SET_VOLUME` (store encontrado vía `__reactFiber`).
- El SDK con la sesión web recibe el manifiesto FULL, pero el CDN responde 403 (Error 54113) a orígenes que no son `tidal.com`; no se falsea el origen.
- Pendientes heredados: pruebas manuales (seek, CDM desde cero, arranque sin `.env`, `npm start` con CSP) y validación en Windows 11.

## Hecho

## Decisiones (y por que)

## Pendiente / proximos pasos

## Estado del repo
