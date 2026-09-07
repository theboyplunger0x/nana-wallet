# 03 — Design discussion

## Decisiones tomadas (con la persona)

- **D1 — Token issuer: Fastify.** Endpoint nuevo que firma el AccessToken del room con las mismas `LIVEKIT_API_KEY/SECRET`. Adelanta el ítem "issue LiveKit tokens from Fastify" del production gap. El worker LiveKit (`npm run livekit:dev`) sigue siendo el proceso manual de siempre; solo cambia quién firma el token del browser.
- **D2 — Server en compose.** `livekit-server` como servicio de `compose.yaml` (imagen oficial, sin egress/recording, loopback), consistente con Docker/Colima del repo.
- **D3 — Ruta Cloud se conserva como alternativa.** Self-host es el default del runbook local; Cloud queda soportado vía config.

## Diseño

### 1. Server LiveKit local (`compose.yaml`)

Servicio `livekit`:

- Imagen oficial `livekit/livekit-server`, con config file propio (`docker/livekit.yaml`): `port: 7880`, RTC UDP (`7881` + rango de puertos) limitado a loopback, **sin egress** y sin webhook/recording (la config del server no habilita nada de esto por defecto; lo explicitamos para que la privacidad sea auditable).
- Credenciales: `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` pasadas al server vía config templated desde el `.env` (mismas que usa API/worker — así una sola pareja de credenciales firma y valida).
- Puertos publicados solo en `127.0.0.1`: `7880/tcp`, `7881/udp`, rango UDP media.
- Healthcheck documentado; el server arranca sin DB ni dependencias.

### 2. Endpoint `POST /v1/voice/room-token` (Fastify)

- Ubicación: `src/api/voice.ts` (`registerVoiceRoutes`, DB-independiente, patrón existente).
- Contrato (zod en `src/contracts/http.ts`):
  - Request: `{ conversationId: uuid, agentName?: string }`.
  - Response: `{ serverUrl, participantToken, roomName }` — replica el contrato del dev token server.
- **Server-authoritative**: el server deriva `roomName = nani-${conversationId}` y usa `identity = demoUserId` (config del proceso API); el `agentName` del request se valida contra `LIVEKIT_AGENT_NAME` (o se ignora y se usa el del server). El front ya no decide nada sensible.
- Firma del token: `AccessToken` de `livekit-server-sdk` con video grants `{ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true }` y **RoomConfiguration embebida con `agents: [{ agentName }]`** (dispatch automático — es así como hoy el dev token server dispara el agente). TTL default `10m`, opcionalmente `LIVEKIT_ROOM_TOKEN_TTL` (mínimo acotado para no dejar tokens largos).
- Config: nuevo lector pequeño (`readLiveKitTokenIssuerConfig`) que lee/valida `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` y falla con mensaje claro si falta alguno; se inyecta en `registerVoiceRoutes` desde `server.ts` (patrón `bindingPrivateKey`). `serverUrl` de la respuesta = `LIVEKIT_URL` del proceso API (el browser entra por loopback al mismo host).
- Deps: `livekit-server-sdk` se declara **explícita** en el root `package.json` (hoy es transitive-only).

### 3. Frontend (`livekit-web-client.ts`)

- Nuevo token source local: llama a la API (`apps/nana-wallet/src/lib/api.ts`) con `conversationId` del binding y recibe `{ serverUrl, participantToken }`. Se elimina el knowledge del front sobre `roomName` y grants.
- Selector de ruta (D3): `VITE_LIVEKIT_TOKEN_SOURCE` = `local` (default) | `cloud`. Con `cloud` se conserva `TokenSource.developmentTokenServer` + `VITE_LIVEKIT_TOKEN_SERVER_ID` intactos. Con `local` no se exige token server id.
- `VITE_LIVEKIT_PARTICIPANT_IDENTITY` sigue existiendo como sanity check (el front compara con la identidad esperada) pero la identidad real la firma el server.
- Tests de front: selección de token source por env, contrato de la respuesta, y manejo de error del endpoint.

### 4. Privacidad (sin cambios de garantías)

- `record: false` del worker y `readLiveKitPrivacyConfig` siguen intactos.
- La config del server local no habilita egress/recording/webhooks; el audio nunca sale del loopback.
- El token es de corta duración, scopped a UN room, con identity del demo user. No hay admin grants en el token del browser (a diferencia del smoke, que usa credenciales admin server-side).

### 5. Docs

- `docs/livekit-development-runbook.md`: nueva sección "Self-hosted LiveKit (default local)": `docker compose up -d livekit`, envs locales, los 3 terminales de siempre, y el smoke e2e apuntando a `ws://localhost:7880`. La ruta Cloud queda como sección alternativa.
- `.env.example` (root y front): nuevos valores con comentarios en inglés (convención del repo).

## Riesgos / tradeoffs

- **Riesgo**: formato del RoomConfiguration en `livekit-server-sdk` (campo `roomConfiguration`/`roomConfig`) — verificar contra la versión declarada al implementar; test unitario decodifica el JWT y afirma los grants + agents.
- **Riesgo**: puertos UDP del server en Docker/Colima (media forwarding). Mitigación: config mínima de puertos y smoke manual en el runbook; si Colima da problemas de UDP, fallback documentado al binario local.
- **Tradeoff aceptado**: duplicar la lógica de naming (`nani-<conversationId>`) entre front y back ya existía; ahora el naming queda autoridad del server y el front lo recibe en la respuesta.
- **No-goal**: sin TURN/TLS; la demo local es loopback HTTP/WS plano.
