# 02 — Research

## Scout handoff (2026-09-06, gentle-ai-explore)

### Frontend room connection (`apps/nana-wallet/src/features/agent/voice/livekit-web-client.ts`)

- Config (`:27–35`): `tokenServerId` desde `VITE_LIVEKIT_TOKEN_SERVER_ID`, `agentName` desde `VITE_LIVEKIT_AGENT_NAME` (default `"nani-agent"`), `participantIdentity` desde `VITE_LIVEKIT_PARTICIPANT_IDENTITY`. Falla con "Live voice is not configured for this browser." si falta `tokenServerId` o `participantIdentity`.
- Flujo de dos tokens: `createLiveVoiceBinding` (`:74`) → `POST /v1/live-bindings` (binding JWT Ed25519 de app); luego `TokenSource.developmentTokenServer(config.tokenServerId)` (`:75`) pide el token del room LiveKit.
- `tokenSource.fetch` (`:76–81`): `{ roomName: 'nani-${binding.conversationId}', participantIdentity, agentName }`. El room SIEMPRE es `nani-<conversationId>`.
- El cliente NO conoce la URL del server por env: `room.connect(credentials.serverUrl, credentials.participantToken, ...)` (`:121`). Ambos valores llegan en la respuesta del dev token server: **contrato `{ serverUrl, participantToken }`**.
- `VITE_LIVEKIT_TOKEN_SERVER_ID` es un ID de recurso Cloud, no una URL: no se puede redirigir a localhost. El self-host exige reemplazar el token source.

### Deps de firma y worker/smoke

- Root `package.json`: declara `@livekit/agents ^1.7.1` + plugins. `livekit-server-sdk` (2.18.0) y `@livekit/protocol` (1.51.0) son **transitivos** (via `@livekit/agents/package.json:50,72`), no deps explícitas. El smoke ya importa `AccessToken, AgentDispatchClient` de `livekit-server-sdk` solo por hoisting — para usarlos en el API hay que declararlos.
- Worker (`src/livekit/worker.ts`): `defineAgent` (`:145`) + `cli.runApp(new ServerOptions({ agent, wsURL: config.url, apiKey, apiSecret, ... }))` (`:115–124`). No fija agent name en código; el dispatch usa el nombre registrado. `ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY)` (`:50`). Verificación de binding via `LIVE_VOICE_BINDING_PUBLIC_KEY` (`room-conversation.ts:306–320`).
- Smoke (`tests/e2e/livekit-smoke.e2e.test.ts`, gated `LIVEKIT_E2E=1`): env `LIVEKIT_URL/API_KEY/API_SECRET/AGENT_RUNTIME/E2E_AGENT_NAME/E2E_BINDING_TOKEN/E2E_BINDING_PUBLIC_KEY` (`:8–15`). Crea room vía `POST /twirp/livekit.RoomService/CreateRoom` (`:34–41,67`), dispatch via `AgentDispatchClient.createDispatch(room, name, { metadata })` (`:72–76`). Grants del token: `roomJoin, roomCreate, roomAdmin, canPublish:false, canSubscribe:true`, TTL `'5m'`. `LIVEKIT_URL` ws/wss se mapea a http/https con `httpUrl()` (`:17–19`).

### Rutas Fastify `/v1`

- Registro en `src/server.ts:53–90`: fábricas `register<Name>Routes(app, dependencies)`. `registerVoiceRoutes(app)` (`api/voice.ts:69`) es DB-independiente y se registra incondicional en `server.ts:90` — slot natural para `POST /v1/voice/room-token`.
- Validación: schemas zod en `src/contracts/http.ts` (p.ej. `voiceSpeakRequestSchema`, `:237–241`); `.safeParse(request.body)` y error `{ status, message, code }` con `invalid_body` para 400.
- Config en rutas: se inyecta por opciones de fábrica (p.ej. `bindingPrivateKey` → `registerConversationRoutes`, `server.ts:75–86`). `readApiProcessConfig()` devuelve solo `{ host, port, databaseUrl, demoUserId, bindingPrivateKey }` — **no lee** `LIVEKIT_URL/API_KEY/API_SECRET`.

### Env / config

- Front lee solo `VITE_LIVEKIT_TOKEN_SERVER_ID`, `VITE_LIVEKIT_AGENT_NAME`, `VITE_LIVEKIT_PARTICIPANT_IDENTITY`. No existe `VITE_LIVEKIT_URL`; la URL del server llega en la respuesta del token.
- Root lee `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (`config/process.ts:92–94`), `LIVEKIT_SHUTDOWN_TIMEOUT_MS`, `LIVEKIT_AGENT_RUNTIME`, `LIVEKIT_AGENT_NAME` (`.env.example:89`).
- Privacidad: `readLiveKitPrivacyConfig` (`config/livekit.ts`) fuerza `recordingEnabled: false`, `observabilityRecording: false` y lanza si se piden encender. Worker manda `record: false` (`worker.ts:130`). Sin egress configurado en el repo.

### Tokens: dos sistemas independientes

1. **Binding token** (Ed25519, `POST /v1/live-bindings`, verificado por el worker) — NO se toca.
2. **Room token** LiveKit (lo firma el dev token server de Cloud) — es el que reemplazamos.

## Gotchas confirmados

- El nuevo endpoint debe replicar el contrato `{ serverUrl, participantToken }` del dev token server.
- El proceso API no tiene credenciales LiveKit hoy: hay que leerlas/inyectarlas.
- El dispatch del agente en el flujo real es **automático vía RoomConfiguration del token** (el dev token server embebe `agents: [agentName]` en el join token): para self-host, el AccessToken local debe embeber la misma RoomConfiguration — el dispatch explícito (`AgentDispatchClient`) es solo del smoke.
- TTL sin config hoy: smoke usa `'5m'` hardcodeado.
