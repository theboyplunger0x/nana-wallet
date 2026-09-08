# Current-state research: Nana observability

Research completed: 2026-09-03.

## Repository evidence

La base investigada es `main` en `c5bc83e875be102febe4ab5ee37ffa8bfc762cf6`. La rama de documentación es `docs/observability-research`.

`src/observability/voice-metrics.ts` mantiene contadores de fases, turnos, reconexiones, fallbacks y agregados de latencia. `src/observability/voice-trace.ts` ofrece un buffer opt-in de siete días y un sink inyectable. En `main`, ambos módulos sólo aparecen en tests; el worker y el servidor no los instancian. No existe exporter productivo.

`src/server.ts` habilita el logger Pino de Fastify fuera de Vitest. También hay `console.error` en backend, worker y frontend. `apps/nana-wallet/src/lib/lovable-error-reporting.ts` reporta errores únicamente cuando existen hooks del preview de Lovable. No hay captura de errores productiva para browser o SSR.

No hay dependencia directa ni configuración para Sentry, Langfuse o LangSmith. OpenTelemetry entra como dependencia de `@livekit/agents@1.7.1`; su presencia en `package-lock.json` no constituye una integración.

## LiveKit behavior at the pinned version

Nana inicia la sesión con `record: false` en `src/livekit/worker.ts:113-117`. La inspección del tarball oficial `@livekit/agents@1.7.1` confirmó que ese valor apaga `audio`, `traces`, `logs` y `transcript`. La misma versión admite configuración granular. Las claves omitidas quedan en `true`, por lo que una configuración segura debe escribir las cuatro categorías de forma explícita.

La versión fijada también implementa fanout. Un `NodeTracerProvider` del usuario puede enviar spans a un backend propio y permitir que LiveKit agregue su processor mediante `telemetry.FanoutSpanProcessor`. Esto evita proveedores globales en competencia.

LiveKit Cloud Agent Insights retiene su observabilidad durante 30 días. Audio y transcripciones forman parte del modo por defecto, pero pueden desactivarse por categoría. La redacción de PII está apagada por defecto a nivel de proyecto y no sustituye la prohibición de datos financieros de Nana.

Sources:

- https://docs.livekit.io/deploy/observability/insights/
- https://docs.livekit.io/deploy/observability/data/
- https://docs.livekit.io/deploy/observability/tracing/
- https://docs.livekit.io/deploy/agents/log-drains/
- Tarball npm `@livekit/agents@1.7.1`, shasum `324d173ed7bc4a76f4b818eb2777264766302bfd`.

## Data boundary findings

El contrato actual permite métricas sin contenido y limita las trazas detalladas a siete días. Producción exige aprobación, destino, rol de acceso y mecanismo de borrado en `src/config/privacy.ts`.

El redactor actual elimina direcciones EVM, varios secretos, montos reconocibles y nombres con forma de destinatario. No demuestra cobertura para frases libres, números de teléfono, correos, direcciones no EVM, nombres fuera del patrón, prompts completos o nuevos esquemas de herramientas. Los hashes SHA-256 sin sal de conversación y sala siguen siendo identificadores correlacionables. `src/api/voice.ts` registra el cuerpo de error del proveedor, una superficie que debe sanearse antes de centralizar logs.

El borrador del otro worktree acierta al separar Langfuse, Sentry y LiveKit. Sin embargo, promete que no se exportan transcripciones mientras el modelo `VoiceTurnTrace` contiene texto redactado, y propone Agent Insights sin resolver que `record: false` lo apaga por completo.

## Provider fit

| Surface | Fit for Nana | Constraint |
|---|---|---|
| LiveKit Agent Insights | Diagnóstico de pipeline, STT, LLM, TTS, interrupciones y media. | Cloud only, retención de 30 días; el default incluye audio y transcript. |
| Sentry | Errores de Fastify, worker, SSR/browser, releases y alertas. | SDK y scrubbing separados por runtime; evitar duplicar tracing LLM. |
| Langfuse | Trazas LLM, tools, latencia, uso, costos y sesiones vía OTLP. LiveKit publica un ejemplo Node directo. | La retención configurable no está en todos los planes; sin policy, self-hosted conserva indefinidamente. |
| LangSmith | Trazas, runs, threads, costos, sampling y OTLP estándar. | Nana no usa LangChain/LangGraph; la integración sería manual. SaaS usa tiers de 14 o 400 días. |
| OpenTelemetry | Contrato neutral y fanout para spans; métricas y trazas JS son estables. | Logs JS siguen en desarrollo; Collector agrega otra pieza operativa. |

Sources:

- https://langfuse.com/docs/observability/data-model
- https://langfuse.com/docs/observability/features/masking
- https://langfuse.com/docs/administration/data-retention
- https://docs.langchain.com/langsmith/trace-with-opentelemetry
- https://docs.langchain.com/langsmith/mask-inputs-outputs
- https://docs.langchain.com/langsmith/sample-traces
- https://docs.langchain.com/langsmith/data-purging-compliance
- https://docs.sentry.io/api/organizations/update-an-organization/
- https://opentelemetry.io/docs/languages/js/
- https://opentelemetry.io/docs/languages/js/exporters/

## Signal ownership

- Errores: Sentry concentra excepciones, crashes, releases y alertas.
- Trazas de agente y pipeline de media: LiveKit Insights concentra turnos, llamadas LLM, tools, latencia, uso, costo y etapas STT-LLM-TTS cuando se habilite de forma granular.
- Logs operativos: Fastify/Pino sigue siendo la fuente. Los registros warning y error sólo pueden llegar a Sentry después de aplicar una allowlist de campos.
- Métricas: LiveKit muestra las métricas por turno y sesión. Los contadores internos sin contenido permanecen neutrales al proveedor.
- Trazas externas: Langfuse no tiene responsabilidad en el stack inicial.

## Correlation model

La correlación puede usar `trace_id`, `span_id`, `service.name`, `environment`, `release`, `conversation_id_hash`, `room_id_hash`, `turn_id`, `operation`, `provider` y un outcome enumerado. Hashes públicos deben ser HMAC con una clave de rotación, no SHA-256 directo. La conversación y los argumentos/resultados de tools se conservan en LiveKit, pero no se duplican en Sentry.

## Exact gaps

1. No se verificaron cuentas, región, plan, DPA ni permisos actuales de LiveKit, Sentry, Langfuse o LangSmith.
2. No existe matriz de campos permitidos por evento ni test que rechace campos desconocidos.
3. La retención de 30 días de LiveKit está aceptada; falta verificar y configurar la retención del plan de Sentry.
4. El diseño `r3` propone Agent Insights con transcript, trazas, métricas y logs, y conserva `record: false` como kill switch; falta aprobar el gate.
5. No hay baseline de volumen, sampling, presupuesto o SLO.
6. No existe E2E que capture el payload real previo a exportación y pruebe ausencia de secrets y credenciales.

## Initial research conclusion (superseded)

Langfuse encaja mejor que LangSmith en esta base porque LiveKit documenta el fanout Node hacia Langfuse y Nana no usa LangChain. Sentry debe limitarse inicialmente a errores, releases y alertas. LiveKit Insights puede aportar diagnóstico de media sin audio ni transcript, pero sólo después de una prueba de payload y una decisión explícita de retención.

## Decision update: reduced stack

Ramiro aceptó la retención de 30 días de LiveKit el 2026-09-03 y pidió reducir la cantidad de herramientas. Con esa restricción resuelta, LiveKit Agent Insights cubre las necesidades inmediatas de trazas, métricas, uso, tokens, tool calls y logs por sesión. LiveKit aclara que los eventos fuera de sesión, como crashes, startup y dispatch, requieren un log drain o una integración externa.

Sentry cubre ese segundo dominio: errores de browser, SSR, API y worker, releases, alertas, trazas y logs estructurados. Sentry también ofrece LLM Monitoring, pero su integración JavaScript documentada está orientada a Vercel AI. Usarla como reemplazo de la vista nativa de LiveKit exigiría instrumentación manual para Nana.

OpenTelemetry no requiere una plataforma aparte. Es el contrato que LiveKit ya usa para sus spans y una salida futura hacia backends compatibles. Un Collector y un exporter OTLP propio añaden operación sin aportar valor al primer rollout.

La conclusión revisada es LiveKit Agent Insights + Sentry. Langfuse se difiere hasta que exista una necesidad concreta de evaluaciones, datasets, versionado de prompts, comparación de modelos o retención mayor a 30 días. OpenTelemetry no se incorpora al stack: queda encapsulado en LiveKit y no requiere configuración propia de Nana.

Additional sources:

- https://docs.livekit.io/deploy/observability/insights/
- https://docs.livekit.io/deploy/observability/data/
- https://docs.livekit.io/deploy/agents/
- https://docs.sentry.io/product/llm-monitoring/getting-started/
- https://docs.sentry.io/api/explore/query-explore-events-in-table-format/

## Decision update: full tool-call visibility

Ramiro aclaró que la observabilidad debe mostrar qué pidió el usuario, qué respondió el agente, qué buscó cada tool, sus argumentos, su resultado y su latencia.

La versión fijada `@livekit/agents@1.7.1` crea un span `function_tool` por ejecución. El span incluye `lk.function_tool.name`, `lk.pii.function_tool.arguments`, `lk.pii.function_tool.output` y `lk.function_tool.is_error`; su duración surge del span. La historia de sesión serializa `function_call` y `function_call_output` con argumentos y output, junto con los mensajes del usuario y del agente.

LiveKit Agent Insights puede cubrir este requisito sin Langfuse. Requiere `transcript: true`, `traces: true` y que PII redaction esté apagado. La redacción de LiveKit elimina los atributos `pii` y el contenido GenAI, incluidos los argumentos y resultados que se quieren inspeccionar. `redaction: false` en una sesión no desactiva la redacción habilitada a nivel de proyecto.

Esto cambia el contrato de datos: direcciones, montos, nombres y respuestas de tools pueden quedar almacenados durante 30 días. Secrets, credenciales, headers de autorización y claves privadas siguen prohibidos y deben bloquearse antes de emitir telemetría.

Additional source:

- https://docs.livekit.io/deploy/observability/pii-redaction/
