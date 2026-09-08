# Structure outline r2: full session observability

Este outline deriva del diseño aprobado en `03-design-discussion.md` revisión `r4`. Describe slices de implementación; no autoriza ejecutarlas.

## Slice 1: data boundary and secret scrubber

Outcome: una allowlist de eventos permite conversación, tool calls, argumentos, resultados, errores y latencias, y rechaza secrets, credenciales y headers de autorización antes de emitir telemetría.

Files or modules:

- `src/config/privacy.ts`
- `src/observability/voice-trace.ts`
- `src/observability/voice-metrics.ts`
- tests nuevos bajo `tests/` para payloads permitidos y prohibidos.

Automated checks: unit tests de allowlist, redacción de errores del proveedor, bloqueo de campos desconocidos y `record: false`.

E2E or real-route check: ejecutar una sesión sintética con una tool que reciba una búsqueda, produzca un resultado y fuerce un error; capturar el payload antes del transporte y verificar que no contiene secrets.

Manual checks: revisar que los argumentos y resultados visibles no se trunquen y que los IDs permitan correlacionar turno, span y tool call.

Stop condition: cualquier secret, credencial o header aparece en un payload; no continuar con destinos externos.

## Slice 2: LiveKit Agent Insights

Outcome: cada sesión de voz muestra conversación, tool calls, argumentos, resultados, errores y latencias en Agent Insights durante la retención de 30 días.

Files or modules:

- `src/livekit/worker.ts`
- configuración de proyecto LiveKit Cloud y documentación operativa.

Automated checks: test de opciones explícitas `audio:false`, `transcript:true`, `traces:true`, `logs:true`, `redaction:false`; test de kill switch y de flush al terminar la sesión.

E2E or real-route check: canary en un proyecto de desarrollo con una tool real de búsqueda y datos sintéticos; verificar en el dashboard la timeline y el detalle de argumentos, output, duración y error.

Manual checks: confirmar acceso restringido, redacción previa de secrets y retención de 30 días; comprobar que no se habilitó audio.

Stop condition: Agent Insights no muestra el detalle requerido, el canary filtra un secret o la telemetría bloquea el turno.

## Slice 3: Sentry for application failures

Outcome: browser, SSR, Fastify y worker reportan errores, crashes, releases y alertas; Sentry no duplica el contenido de conversación ni los outputs de tools.

Files or modules:

- nuevo bootstrap de Sentry por runtime;
- `src/server.ts` y entrypoint del worker;
- configuración de source maps y log drain de LiveKit Cloud.

Automated checks: tests de captura de excepciones, scrubbing de request bodies, headers, breadcrumbs y user IP; verificación de release y environment.

E2E or real-route check: provocar un error sintético en browser, API y worker; verificar el issue en Sentry y que el evento no contiene transcript, argumentos ni resultados de tools.

Manual checks: revisar ownership, alertas, sampling y período de retención del plan.

Stop condition: Sentry recibe contenido de conversación, secrets o eventos duplicados de cada tool call.

## Slice 4: operational dashboard and failure drill

Outcome: el equipo puede responder una pregunta de negocio desde una sesión hasta un error de aplicación sin una tercera plataforma.

Files or modules:

- dashboards y alertas de LiveKit Agent Insights;
- dashboards y alertas de Sentry;
- `90-verification.md` con evidencia.

Automated checks: smoke de correlación por `trace_id`, `turn_id`, `tool_call_id`, provider, model y release; prueba de caída del transporte sin afectar la sesión.

E2E or real-route check: ejecutar una sesión con dos tools, una respuesta exitosa y una fallida; seguirla desde Agent Insights hasta el issue de Sentry generado por el worker.

Manual checks: revisar que una persona autorizada encuentre qué se buscó, qué devolvió la tool, cuánto tardó y qué respondió el agente.

Stop condition: no se puede reconstruir la secuencia completa o el fallo del destino altera el comportamiento del agente.

## Superseded outline

La revisión `r1` queda supersedida porque incluía OpenTelemetry como contrato futuro. El stack operativo actualizado sólo contiene LiveKit Agent Insights y Sentry.

## Next gate

Gate ID: `RPI-OBS-STRUCTURE-002`
Decision / allowed mutation: aprobar este outline y autorizar la implementación del Slice 1 únicamente.
Explicit exclusions: configuración de cuentas, secretos reales, activación de exporters, despliegue, commits y push.
Owning artifact / revision or hash: `04-structure-outline.md` revisión `r2`.
Decision owner: Ramiro.
Approved by / trusted identity:
Approved at:
Status: proposed
Invalidated by:
