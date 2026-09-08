---
name: nana-docker-real-wallet
description: Iniciar y verificar el stack Docker local de Nana con wallet real WDK o Circle Arc mediante scripts/docker-real-wallet.mjs. Usar cuando se pide levantar los contenedores con wallet real.
---

Usá el script del repositorio desde la raíz. Requiere Node 24+ (requisito de Portless), Docker Compose y Portless; el script no instala dependencias Node en el host.

1. Respetá el proveedor indicado por el usuario. Si no lo indicó, preguntá WDK/Sepolia o Circle Arc/USDC testnet antes de arrancar. Circle requiere su implementación integrada en la rama; el script detecta su ausencia.
2. Consultá `vault-env list` para nombres disponibles. Proveé secretos con `--vault` o `--env-file` apuntando a un archivo ya provisionado por `vault-env`. No leas/imprimas el archivo ni uses `source`, `set -x`, `docker inspect` sin formato o `docker compose config` sin `--quiet`. El alias `OPEN_AI_API_KEY` se adapta internamente a `OPENAI_API_KEY`.
3. Exigí `WDK_MAX_TRANSFER_AMOUNT` y `WDK_ALLOWED_RECIPIENTS` elegidos por el usuario. Para WDK también `WDK_TOKEN`, `WDK_WALLET_NAME` y `NANA_WDK_VOLUME`: volumen externo que ya contiene la wallet. No copies claves ni crees/desbloquees wallets. Si está bloqueada, informá que necesita desbloqueo humano.
4. Ejecutá `node scripts/docker-real-wallet.mjs --provider wdk --vault --check` (o `circle-arc`). Agregá `--env-file /ruta/al/archivo` si corresponde. El preflight informa faltantes por nombre. No sustituyas valores ni uses fixture para sortear un fallo.
5. Con preflight válido y arranque autorizado, repetí sin `--check`. Crea un proyecto propio (`NANA_DOCKER_PROJECT`, default `nana-real`) y aplica migraciones con ledger/checksum. Un volumen DB preexistente sin ledger se rechaza: no lo borres ni marques migraciones aplicadas sin verificarlo.
6. Verificá la URL Portless impresa, modo live, saldo real legible y servicios activos. El script no prueba una conversación de voz ni confirma transferencias. Informá esos límites y cualquier bloqueo. No ejecutes pagos como smoke test.

`NANA_HOSTNAME` cambia el alias Portless. LiveKit usa puertos de medios fijos por WebRTC; si están ocupados por otro stack, elegí un rango libre con `NANA_LIVEKIT_MEDIA_START`. No detengas stacks ajenos. Para detener este stack, identificá sus contenedores por el proyecto y preservá los volúmenes.
