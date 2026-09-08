# 04 — Structure outline

Estado: draft para aprobación antes de implementación. Design: `03-design-discussion.md`. Precondiciones: cuota LiveKit Cloud agotada (429) motivó self-host; decisión B aceptada por el humano.

## Work units (orden de dependencias)

### WU-A — Server LiveKit OSS en compose
- `docker/livekit.yaml` (nuevo): `port: 7880`, `rtc: {tcp_port: 7881,
  port_range_start: 50000, port_range_end: 50050, use_external_ip: false}`,
  `keys: {"${LIVEKIT_API_KEY}": "${LIVEKIT_API_SECRET}"}`.
- `compose.yaml`: servicio `livekit` (imagen `livekit/livekit-server`, sin
  profile — siempre arriba con dev), puertos `7880/tcp`, `7881/tcp`,
  `50000-50050/udp`, healthcheck HTTP en 7880.
- `voice-worker`: override `LIVEKIT_URL=ws://livekit:7880` (red compose).
- `backend`: env `LIVEKIT_PUBLIC_URL` (default `ws://localhost:7880`; override
  LAN IP para teléfono).

### WU-B — Mint de tokens en Fastify
- `POST /v1/livekit/connection-details` (bearer auth como el resto de `/v1`):
  binding (misma maquinaria de `/v1/live-bindings`) + JWT HS256 con `jose`
  (claims exactos: `02-research.md` §3 — room `nani-<conversationId>`,
  `video.roomJoin/roomList/canUpdateOwnMetadata`, `roomConfig.agents[{
  agentName}]`, exp ~10 min, `jti` = identity).
- Respuesta: `{conversationId, bindingToken, serverUrl, participantToken}`.
- Fail-closed si faltan `LIVEKIT_API_KEY/SECRET` (mismo patrón que el worker).

### WU-C — Front: fuente de token propia
- `apps/nana-wallet/src/lib/api.ts` + `api-types.ts`: nuevo
  `createLiveKitConnectionDetails` (contrato duplicado, convención del repo).
- `livekit-web-client.ts`: `VITE_LIVEKIT_TOKEN_SERVER_ID` presente → camino
  sandbox (compat); ausente → endpoint propio. Publish mic → `bind_conversation`
  → revisiones: sin cambios.

### WU-D — Verificación + docs
- Worker registrado en el LiveKit local (logs).
- Voz E2E browser: cero requests a `cloud-api.livekit.io` (network tab).
- Escenario de audio: (1) UDP limpio / (2) fallback TCP / (3) sin audio →
  si (3): plan B binario nativo (`brew install livekit`) documentado como
  excepción.
- Phone: `LIVEKIT_PUBLIC_URL=ws://<LAN-IP>:7880`.
- Backend tests/lint/typecheck en verde (CI repite).
- Runbooks: `docs/local-docker-runbook.md` (servicio livekit, envs) + nota de
  precondición de cuota en `docs/livekit-development-runbook.md`.

## Orden sugerido

WU-A → WU-B → WU-C → WU-D. WU-A/WU-B independientes entre sí; WU-C depende de B.

## Fuera de alcance

- TLS/wss (deploy público es decisión separada, ver deploy-test-env WU3-F5).
- Producción multiusuario (gap documentado del runbook).
- Turn server / ICE remoto / relay.