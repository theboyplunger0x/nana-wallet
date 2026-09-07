# 01 — Research questions

## Current-state questions

### Answered by repo scan

- **R1 — ¿De dónde sale hoy el token del browser?**
  `TokenSource.developmentTokenServer(config.tokenServerId)` (`apps/nana-wallet/src/features/agent/voice/livekit-web-client.ts:75`) contra el *development token server* de LiveKit Cloud, con `VITE_LIVEKIT_TOKEN_SERVER_ID`. Ese servicio **no existe** en self-host: hay que reemplazar el token source por completo.
- **R2 — ¿Qué credentials ya tiene el backend?**
  `LIVEKIT_URL` + `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` (validadas por `readWorkerProcessConfig`/`readApiProcessConfig` en `src/config/process.ts:89`). Para un server self-hosted, esos tres valores son locales y conocidos — el backend tiene todo para firmar tokens de room con `@livekit/protocol`/`livekit-server-sdk` (AccessToken con `roomJoin`, identity del participante, grants `room`/`publish`).
- **R3 — ¿Cómo atiende el worker rooms hoy?**
  El worker (`src/livekit/worker.ts`) se registra como agente contra `LIVEKIT_URL` con las mismas credentials. Con Cloud, el agente está "registrado" en el proyecto y el dispatch se resuelve ahí. Con self-host, el registro del worker ocurre contra el server local (misma API de agentes); falta verificar el modo de dispatch que usa el smoke e2e (`test:e2e:livekit-smoke` crea y despacha un room temporal) y si requiere explicit vs automatic dispatch.
- **R4 — ¿Qué superficie de config toca el front?**
  `VITE_LIVEKIT_TOKEN_SERVER_ID` desaparece como requisito local; el front necesita: URL del server (`ws://localhost:7880` — derivable o vía env) y un endpoint que le dé el token (con identity ya existente: `VITE_LIVEKIT_PARTICIPANT_IDENTITY`).

### Open — decisión de diseño (para design discussion)

- **R5 — ¿Quién emite el token del room?** Opciones:
  - **(a) Fastify** — endpoint nuevo `/v1/voice/room-token` (o similar) que firma el AccessToken con las mismas `LIVEKIT_API_KEY/SECRET`. Es literalmente el ítem "issue LiveKit tokens from Fastify" del *production gap* del runbook: el self-host nos obliga y de paso adelanta la corrección de deuda. Requiere pensar el scoping del token (room, identity, TTL corto).
  - **(b) Worker LiveKit** — el worker expone el token por su propia ruta. Acopla el token a un proceso que puede estar caído cuando el browser entra.
  - **(c) Script dev-only** — un CLI que imprime tokens. Cero deuda, pero rompe el flujo "abrir la web y hablar": token manual = mala demo.
  Recomendación provisional: **(a)**.
- **R6 — ¿Cómo corre el server local?** Opciones: **(a)** servicio en `compose.yaml` (imagen oficial `livekit/livekit-server` + config file con recording/egress deshabilitados, UDP 7881/50000-60000 en loopback) — consistente con cómo ya corre la DB; **(b)** binario local (brew) documentado en el runbook — un proceso más que el dev tiene que gestionar. Recomendación provisional: **(a)**, en línea con la regla Docker/Colima del repo.
- **R7 — ¿La ruta Cloud queda como opción o se elimina?** El front necesitará dos token sources (Cloud dev token server vs endpoint local). Costo: un switch de config (`VITE_*`). Costo de eliminarla: el runbook deja de documentar el path Cloud que ya está funcionando. Recomendación provisional: **mantener ambas**, self-host como default del runbook local y Cloud documentado como alternativa.
- **R8 — ¿Privacidad y egress?** El contrato del runbook (`record: false`, sin Egress, sin observability recording) debe mantenerse en la config del server self-hosted (node config sin egress habilitado; el worker ya manda `record: false` a la sesión). Verificar que la imagen default no habilite nada de esto por defecto.

## Scope exclusions

- Sin TURN/TLS/dominios: loopback local, HTTP/WS plano.
- No se toca el contrato financiero, el binding Ed25519 ni el runtime selector.
- No se elimina la ruta Cloud del código (sujeto a R7).
