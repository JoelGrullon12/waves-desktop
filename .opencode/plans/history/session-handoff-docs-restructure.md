# SESSION HANDOFF — Plan activo

Fecha: 2026-09-15 — Rama: `main`, HEAD `3126d03`.
Working tree: **limpio**. Los handoffs anteriores se archivaron en `history/`.

> El trabajo de la sesión 2026-09-15 ya está **commiteado**: `4c6760b`
> (feat(songs): liked-tracks screen) y `3126d03` (fix(build): install/dev/package).
> El `stash@{0}` es una iteración anterior **abandonada** — ignorar.

## Pendientes activos (en orden)

1. **Validar en la máquina Windows 11 (usuario):** `nvm install 22`, `npm install`,
   `npm run dev`, `npm run package:win`. Criterios: la ventana abre sin "Electron
   uninstall"; el `.exe` se genera; Widevine resuelve o se aplica el fallback de copiado
   de CDM (ver `Agents.md` → "How Widevine is delivered"). Runbook completo en
   `history/session-handoff-build-distribution.md`.

2. **Fase 3 — Reproductor completo (work items inmediatos → `ROADMAP.md`):**
   - Conectar `TrackContextMenu` a `collection.write` + navegación: Play next, Add to
     queue, Add to playlist, Remove from library, Go to album/artist.
   - Like/unlike (corazones) a `collection.write`.
   - Shuffle persistente + repeat mode en PlayerBar (estado en `queueStore`).
   - Enlaces clicables en nombres/títulos; crear `ArtistView`.
   - Home con resumen de biblioteca; feed de lanzamientos; búsqueda dentro de la colección.
   - Ajustes visuales: modo oscuro, configuración, reordenamiento, responsive.

3. **Pull-to-refresh / refetch por tiempo** de la colección (puede absorberlo la Fase 3).

## Referencias

- `history/session-handoff-liked-songs.md` — pantalla `/songs`, límites de API y lecciones técnicas.
- `history/session-handoff-build-distribution.md` — causas raíz de build/packaging y runbook W11.
- `history/session-handoff-full-playback.md` — sesión web first-party (FULL playback).
- `Agents.md` — arquitectura, stack, restricciones, runbook de build.
- `ROADMAP.md` — fases de producto (la Fase 3 es el foco actual).