# Sesion actual

## Objetivo
Fase C — Consolidación y plug-and-play, **sesión 3: hardening de main + plug-and-play** (ver `ROADMAP.md`).
Criterio: validar IDs/`sender`/CSP/timeouts en main, credenciales en el primer arranque, instalación automática del CDM; `npm run verify` verde.

## Plan
Prefijo de comandos: `source ~/.nvm/nvm.sh && nvm exec 22 <cmd>`.
- [ ] 1. Polling/seek de `src/store/playerStore.ts` (resto del paso 5 de la sesión 2).
- [ ] 2. CDM: instalar solo el CRX descargado / vendorizar en el repo privado (`electron/main/index.ts`).
- [ ] 3. Hardening de main (validar IDs, `sender`, CSP, timeouts, servidor OAuth, permisos 0o600).
- [ ] 4. Credenciales TIDAL en el primer arranque (`safeStorage`); `.env.example`.
- [ ] 5. Spike Device Authorization para el login FULL.
- [ ] 6. `/flujo:cierre`.
(Orden y alcance se confirman en `/flujo:inicio`.)

## Preguntas abiertas
- ¿Device Authorization funciona con el client first-party `CzET4vdadNUFQ5JU`? (spike)
- Versión/origen del CDM a vendorizar (¿Git LFS o commit directo?) y si Windows lo necesita.

## Hecho

## Decisiones (y por que)

## Pendiente / proximos pasos

## Estado del repo
