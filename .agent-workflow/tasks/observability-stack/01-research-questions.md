# Research questions

## Scope

Estas preguntas describen el estado actual. No eligen una solución.

| Question | Why it matters | Evidence | Exclusion |
|---|---|---|---|
| ¿Qué señales produce hoy Nana y cuáles están conectadas a un destino? | Separa código existente de propuestas. | Código, imports, tests, manifiestos y variables de entorno. | No contar tests aislados como integración productiva. |
| ¿Qué deshabilita exactamente `record: false` en `@livekit/agents@1.7.1`? | Determina si Agent Insights puede activarse sin audio ni transcripciones. | Paquete npm fijado y documentación LiveKit. | No asumir que la documentación latest coincide con la versión instalada. |
| ¿Qué datos sensibles pueden aparecer en logs, errores y spans? | La wallet exige una frontera más estricta que la redacción genérica de PII. | Redactores, errores, logs y contratos de privacidad actuales. | No enviar datos para probar un proveedor. |
| ¿Cómo se reparten errores, logs, métricas y trazas entre LiveKit, Sentry y una plataforma LLM? | Evita duplicación, costos y alertas sin dueño. | Capacidades documentadas de cada servicio. | No convertir un producto en backend universal. |
| ¿Langfuse o LangSmith encaja mejor con el runtime TypeScript y LiveKit? | Ambos reciben trazas, pero la integración y el modelo de datos difieren. | Documentación OTLP, integración LiveKit y dependencias del repo. | No decidir por popularidad ni por una cuenta no verificada. |
| ¿Cómo se correlaciona una falla desde web hasta worker y operación de wallet? | Un dashboard útil necesita unir eventos sin exponer IDs sensibles. | Flujos HTTP, conversación, sala, tool calls y transaction state. | No usar direcciones o hashes como correlation IDs. |
| ¿Qué retención, muestreo, borrado y acceso admiten los proveedores? | Define si cumplen la política de siete días y el apagado seguro. | Documentación oficial y configuración local. | No asumir características pagas disponibles. |
| ¿Qué prueba debe bloquear un rollout? | La redacción debe demostrarse antes de exportar. | Tests actuales y una futura captura canaria. | No habilitar producción durante esta investigación. |

## Exit condition

La investigación termina cuando cada pregunta tiene evidencia o un gap exacto, y existe una recomendación que puede aprobarse sin habilitar telemetría.
