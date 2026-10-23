# Sesion actual

## Objetivo
Fase C — Consolidación y plug-and-play, **sesión 1: base verde + calidad** (ver `ROADMAP.md`).
Criterio de esta sesión: `nvm exec 22 npm run verify` (typecheck + lint + test + build) en verde y todo el trabajo pendiente de Home commiteado. El criterio completo de la Fase C (clon limpio en Linux y Windows) sigue abierto.

## Plan
Prefijo de comandos: `source ~/.nvm/nvm.sh && nvm exec 22 <cmd>`.
- [x] 1. Línea base con Node 22: `npm install`, `npm run typecheck`, `npm run build`. Verificación: ambos con código 0.
- [x] 2. Quitar Most Listened / Top 10 aleatorio de Home (`HomeView.tsx`, `weeklyTopTracks` en `lib/mediaPlayback.ts` si nadie más lo usa). Verificación: typecheck + build; Home sigue mostrando playlists, mixes y lanzamientos.
- [ ] 3. Un solo commit con Home + migración de flujo (propongo el mensaje, el usuario ordena). Verificación: `git status` limpio.
- [ ] 4. ESLint (`eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint.config.js`, script `lint`). Verificación: `npm run lint` sin errores.
- [ ] 5. Vitest (`vitest.config.ts` con alias `@`, script `test`) y tests de `lib/random`, `lib/format`, `lib/mediaProduct`, `queueStore` y parsers de `catalog.ts`. Verificación: `npm test` verde.
- [ ] 6. Script `verify`. Verificación: `npm run verify` verde.
- [ ] 7. Docs: comandos nuevos en `AGENTS.md`, `README.md`, `CLAUDE.md`; corregir nombres de IPC y rutas desactualizados en `AGENTS.md`. Verificación: revisión de consistencia.
- [ ] 8. `/flujo:cierre`.

## Preguntas abiertas
(ninguna)

## Hecho
- Bootstrap de `flujo`: `Agents.md` → `AGENTS.md`, `CLAUDE.md`, `specs/`, historial migrado desde `.opencode/plans/`, Fase C añadida al ROADMAP.
- Línea base de lectura: `npm run typecheck` pasa limpio (con Node v26 del shell).
- Eliminados `.opencode/` (ya migrado a `specs/`) y `Vamos a cerrar esta sesión de desarrollo.md`.

- Pasos 1-2: `npm install` con Node 22 (lock: bump a 0.2.0, `engines`, `hasInstallScript`; npm 10 quitó metadatos `libc` opcionales), `typecheck` y `build` en verde; Top 10 aleatorio retirado de Home (`HomeView.tsx`, `weeklyTopTracks`).

## Decisiones (y por que)
- Alcance de la sesión: base verde + calidad; auth, Widevine, bugs y hardening quedan para sesiones siguientes de la Fase C.
- Node 22 vía `nvm exec 22` en cada comando: el shell de Claude Code usa v26 y no hereda el `nvm use`.
- Home en un solo commit (decisión del usuario).
- Most Listened se pospone a Fase 4 (no hay endpoint público).

- `.opencode/` y el prompt de cierre de OpenCode se eliminan (respuesta del usuario, 2026-10-22).

## Pendiente / proximos pasos
- Resto de la Fase C: bugs del renderer, hardening de main, credenciales en primer arranque, CDM de Widevine vendorizado, login Device Authorization, validación en Windows 11.

## Estado del repo
Rama `main`, HEAD `918fab4`, 38 entradas sin commit: todo Home (catalog/auth/preload/types, vistas, hooks, store, componentes), renames staged (`Agents.md` → `AGENTS.md`, `.opencode/plans/*` → `specs/history/`), `CLAUDE.md` y `specs/` nuevos.
