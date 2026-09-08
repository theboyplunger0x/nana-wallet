# Iniciar Nana con wallet real

Desde la raíz de esta rama, con Docker, Node 24+ y Portless:

```bash
node scripts/docker-real-wallet.mjs --provider wdk --vault --env-file /ruta/config.env --check
node scripts/docker-real-wallet.mjs --provider wdk --vault --env-file /ruta/config.env
```

El archivo debe estar provisionado mediante vault-env. El shell tiene precedencia sobre el archivo; Vault agrega claves faltantes. El script nunca imprime valores. Seleccioná circle-arc en lugar de wdk únicamente en una rama que ya tenga el proveedor integrado.

WDK necesita NANA_WDK_VOLUME, WDK_WALLET_NAME y WDK_TOKEN. El volumen tiene que existir y la wallet debe estar desbloqueada por su dueño. Ambos proveedores necesitan WDK_MAX_TRANSFER_AMOUNT y WDK_ALLOWED_RECIPIENTS configurados para el uso previsto, más las claves de LiveKit, binding Ed25519, OpenAI y OpenCode. El preflight enumera lo que falta.

El arranque publica https://nana.localhost mediante Portless, con frontend, API, worker, LiveKit y Postgres; WDK agrega su daemon. NANA_HOSTNAME y NANA_DOCKER_PROJECT permiten elegir otro nombre. NANA_LIVEKIT_MEDIA_START cambia el rango de medios si otro stack ocupa los puertos. No se publican puertos de Postgres ni de la API directamente.

La base del proyecto conserva sus datos entre arranques. NANA_DB_VOLUME permite señalar una base externa con el ledger de este script; una base antigua sin ledger se rechaza antes de modificarla. No se importan contactos ni se ejecutan transferencias al iniciar.

Para detener los contenedores sin borrar datos, consultá primero sus nombres con docker ps --filter label=com.docker.compose.project=nana-real y usá docker stop con esos nombres. Quitá únicamente el alias creado para este stack con portless alias --remove nana.

El chequeo final comprueba wallet live y lectura de saldo. La conversación de voz necesita una prueba separada en navegador.
