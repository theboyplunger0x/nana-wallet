# Intake: Observability stack for Nana Wallet

## Outcome

Definir una arquitectura de observabilidad para Nana Wallet que cubra errores, logs, métricas, conversaciones y trazas de agente. Debe mostrar las búsquedas, los argumentos y resultados de cada tool call sin exportar audio, secretos, credenciales ni headers de autorización.

## Acceptance evidence

- El estado actual queda probado con rutas, comandos y la versión fijada de LiveKit Agents.
- La investigación compara LiveKit Agent Insights, Langfuse, LangSmith, Sentry y OpenTelemetry con fuentes primarias.
- El diseño asigna una responsabilidad concreta a cada servicio y define correlación, redacción, retención, muestreo y apagado.
- Las contradicciones con la política de privacidad actual quedan resueltas o registradas como decisiones abiertas.

## Granted authority

- Leer este repositorio, los otros worktrees y la documentación primaria de los proveedores.
- Descargar paquetes públicos en un directorio temporal para inspeccionar la API fijada.
- Crear y actualizar documentación bajo `.agent-workflow/tasks/observability-stack/` en la rama `docs/observability-research`.
- No instalar dependencias, provisionar servicios, usar secretos, modificar código, enviar telemetría, hacer commit, push, PR o despliegue.

## Scope

### Read scope

- Código, configuración, tests, lockfiles y documentación de Nana Wallet.
- El borrador no trackeado `docs/observability-proposal.md` del worktree de revisión de arquitectura.
- Skills y referencias del repositorio hermano `agent_workflow`.
- Documentación oficial de LiveKit, Langfuse, LangSmith, Sentry y OpenTelemetry.

### Write scope

- `.agent-workflow/tasks/observability-stack/` dentro de este worktree.

## Non-goals

- Integrar SDKs o exporters.
- Elegir o provisionar planes comerciales.
- Habilitar grabación de audio.
- Copiar el borrador anterior sin comprobarlo.
- Diseñar observabilidad general de infraestructura fuera del backend, worker LiveKit y web app.

## Route

RPI. Hace falta investigación de estado actual y una decisión integrada sobre proveedores, privacidad y distribución de señales. Oneshot no conserva el gate necesario antes de habilitar exportación externa.

## Active gate

Gate ID: `RPI-OBS-STRUCTURE-002`
Decision / allowed mutation: revisar `04-structure-outline.md`; no autoriza implementación.
Explicit exclusions: código, dependencias, secretos, cuentas, telemetría real, grabaciones, efectos externos, commits, push, PR y despliegue.
Owning artifact / revision or hash: `04-structure-outline.md` revisión `r2`.
Decision owner: Ramiro.
Approved by / trusted identity:
Approved at:
Status: proposed
Invalidated by:
