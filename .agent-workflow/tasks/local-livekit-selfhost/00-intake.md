# 00 — Intake

## Outcome

Ejecutar el stack de voz live contra un **LiveKit autohospedado local** (livekit-server), eliminando la dependencia del proyecto LiveKit Cloud para desarrollo local. Hoy el runbook (`docs/livekit-development-runbook.md`) exige: un proyecto Cloud con el agente registrado, y el *development token server* de Cloud para emitir el token del room al browser. El objetivo: `npm run livekit:dev` + la web app funcionen end-to-end contra `ws://localhost:7880` sin credenciales Cloud, manteniendo intactas las garantías de privacidad (sin egress, `record: false`) y el flujo preview→confirm.

## Acceptance evidence (provisional)

- El compose (o proceso equivalente documentado) levanta `livekit-server` local accesible en `ws://localhost:7880`.
- El browser obtiene el token del room **sin** `TokenSource.developmentTokenServer` ni `VITE_LIVEKIT_TOKEN_SERVER_ID`.
- El worker (`npm run livekit:dev`) se registra como agente contra el server local y atiende rooms (dispatch funcional sin Cloud).
- Un turno de voz completo (no financiero y financiero con preview→confirm) funciona contra el server local: audio bidireccional, tarjeta Confirm/Cancel, `conversation_state_changed`.
- El smoke e2e (`test:e2e:livekit-smoke`) corre contra el server local con las mismas garantías de binding Ed25519.
- El runbook se actualiza: la ruta Cloud queda documentada como alternativa explícita, no como requisito.

## Granted authority

- Read: entire repository, docs, compose, env examples.
- Write (planning artifacts): `.agent-workflow/tasks/local-livekit-selfhost/`.
- Write (implementation): NOT yet granted — bound to design approval and structure outline gates.

## Read scope

- `docs/livekit-development-runbook.md`, `docs/local-live-runbook.md` (contrato de privacidad, proceso actual).
- `compose.yaml`, `.env.example`, `apps/nana-wallet/.env.example`.
- `apps/nana-wallet/src/features/agent/voice/livekit-web-client.ts` (token source del browser).
- `src/config/process.ts`, `src/livekit/` (config de proceso worker, registro de agente, dispatch, smoke e2e).

## Write scope (implementation, tentative until design approval)

- `compose.yaml` (servicio livekit + config) o script/binary local documentado.
- Endpoint/token-issuer para el room token del browser (candidato natural: Fastify `/v1/voice/...` — coincide con el "production gap" del runbook: "issue LiveKit tokens from Fastify").
- `apps/nana-wallet/src/features/agent/voice/livekit-web-client.ts` (nuevo token source local).
- `.env.example` (root y front), `docs/livekit-development-runbook.md`.

## Non-goals (provisional)

- No reemplazar LiveKit Cloud en producción: solo la ruta de desarrollo local (Cloud queda soportado como configuración alternativa).
- No tocar el flujo financiero, el contrato `/v1` existente ni el binding Ed25519.
- Sin TURN/TLS/certificados: es un server de desarrollo en loopback.
- No migrar el runtime selector (`LIVEKIT_AGENT_RUNTIME`) ni el transporte grabado.

## Selected route

RPI workflow (misma convención). Current phase: intake → research questions.

## Active gate

Research gate: mapear cómo el frontend obtiene hoy el token, cómo se registra/despatcha el agente y qué exige el server self-hosted, antes de diseñar el cambio.
