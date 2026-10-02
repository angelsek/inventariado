# Instrucciones para Claude Code

@AGENTS.md

Estado del proyecto y tareas pendientes: @docs/ESTADO_ACTUAL.md

## Regla del equipo de agentes (obligatoria)

Todo desarrollo nuevo (funcionalidad, corrección o refactor) pasa por el equipo de agentes del plugin `equipo-dev`:

- Usa `/equipo-dev:desarrollar <tarea>`: plan del arquitecto (aprobado por el usuario antes de programar),
  implementación en una rama propia, tests, revisión de calidad y seguridad, documentación y PR.
- Nunca hagas commit ni push directo a `main`. Todo entra por PR.
- Antes de cada push, `.githooks/pre-push` ejecuta la revisión del equipo y bloquea si hay hallazgos críticos o altos.
  Si bloquea, corrige y vuelve a intentarlo (`/equipo-dev:revisar` muestra el detalle). No uses `--no-verify` ni
  `EQUIPO_OMITIR=1` salvo que el usuario lo pida explícitamente.
- Cada PR tiene además la revisión "Equipo de agentes" en GitHub; no se fusiona con ese check en rojo.
- Cambios triviales (erratas, textos, formato) pueden saltarse el plan del arquitecto, pero no la revisión.
- Configuración que vive fuera del repo: el secret `CLAUDE_CODE_OAUTH_TOKEN` (para el workflow) y la protección de
  `main` en GitHub con el check «Revisión del equipo» como obligatorio.
