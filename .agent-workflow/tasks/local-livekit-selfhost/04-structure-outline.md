# 04 — Structure outline

## Cambio openspec propuesto

`openspec/changes/local-livekit-selfhost/` — propuesta, spec, design y tasks derivados de `03-design-discussion.md`.

## Superficie de implementación

### Backend (raíz)

| Archivo | Cambio |
| --- | --- |
| `package.json` | Dep explícita `livekit-server-sdk` (hoy transitive) |
| `docker/livekit.yaml` | NUEVO — config del server: port 7880, RTC UDP, sin egress/webhook/recording, keys desde env |
| `compose.yaml` | Servicio `livekit` (imagen oficial, puertos en 127.0.0.1, env key/secret) |
| `src/contracts/http.ts` | Schemas zod: `voiceRoomTokenRequestSchema` / response `{ serverUrl, participantToken, roomName }` |
| `src/config/process.ts` (o `src/config/livekit.ts`) | `readLiveKitTokenIssuerConfig` — valida `LIVEKIT_URL/API_KEY/API_SECRET` + TTL opcional |
| `src/api/voice.ts` | `POST /v1/voice/room-token` — firma AccessToken (grants + RoomConfiguration agents + TTL), server-authoritative |
| `src/server.ts` | Lee/inyecta la config del token issuer en `registerVoiceRoutes` |
| `tests/unit/...` | Tests del endpoint: decodifica JWT, afirma grants `roomJoin`/room/canPublish/canSubscribe, agents, identity, TTL, error 400 y falla-clara sin credenciales |

### Frontend (`apps/nana-wallet/`)

| Archivo | Cambio |
| --- | --- |
| `src/lib/api.ts` | `fetchVoiceRoomToken(conversationId)` contra la API |
| `src/features/agent/voice/livekit-web-client.ts` | Token source local (default) + selector `VITE_LIVEKIT_TOKEN_SOURCE` (local/cloud); Cloud intacto como alternativa |
| `apps/nana-wallet/.env.example` | `VITE_LIVEKIT_TOKEN_SOURCE=local` (comentado) |
| Tests colocalizados | Selección de source por env, contrato de respuesta, error del endpoint |

### Docs

| Archivo | Cambio |
| --- | --- |
| `docs/livekit-development-runbook.md` | Sección self-host (default) + envs + smoke vs `ws://localhost:7880`; Cloud como alternativa |
| `.env.example` (root) | Comentarios para livekit server en compose + TTL opcional |

## Contrato HTTP (afecta docs/api.md)

- NUEVO `POST /v1/voice/room-token` → 200 `{ serverUrl, participantToken, roomName }` / 400 `invalid_body` / 503 si el issuer no está configurado.
- Actualizar `docs/api.md` junto al cambio (regla del repo: contrato HTTP se documenta en el mismo PR).

## Fuera de alcance

- Binding Ed25519 (`/v1/live-bindings`), flujo financiero, runtime selector, TURN/TLS, ruta Cloud (queda intacta).

## Orden de trabajo (para tasks)

1. Deps + config server (compose/livekit.yaml) — verificable con `docker compose up -d livekit`.
2. Endpoint backend + config reader + tests unitarios (JWT decodificado).
3. Front: api client + token source local + selector + tests.
4. Docs (runbook, api.md, env examples).
5. Verificación: suites verde (back + front), smoke e2e opcional contra server local.
