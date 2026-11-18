@AGENTS.md

# Reglas propias de Claude Code

## Flujo de trabajo
- `AGENTS.md` es el que/por que; `ROADMAP.md` es el como/cuando; `specs/actual.md` es la sesion en curso.
- Al empezar usa `/flujo:inicio` (en modo Plan); al terminar, `/flujo:cierre`. No inventes alcance: si una fase depende de una decision del usuario, dejala como pregunta abierta en `ROADMAP.md`.
- Tras aprobar el plan, y **antes de escribir codigo**: guarda plan y decisiones en `specs/actual.md`, deja ahi las dudas que sigan pendientes en la seccion **Preguntas abiertas** (con opcion recomendada y espacio `Respuesta:`), y deja `ROADMAP.md` coherente con lo aprobado. Si hay preguntas abiertas, espera a que el usuario las responda en `actual.md` y de luz verde; entonces incorpora las respuestas y empieza.

## Reglas
- Las reglas de commit y push (orden del usuario, mensaje propuesto, estilo y trailer `Session:`) son globales y viven en `~/.claude/CLAUDE.md`; aqui solo se anota lo que este proyecto cambie.
- Commits en inglés: el mensaje empieza con un verbo en imperativo (`Add`, `Fix`, `Remove`, `Update`...), sin prefijos tipo `feat(scope):`/`fix:`. Sin trailers de atribución (ni `Co-Authored-By` ni `Claude-Session`).
- Node >= 22.12 (`.nvmrc`). En este entorno el shell trae Node 26 por defecto: ejecuta los comandos con `source ~/.nvm/nvm.sh && nvm exec 22 <cmd>`. Verificación: `npm run verify` (typecheck + lint + test + build).
- No introducir Tauri/Rust; usar siempre el fork castlabs de Electron y la API v2 de TIDAL (ver `AGENTS.md`).
- El repo es **público** (desde 2026-11-17): el CDM de Widevine, `.env`, `app-secrets` y cualquier token/credencial nunca se suben a git ni a una release.
