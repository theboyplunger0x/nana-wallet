# 00 — Intake

## Outcome

Eliminar la dependencia de LiveKit Cloud (y su cuota de connection minutes) del
entorno local: LiveKit self-hosted en el stack Docker, con **Fastify emitiendo
los room tokens** (reemplazo del sandbox token server). La demo completa —texto
+ voz realtime— corre 100% local con un comando.

## Acceptance evidence (provisional)

- `docker compose --profile dev --profile worker up -d` levanta db + livekit +
  api + voice-worker; el worker se registra en el LiveKit local.
- La voz E2E funciona desde el browser sin `VITE_LIVEKIT_TOKEN_SERVER_ID`:
  el front obtiene room token desde el backend propio.
- Sin llamadas a `cloud-api.livekit.io` en el flujo de voz (verificable en
  network tab del browser).
- Prueba desde el teléfono en LAN (`ws://<LAN-IP>:7880`).

## Granted authority

- Read: repo completo.
- Write (planning): `.agent-workflow/tasks/local-livekit-selfhost/`.
- Write (implementation): NOT yet granted — bound a design approval.
  Superficies tentativas: `compose.yaml`, `docker/livekit.yaml` (nuevo),
  `src/api/livekit-connection-details.ts` o similar, `src/livekit/token-mint.ts`,
  `apps/nana-wallet/src/features/agent/voice/livekit-web-client.ts`,
  `apps/nana-wallet/src/lib/api.ts`, `docs/`.

## Non-goals

- TLS/wss (solo http/ws local; el deploy público necesita otro camino).
- Producción multiusuario (sigue el gap documentado del runbook).
- Reemplazar el flujo de binding Ed25519 (sigue igual).
- Turn server / ICE remoto.

## Selected route

RPI. Current phase: intake → research → design. Implementación tras aprobación.