# 01 — Research questions

## Current-state (respondidas con repo scan + verificación en vivo, 2026-09-06)

- **R1 — ¿Qué depende hoy del Cloud?**
  Solo una cosa en el flujo de voz: `TokenSource.developmentTokenServer(id)`
  (`apps/nana-wallet/src/features/agent/voice/livekit-web-client.ts:75-82`)
  pide credenciales a `https://cloud-api.livekit.io/api/v2/sandbox/connection-details`
  con header `X-Sandbox-ID`. El worker y la API ya son agnósticos del host.
- **R2 — ¿A qué se conecta el browser?**
  `room.connect(credentials.serverUrl, credentials.participantToken)` — la URL
  viene en la respuesta del token server. Con self-host, la servimos nosotros.
- **R3 — ¿Qué claims tiene el token que replica el sandbox?**
  Capturado del JWT real (HS256):
  `{iss: <API key>, sub/identity/name: <participant>, iat/nbf/exp,
  video: {roomList, roomJoin, room: "nani-<conversationId>", canUpdateOwnMetadata},
  roomConfig: {agents: [{agentName: "nani-agent"}]}}`. No setea
  canPublish/canSubscribe (default permitido con roomJoin).
- **R4 — ¿El dispatch por token funciona en el server OSS?**
  Sí — docs oficiales ("Dispatch via access token ... When the first participant
  connects and creates the room, LiveKit dispatches the specified agents").
  Es lifecycle del server, no servicio Cloud. Ojo: el dispatch aplica solo en
  la creación de la room → el nombre `nani-<conversationId>` ya es único.
- **R5 — ¿El worker puede apuntar al local?**
  Sí: `cli.runApp(ServerOptions({wsURL: config.url}))` lee `LIVEKIT_URL`
  (`src/livekit/worker.ts:206-216`). En compose: `ws://livekit:7880` (red de
  docker); para el browser: `ws://localhost:7880` (o LAN IP).
- **R6 — ¿Con qué firmamos los JWT?**
  `jose` ya es dependencia del backend (lo usa para los binding tokens
  Ed25519). LiveKit usa HS256 con `iss=API key` — no hace falta
  `livekit-server-sdk`; ~30 líneas con jose. La key/secret ya existen en el
  `.env` (las mismas que usa el worker).
- **R7 — ¿Qué puertos expone el server OSS en Docker?**
  `7880/tcp` señal+HTTP, `7881/tcp` RTC-over-TCP fallback, rango UDP de media
  (`rtc.port_range_start/end`, default 50000-60000). En compose se mapea 7880 +
  rango UDP acotado (ej. 50000-50050) para no estresar el port-forwarding del
  VM (colima).
- **R8 — ¿Riesgo UDP en colima?**
  Colima mapea UDP vía la VM; para ICE local mismo-LAN funciona, pero si
  hubiera problemas, fallback documentado: binario nativo (`brew install
  livekit`) corriendo fuera de Docker solo para el server de media.

## Decisiones abiertas (para design)

- **D1 — ¿Un endpoint unificado?** Propuesta: `POST /v1/livekit/connection-details`
  hace binding + mint del token en una llamada (el front hoy hace dos: binding
  + token server). Menos round-trips, mismo gate `bind_conversation`.
- **D2 — ¿Cómo decide el front qué fuente de token usar?**
  Propuesta: si `VITE_LIVEKIT_TOKEN_SERVER_ID` está seteado → camino sandbox
  (compat); si no → nuevo endpoint propio. Sin env nuevo obligatorio.
- **D3 — serverUrl público:** env `LIVEKIT_PUBLIC_URL` (default
  `ws://localhost:7880`), override con LAN IP para pruebas en el teléfono.