# Plans históricos (cerrados)

Handoffs de sesiones ya cerradas y commiteadas. Se conservan como referencia técnica
(por qué / cómo se resolvió cada cosa) — no representan trabajo en curso. El plan
activo es `2026-09-19-home-feature-plan.md`.

| Archivo | Sesión | Resultado |
|---|---|---|
| `2026-09-14-full-playback.md` | 2026-09-14 | Full-length playback vía sesión web first-party (`webSessionAuth.ts`) — `d86f41e` |
| `2026-09-15-liked-songs.md` | 2026-09-15 | Pantalla `/songs` con infinite scroll + shuffle de biblioteca completa — `4c6760b` |
| `2026-09-15-build-distribution.md` | 2026-09-15 | Causas raíz de build/packaging corregidas (postinstall, `electronDist`, Node 22) — `3126d03` |
| `2026-11-16-reproductor-completo-fases-r-a-8.md` | 2026-11-15/16 | Motor web de TIDAL, reproductor completo, play counts + smart shuffle, Turso, control remoto, Favorites, copia local de la biblioteca |

Pendiente heredado de build-distribution: validar `npm install` + `npm run dev` +
`npm run package:win` en la W11 (→ `2026-09-19-home-feature-plan.md`).