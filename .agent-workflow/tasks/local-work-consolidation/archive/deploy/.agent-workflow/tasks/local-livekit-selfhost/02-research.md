# 02 — Research

Fecha: 2026-09-06 · Worktree `deploy-test-env` · Preguntas: `01-research-questions.md`

## 1. Qué es LiveKit en nuestra arquitectura (para el registro)

LiveKit Cloud es **transporte** (SFU WebRTC + señalización + data messages),
no el modelo. Los "connection minutes" cuotados cuentan tiempo de conexión de
participantes con la tubería abierta, hable o no. El modelo (OpenAI Realtime)
corre en nuestro worker y se factura en OpenAI. Self-hostear LiveKit elimina
la cuota de transporte sin tocar el modelo ni el código de voz.

## 2. Superficie exacta de dependencia del Cloud

| Pieza | Uso del Cloud | Cambio con self-host |
| --- | --- | --- |
| `livekit-web-client.ts` (front) | `TokenSource.developmentTokenServer` → `cloud-api.livekit.io/api/v2/sandbox/connection-details` (`X-Sandbox-ID`) | Reemplazo por endpoint propio |
| Worker (`src/livekit/worker.ts`) | `LIVEKIT_URL` genérico | `ws://livekit:7880` (compose) — sin código |
| API Fastify | No usa LiveKit salvo binding keys | +1 endpoint mint de tokens |
| Binding Ed25519 (`bind_conversation`) | Sin Cloud | Igual |

## 3. Claims del token (capturados del JWT real del sandbox)

```json
{
  "iss": "<LIVEKIT_API_KEY>",
  "sub": "<participantIdentity>",
  "identity": "<participantIdentity>",
  "name": "<participantIdentity>",
  "video": { "roomList": true, "roomJoin": true,
             "room": "nani-<conversationId>", "canUpdateOwnMetadata": true },
  "roomConfig": { "agents": [{ "agentName": "nani-agent" }] }
}
```

Firmado HS256 con `LIVEKIT_API_SECRET`, `jti` = identity, `exp` corto (~10 min).
Replicable con `jose` (ya en deps). Dispatch por token: **feature del server
OSS** (docs oficiales), aplica solo al crear la room — nuestro room name es
único por conversación (`nani-<conversationId>`).

## 4. Server OSS en Docker

- Imagen `livekit/livekit-server`, config `docker/livekit.yaml`:
  `port: 7880`, `rtc: { port_range_start/end, tcp_port: 7881, use_external_ip: false }`,
  `keys: { "<LIVEKIT_API_KEY>": "<LIVEKIT_API_SECRET>" }` (mismas credenciales
  que ya tiene el `.env` para worker y mint).
- Puertos: `7880/tcp`, `7881/tcp`, rango UDP acotado `50000-50050/udp`.
- El server vive en la red compose; worker via `ws://livekit:7880`; browser via
  `LIVEKIT_PUBLIC_URL` (default `ws://localhost:7880`, override LAN IP).
- Fallback documentado si el ICE/UDP por colima fallara: binario nativo
  (`brew install livekit`) fuera de Docker solo para este servicio.

## 5. Cambio en el front (única pieza de código front)

`connect()` en `livekit-web-client.ts`: hoy crea binding (`api.createLiveVoiceBinding`)
y luego pide token al sandbox. Propuesta: si `VITE_LIVEKIT_TOKEN_SERVER_ID`
existe → camino actual (compat); si no → `api.createLiveKitConnectionDetails()`
(nuevo), que devuelve `{conversationId, bindingToken, serverUrl, participantToken}`
en una llamada. El resto del flujo (publish mic → `bind_conversation` RPC →
revisiones por data topic) **no cambia**.

## 6. Fuentes

- docs.livekit.io/agents/server/agent-dispatch/ (dispatch por token, OSS)
- docs.livekit.io/transport/self-hosting/ports-firewall/ (puertos)
- JWT real capturado del sandbox token server (2026-09-06)
- Verificación en vivo: 429 "connection minutes limit exceeded" motivó este task