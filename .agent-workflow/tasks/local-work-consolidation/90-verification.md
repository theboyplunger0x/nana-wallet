# Consolidación de trabajo local, 2026-09-08

Base: origin/main `cff41824959f6066b78c98c129ca196d3b4ef535`. Integración en `integrate/all-local-work`, separada de los worktrees originales. El usuario autorizó revisar e integrar todo a main.

## Destino del trabajo encontrado

| Origen | Resultado en main propuesto |
| --- | --- |
| main local | Formato del test adaptado sobre la versión actual; planes iguales ya cubiertos; variantes anteriores archivadas. |
| review-architecture-review-and-livekit-integration-strategy | Prioridad de ELEVEN_LABS_API_KEY y regresión sobre el helper actual. El worker conserva su proveedor OpenAI vigente. |
| observability-research y observability-slice1-port | Filtro de telemetría, protección de errores del proveedor, tests y planes. Reportes divergentes archivados. Exportadores futuros siguen fuera de esta implementación. |
| deploy-test-env | Commit de planificación `c0c5162` portado como `8de7273`. El Docker de `255ad39` ya está cubierto por main; variantes antiguas de planificación LiveKit archivadas. |
| dev-a | Walkthrough de arquitectura `51f6262` portado como `efac9c9`, con fecha de snapshot visible. Depende de CDN y describe esa versión. |
| feat-docker-real-wallet-start | Script, skill local, imagen frontend, proxy, documentación y pruebas integrados; estado local del script separado por proyecto Docker. |
| feat-circle-arc-provider | Experimento de embeddings archivado como texto; implementación del proveedor ya incluida en #12. |
| feat-openai-realtime-poc | Parche de destinatario antiguo archivado; dirección más reciente de main preservada. |
| Resto de ramas/worktrees del inventario | Commits ya ancestros de main o equivalentes por patch-id. Sin implementación pendiente adicional. |

La revisión encontró escapes de credenciales en el filtro importado: repetición de tokens, cuerpo PEM, campos estructurados y diagnósticos con nombres de campos sensibles. Tres regresiones fallaron antes de la corrección y pasaron después. Se agregó también una regresión HTTP de errores de voz. Los archivos de entorno quedan ignorados y fuera de Git.

## Validación

- Backend: lint, typecheck y build en verde. Suite con Postgres/pgvector nuevo y migraciones reales: 453 tests pasados, 10 omitidos en cuatro suites opt-in.
- Frontend: lint y typecheck en verde, 52 tests pasados. Imagen de producción construida por Docker con `build:mobile`.
- Evals: 16, score 100%, threshold configurado en 0. No se ejecutaron variantes de proveedores reales.
- Script: 9 tests pasados, incluidas dos ejecuciones CLI con comandos simulados. El CI ahora ejecuta estos tests además de las suites existentes.
- E2E de MCP WDK: conexión stdio, descubrimiento de tools y metadatos Sepolia; 1 test pasado, sin acceso a fondos.
- E2E de arranque real: dos ejecuciones completas con Circle Arc, configuración opaca del worktree arc-migration y proyecto Docker `nana-local-integration`. DB, LiveKit, backend, worker y frontend activos; segundo arranque reutiliza la base y el ledger de migraciones.
- HTTPS por Portless: `/`, fallback SPA `/conversations`, `/api/health` y `/api/v1/wallet/balance?token=USDC` respondieron 200. Health confirmó `live`, `arc-testnet`, wallet `unlocked`; balance confirmó red/token. No se registraron importes ni secretos en este informe.

## Límites

Browser no encontró navegadores disponibles; la UI interactiva, el walkthrough y la conversación de voz en navegador no se validaron visualmente. El worker en ejecución no demuestra una conversación completa. Las suites opt-in de LiveKit Cloud, preview WDK con LLM y recipient-memory LLM no se habilitaron: el arranque verificado usa Circle y LiveKit local; esas suites necesitan sus entradas/servicios específicos. No se hicieron transferencias. El proveedor WDK completo conserva validación de configuración y orquestación simulada, pero no una wallet WDK desbloqueada de prueba.

El merge queda sujeto al CI de la PR. Su URL y commit de merge se registran en GitHub; este informe contiene la evidencia previa al merge.
