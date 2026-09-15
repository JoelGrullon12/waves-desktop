# SESSION HANDOFF — Build & Distribution (fase siguiente)

Fecha: 2026-09-15 — Rama: `main`, HEAD `39d7289` (docs: translate README).
Cambios SIN commitear (working tree, de la pantalla Songs): 11 modificados + 5 nuevos.
**El trabajo de esta fase de build/distribución es SOLO PLANIFICAR — no investigar
ni tocar código en esta sesión.**

> ⚠️ **No se ha resuelto aún cómo compilar/empaquetar la app fuera de esta máquina.**
> Solo se documentan los SÍNTOMAS conocidos y las hipótesis, para que la próxima
> sesión los investigue con el contexto ya escrito. El objetivo último (Phase 10 del
> roadmap, "Electron — Packaging & Distribution") sigue pendiente.

## Contexto del stack

- `package.json`:
  - `"electron": "github:castlabs/electron-releases#v44.1.0+wvcus"` (fork de Castlabs
    con Widevine/EME incluida — ver "Why Castlabs Electron" en `Agents.md`).
  - `"electron-vite": "^5.0.0"` — dev server + build del bundle.
  - `"electron-builder": "^26.0.12"` — empaquetado/instalador.
  - Scripts: `dev` / `start` (con `--noSandbox -- --in-process-gpu`), `build`,
    `package:linux` y `package:win` (ambos con electron-builder).
- NO existe `electron-builder.yml` en la raíz del repo (busca: línea/archivo inexistente).
- Dependencias del `main`: `node:sqlite`, `@tidal-music/player-sdk-web`, WebSocket
  para control remoto, TIDAL v2 API. `.env` contiene claves (TIDAL, Turso, SQLite).

## Síntomas conocidos (documentar — NO investigar ahora)

1. **Windows 11 falla con `electron-vite`.** Al intentar `dev`/`build` en W11, el
   comando de `electron-vite` falla (error no especificado aún — se registró durante
   una prueba previa del usuario).
2. **En esta máquina (Liquid Bazzite/Linux), el empaquetado da un 404 con la versión
   de electron.** `npm run build` (bundle) funciona; el fallo aparece al empaquetar
   (electron-builder) o al intentar descargar/resolver el binario de electron.
3. **La app SOLO corre en este escritorio** — no se ha validado en otra máquina aún.

## Hipótesis (para probar en la próxima sesión — no resuelto)

- El 404 al empaquetar probablemente viene de resolver el binario de electron desde
  la spec `github:castlabs/electron-releases#v44.1.0+wvcus`: electron-builder /
  electron-installer intenta descargar un tarball/release de ese fork y no lo
  encuentra (404). Verificar versión/path del binario y si el fork usa un nombre de
  release distinto.
- El fallo de W11 con `electron-vite` podría ser configuración `--noSandbox /\ --in-process-gpu`
  del script `dev`/`start` (flags pensados para Linux) o la descarga del binario de
  electron en Windows. No confirmado.

## Comandos de referencia (siguiente sesión)

- `npm run dev` — dev server + app (Linux, esta máquina).
- `npm run build` — bundle (funciona aquí).
- `npm run typecheck` — solo tipos.
- `npm run package:linux` / `npm run package:win` — empaquetado (donde falla el 404).

## Objetivos de la próxima sesión (en orden)

1. Reproducir y aislar el 404 del empaquetado en esta máquina; identificar si es
   resolución del binario de Castlabs.
2. Probar el flujo W11: instalar deps, `npm run dev`, capturar el error real de
   `electron-vite`.
3. Añadir `electron-builder.yml` con targets por SO (win/linux) y probar
   `package:*`.
4. Reevaluar si el fork de Castlabs (con Widevine) es compatible con electron-vite
   o si hace falta un fallback (binario descargado aparte / variables de entorno).
