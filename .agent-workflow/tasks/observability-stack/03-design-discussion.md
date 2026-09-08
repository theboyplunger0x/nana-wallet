# Design discussion r4: Nana observability

## Revision note

Ramiro aclaró que necesita ver la conversación, las búsquedas, los argumentos y resultados de cada tool call, además de sus errores y latencias. También decidió no incorporar OpenTelemetry como componente del stack. Esta revisión reemplaza `r3`.

## Current state

Nana tiene logger de Fastify, errores por consola, métricas in-memory sin wiring y un recorder de trazas usado sólo por tests. `record: false` desactiva toda la observabilidad de sesión de LiveKit. No hay backend externo configurado.

## Desired state

El stack inicial usa dos productos, cada uno con una responsabilidad distinta:

```text
Web / SSR / Fastify / worker ------> Sentry
                                     errores, releases, alertas

LiveKit voice session ------------> LiveKit Agent Insights
                                     conversación, tool calls, resultados,
                                     trazas, métricas y logs de sesión
```

LiveKit usa OpenTelemetry internamente para sus spans, pero Nana no lo configura ni lo opera. El diseño no agrega Collector, SDK adicional ni exporter OTLP propio.

## Options

### A. LiveKit Agent Insights only

- Es la opción con menos servicios.
- Cubre turnos, STT, LLM, TTS, tools, tokens, latencia y logs dentro de una sesión.
- No captura bien errores del frontend, SSR, Fastify ni eventos del worker fuera de sesión.

### B. LiveKit Agent Insights + Sentry

- LiveKit concentra la observabilidad especializada del agente de voz.
- Sentry concentra errores de aplicación, crashes, releases y alertas fuera de sesión.
- Evita duplicar las mismas trazas en Langfuse.
- Mantiene dos interfaces de diagnóstico, pero sus responsabilidades no se solapan.

### C. Sentry + OpenTelemetry como destino único

- Reduce la observabilidad externa a Sentry y permite trazas distribuidas.
- Requiere exportar y adaptar los spans de LiveKit.
- La integración JavaScript de LLM Monitoring documentada por Sentry está orientada a Vercel AI; Nana usa LiveKit Agents. La vista de voz sería menos directa y exigiría instrumentación manual.

### D. LiveKit Agent Insights + Sentry + Langfuse

- Añade análisis LLM especializado, evaluaciones, datasets y gestión de prompts.
- Duplica trazas, costos, acceso, sampling y políticas de datos.
- No resuelve una necesidad actual que LiveKit Agent Insights no cubra.

## Recommendation

Adoptar B: LiveKit Agent Insights + Sentry. No incorporar Langfuse ni LangSmith en la primera implementación.

1. LiveKit recibe la conversación, las trazas, las métricas y los logs de sesión. Audio permanece apagado. La configuración escribe todas las categorías: `record: { audio: false, transcript: true, traces: true, logs: true, redaction: false }`.
2. La configuración del proyecto de LiveKit también debe tener PII redaction apagado. `redaction: false` a nivel de sesión no puede desactivar una redacción habilitada en el proyecto.
3. Cada span `function_tool` conserva nombre, argumentos, resultado, estado de error y duración. La historia de sesión conserva el mensaje del usuario, la respuesta del agente, la tool call y su output.
4. Antes de habilitar logs de sesión, se sanea el error body del proveedor para que secretos, headers y tokens de autorización no entren en LiveKit. Si el test falla, el rollout empieza con `logs: false`.
5. Sentry recibe excepciones, crashes, releases y alertas del browser, SSR, Fastify y worker. Replay, user IP, request bodies y breadcrumbs con contenido quedan apagados inicialmente.
6. Pino sigue siendo la fuente de logs del servidor. Los eventos fuera de sesión pueden llegar a Sentry mediante integración del runtime o log drain, después del mismo control de campos.
7. Nana no incorpora configuración propia de OpenTelemetry. Si LiveKit lo usa internamente, ese detalle queda encapsulado en su SDK.
8. `record: false` permanece como kill switch. Una falla de telemetría nunca bloquea un turno ni una transferencia.

## Why Langfuse is deferred

Langfuse pasa a ser una extensión opcional. Se reconsidera sólo si el equipo necesita evaluaciones automáticas, datasets de regresión, versionado de prompts, comparación profunda entre modelos o retención de trazas de agente mayor a 30 días. Tokens, uso, latencia, tools y etapas STT-LLM-TTS ya están disponibles en LiveKit Agent Insights.

## Data and retention contract

LiveKit Agent Insights conserva durante 30 días:

- mensaje del usuario y respuesta del agente;
- nombre, argumentos, resultado y error de cada tool call;
- búsquedas realizadas y resultados devueltos por las tools;
- métricas de STT, LLM y TTS, tokens, timings e interrupciones;
- IDs de sesión, trace/span IDs, proveedor y modelo.

Forbidden fields in both destinations:

- secrets, claves privadas, seed phrases, authorization headers y binding tokens;
- cookies, credenciales de proveedores y variables de entorno;
- dumps completos de request/response de infraestructura que no forman parte de la conversación o del resultado visible de una tool.

Direcciones, montos, nombres y resultados financieros pueden aparecer en la conversación o en una tool call y, por lo tanto, quedan almacenados en LiveKit durante 30 días. Esto requiere acceso limitado al equipo autorizado, aviso de privacidad y un test que pruebe que nunca salen secretos. La retención de Sentry se configura con el menor período que permita el plan seleccionado.

## Dashboard and alerts

LiveKit responde por sesión:

- porcentaje de turnos que llega a estado terminal;
- p50/p95 de STT, end-of-turn, agente, first audio y total;
- tokens, uso por modelo, tools y errores del pipeline;
- interrupciones y fallas por proveedor o modelo.

Sentry responde por aplicación:

- crashes y errores por runtime, release y environment;
- fallas del worker fuera de sesión, startup y dispatch;
- errores de API, SSR y browser;
- alertas por regresión de errores y crash loops.

## Rollout and stop conditions

Cada destino empieza con un transport capturado por tests. Luego se usa un proyecto de desarrollo y un canary sintético con secretos falsos, nombres, direcciones, montos y hashes. El rollout se detiene si un campo prohibido sale del proceso, si la telemetría afecta latencia o transferencias, si falla el kill switch o si no puede verificarse la retención.

## Open controlling question

¿Aprobamos almacenar durante 30 días en LiveKit la conversación y los argumentos/resultados de las tools, incluidas direcciones y montos que formen parte de la interacción, excluyendo siempre secretos y credenciales?

Default recomendado: sí, porque es el requisito necesario para ver qué pidió el usuario, qué buscó cada tool y qué respuesta recibió. El acceso debe quedar restringido y auditado.

## Explicit decisions proposed in r3

- LiveKit Agent Insights concentra trazas, métricas y logs de sesión.
- LiveKit conserva conversación, argumentos y resultados de tools durante 30 días.
- Sentry concentra errores de aplicación, releases y alertas.
- Langfuse y LangSmith quedan fuera del stack inicial.
- No se instala ni se opera OpenTelemetry fuera de lo que ya incluye LiveKit.
- Audio no se exporta. Secretos y credenciales nunca se exportan.
- `record: false` permanece como kill switch.
- Aprobar este documento no autoriza implementación ni habilitación externa.

## Superseded approval record

Gate ID: `RPI-OBS-DESIGN-001`
Owning artifact / revision or hash: `03-design-discussion.md` revisión `r1`.
Status: superseded
Invalidated by: aceptación de la retención de 30 días y pedido de reducir herramientas, 2026-09-03.

Gate ID: `RPI-OBS-DESIGN-002`
Owning artifact / revision or hash: `03-design-discussion.md` revisión `r2`.
Status: superseded
Invalidated by: requisito de observar conversaciones, búsquedas y argumentos/resultados de tool calls, 2026-09-03.

## Approval record

Gate ID: `RPI-OBS-DESIGN-003`
Decision / allowed mutation: aprobar revisión `r3` y autorizar únicamente un structure outline documental.
Explicit exclusions: código, dependencias, secretos, cuentas, exporters activos, grabaciones, commits, push, PR y despliegue.
Owning artifact / revision or hash: `03-design-discussion.md` revisión `r3`.
Decision owner: Ramiro.
Approved by / trusted identity: Ramiro, user confirmation in conversation
Approved at: 2026-09-03T17:25:00-03:00
Status: approved
Invalidated by:

Gate ID: `RPI-OBS-DESIGN-004`
Decision / allowed mutation: aprobar revisión `r4` y actualizar únicamente el outline documental.
Explicit exclusions: código, dependencias, secretos, cuentas, exporters activos, grabaciones, commits, push, PR y despliegue.
Owning artifact / revision or hash: `03-design-discussion.md` revisión `r4`.
Decision owner: Ramiro.
Approved by / trusted identity: Ramiro, user confirmation in conversation
Approved at: 2026-09-03T17:25:00-03:00
Status: approved
Invalidated by:
