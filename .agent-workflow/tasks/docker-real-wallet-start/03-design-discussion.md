# Diseño

Script Node sin dependencias de host adicionales; Docker construye API/worker y frontend por separado. Compose dedicado generado en un directorio temporal sin secretos: Postgres, LiveKit, API, worker y frontend; WDK agrega el daemon y exige un volumen externo existente. Selección explícita wdk/circle-arc, sin fallback fixture. Circle exige que su implementación esté presente.

Secretos mediante vault-env o archivo ya provisionado, nunca shell source ni salida de valores. Preflight valida claves y política antes de crear contenedores. Migraciones SQL transaccionales con ledger y checksum; rechazar adopción silenciosa de bases antiguas. Frontend estático sin MSW, proxy HTTP/WebSocket y alias Portless sobre puerto asignado por Docker. Arranque verifica health live, lectura de saldo y contenedores; sin llamadas financieras de escritura.

Alcance de implementación autorizado por la petición directa. La elección del proveedor para el arranque real está pendiente; el script admite ambos explícitamente.
