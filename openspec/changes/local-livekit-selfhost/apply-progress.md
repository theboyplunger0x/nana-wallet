# Apply Progress: Local LiveKit Self-Host

## Batch 1 — PR1 slice (deps + infra + backend + backend tests)

Status: **PR1 slice complete.** PR2 (frontend) and PR3 (docs + verification) pending.

### Completed tasks (checked in tasks.md)

- [x] 1.1 — explicit `livekit-server-sdk ^2.18.0` in root `package.json`; `npm ls livekit-server-sdk` shows a single hoisted 2.18.0 copy (deduped against `@livekit/agents`).
- [x] 1.2 — `docker/livekit.yaml` created (port 7880, rtc udp 7881 + 60000–60100 range; NO egress/recording/webhook sections). See deviation D1 on the `keys` section.
- [x] 1.3 — `livekit` service added to `compose.yaml` (image pinned `livekit/livekit-server:v1.13.6`, config mounted ro, ports loopback-only, wget healthcheck). Verified: `docker compose config` resolves with all `host_ip: 127.0.0.1`; live container smoke: server starts clean, `curl http://127.0.0.1:7880/` → 200.
- [x] 2.1 — `readLiveKitTokenIssuerConfig` in `src/config/livekit.ts` (credentials, default agent `nani-agent`, TTL default 600 / min 60 REJECT). Privacy reader untouched.
- [x] 3.1 — `src/livekit/token-issuer.ts` `issueRoomToken` (server-derived `nani-<conversationId>`, grants exactly roomJoin/room/canPublish/canSubscribe, embedded `RoomConfiguration` agent dispatch). R1 resolved: the option is `token.roomConfig = new RoomConfiguration({ agents: [{ agentName }] })` (typed against `livekit-server-sdk`'s re-export).
- [x] 4.1 — `voiceRoomTokenRequestSchema` / `voiceRoomTokenResponseSchema` added to `src/contracts/http.ts`.
- [x] 5.1 — `POST /v1/voice/room-token` in `registerVoiceRoutes(app, options?)` with optional injected `liveKitTokenIssuer`; 400 `invalid_body`, 503 `voice_token_unavailable`; existing routes unchanged when the dependency is absent.
- [x] 5.2 — `src/server.ts` builds/injects the issuer (`readLiveKitTokenIssuerConfig()` + `config.demoUserId ?? ""`), lazy per-request validation; API boots without LiveKit creds.
- [x] 6.1–6.4 — `tests/unit/voice-room-token.test.ts`: 19 tests (JWT verify via `TokenVerifier`, exact grants/no admin grants, agent dispatch default+override, TTL, config reader bounds/credentials, privacy-reader regression, endpoint 200/400/503 via Fastify inject).

### Files changed

- `package.json`, `package-lock.json` (dep add + install result)
- `docker/livekit.yaml` (new), `compose.yaml` (livekit service)
- `src/config/livekit.ts`, `src/livekit/token-issuer.ts` (new), `src/contracts/http.ts`, `src/api/voice.ts`, `src/server.ts`
- `tests/unit/voice-room-token.test.ts` (new)
- `openspec/changes/local-livekit-selfhost/{tasks.md,apply-progress.md}`

### Validation commands run (all in the worktree)

| Command | Result |
| --- | --- |
| `npm install` | OK; `npm ls livekit-server-sdk` → single `livekit-server-sdk@2.18.0` (deduped) |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npx vitest run tests/unit/voice-room-token.test.ts` | 19 passed |
| `npm test` | 65 files passed / 9 skipped; 348 tests passed / 19 skipped (pre-existing DB/e2e skips) |
| `docker compose config` | resolves; livekit ports loopback-only |
| `docker compose up -d livekit` (smoke) | container Up, no server errors, `GET http://127.0.0.1:7880/` → 200, then `docker compose down` |

### Deviations from design (recorded)

- **D1 — `keys` section**: livekit-server **v1.13.6 does not expand `${VAR}` inside its config file** (verified empirically and in upstream source: only `KeyFile` paths go through `os.ExpandEnv`; config-file keys also override env vars, so the sketched `${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}` would have shipped a literal broken key). Credentials are instead injected by the compose service via `LIVEKIT_KEYS: "${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"` — same `.env` source, still no secrets in tracked files, and `docker/livekit.yaml` keeps no credential content. Privacy guarantee (no egress/recording/webhooks) unchanged.
- **D2 — TTL JWT claim**: this SDK signs `nbf` (not-before) instead of `iat`; the test asserts `exp - nbf === ttl`.
- **D3 — `roomConfig` claim shape**: the decoded JWT carries protobuf zero-value defaults alongside `agents`; assertions are targeted (`roomConfig.agents[0].agentName`) rather than whole-object equality.
- **D4 — `RoomConfiguration` import source**: `@livekit/protocol` exists in two versions (1.51.0 hoisted via `@livekit/agents`, 1.48.0 nested under `livekit-server-sdk`); importing through `livekit-server-sdk`'s re-export aligns types with `token.roomConfig` and typechecks clean. This nesting pre-existed the dependency add (no new dual copy).
- **D5 — `src/livekit/token-issuer.ts`** was created as mandated by tasks 3.1/design, though it was not listed in the delegated allowed-edit-surfaces summary.
- Image pinned to `livekit/livekit-server:v1.13.6` (current stable at implementation time); healthcheck `wget -q --spider http://localhost:7880/` verified in-image (`GET /` → 200).

### Workload / PR boundary

- PR1 slice only (this batch): deps + infra + backend + backend tests — well within the 400-line budget.
- PR2 pending: frontend (tasks 7.x, 8.x, 9.x). PR3 pending: docs + verification gates (tasks 10.x–13.x) and Post-Apply Review (parent-owned).

### Remaining unchecked tasks

Phases 7–13 remain unchecked in `tasks.md` (frontend, docs, verification phases), plus the parent-owned Post-Apply Review row (preserved byte-for-byte).
