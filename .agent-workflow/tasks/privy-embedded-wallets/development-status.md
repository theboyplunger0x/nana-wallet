# Development status: Privy foundation + embedded wallets

Owner of this file: Pi implementation session (el Gentleman orchestrator). Codex owns `herdr-session.md` and independent verification; this file is never written by Codex. Ongoing, concise, resumable.

Last updated: 2026-09-08 (session start of implementation).

## Authorization state

- User explicitly authorized implementation (supersedes all `implementation_authorized: false` gates in state.yaml): foundation PMU-001..026 then embedded-wallets scope.
- Controlling permission decision (06-spec-review-open-questions.md, final section): indefinite, user-revocable permission; 10 USDC per transfer; 50 USDC per rolling 3600 seconds; enforced ONLY through Privy policy configuration; no local SQL spending cap; no independent enforcement architecture; aggregate concurrency overshoot limitation accepted (Privy aggregate updates are post-signing, non-atomic).
- Fee accounting (implementation assumption, NOT user-approved): transfer caps count transfer amount only; fees are displayed separately in USDC and separately bounded by Privy gas policy. Pending user clarification; does not block implementation.
- Live signing stays DISABLED until the provider-side gas bound is proven against the configured Privy app (WU1 capability probe). Fixture mode is the default and remains available.

## Environment evidence (from parent)

- vault-env list: no `PRIVY_*` keys present. Required live key names recorded as blockers: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY`, `PRIVY_AUTHORIZATION_PRIVATE_KEY` (+ frontend `VITE_PRIVY_APP_ID`). Never read values; names only.
- Docker available (Colima). Existing unrelated containers occupy DB ports 5433/5434 and API ports 3000/3001 — do not touch. Isolated compose project uses 5432 for tests; app servers via Portless.
- Secrets via vault-env only; no secret values in output/logs/commits.

## Effort receipts

- Main Pi session: high reasoning (confirmed by parent).
- sdd-explore (codebase mapping, subtask_sdd-explore_1788898632353_72464309): effort high — accepted.
- sdd-research (doc pinning, subtask_sdd-research_1788898632357_4f3fb882): effort medium — INVALID per parent rule; result was also `blocked` (no web grants). Superseded: doc pinning revalidated with main-Pi-high web research before any reliance. See "Doc pinning" below.

## Doc pinning (revalidated, main Pi high)

DONE 2026-09-08 — verified facts with source URLs recorded in docs/privy-arc-runbook.md. Confirmed: react-auth 3.40.0 (installed), getAccessToken auto-refresh, ES256 JWT ~1h, rolling-only windows + running-sum USDC transfer aggregation recipe for eth_signTransaction, aggregate update at request time (post-signing non-atomicity per r2 review, accepted limitation), Arc chain id 5042002 / USDC 0x3600…0000 / 18 native + 6 ERC-20 decimals / viem built-in chain. LIVE probes (exact window min, gas bound, faucet, server SDK path) remain WU-E1 with credentials; fixture implementation proceeds.

## Plan / progress

Legend: `[ ]` pending, `[~]` in progress, `[x]` done.

1. `[x]` Read controlling artifacts (foundation spec/tasks, embedded spec/design, 06 review questions, outline).
2. `[x]` Consolidate r3 docs (spec/design/outline/tasks) + state.yaml authorization before code. DONE: spec.md r3 (PEW-007/008/014), design.md r3, outline r3, proposal r3, tasks.md r3 created, both state.yaml authorized/clean.
3. `[x]` Foundation WU1 DB: DONE — migrations 002/003 (conversations/live-leases local mirrors) + 004_users.sql (users + FORCE RLS + owner provisioning policy + SECURITY DEFINER users_ensure_for_privy_did + NOT VALID FKs) + 005_recipient_versions.sql (owner-scoped history, FORCE RLS); demo-sentinel.ts; seed gated to demo + provisions sentinel; server.ts onReady demo provisioning.
4. `[x]` Foundation WU2: DONE — PrivyIdentityProvider (jose ES256, iss/aud/sub/exp mandatory), config matrix (IDENTITY_PROVIDER demo|privy, PMU-024 WDK_TOOLS_SOURCE=fixture guard in privy mode), /v1/me identity-only, global PrivyIdentityError→401 handler, PMU-020 room-token auth (privy: authenticated + RLS-owned conversation, same-404 indistinguishable, issuer never called on denial; demo unchanged), wallet routes authenticated in privy mode. Tests: api-me (privy 401 matrix, idempotent provisioning), api-voice-auth (3/3).
5. `[x]` Foundation WU3: DONE — contacts CRUD (list/create-versioned/patch-with-expectedVersion+409+recipient_versions-history/soft-delete/reveal), cross-user RLS isolation test suite, MSW contract mirror. Contacts embed on write via configured ONNX model.
6. `[x]` Foundation WU4: DONE (delegated worker, high effort) — @privy-io/react-auth@3.40.0 installed; api.ts async injectable token source with 401 refresh retry-once, demo fallback gated by VITE_IDENTITY_PROVIDER, sessionStorage retired outside demo; PrivyProvider (privy mode only), /login (email + VITE_PRIVY_PHONE_CHANNEL single channel), auth guard, privy-only logout with resetSession + queryClient.clear; session-isolation module (generation + AbortController registry); perfil contacts CRUD wired; api-types mirror (MeResponse/Contact/Create/Update/RevealedCbu); VITE_LIVEKIT_PARTICIPANT_IDENTITY gated to demo, identity via /v1/me in privy. Front gates: lint 0, tsc 0, tests 58/58, build 0.
7. `[x]` Foundation WU5: DONE — getMemoryRuntimeForUser factory; service memoryForUser (resolved user precedence); server + worker deps wired. Tests 5/5.

Backend validation (CI-equivalent env): lint 0, typecheck 0, tests 490 passed / 10 skipped / 0 failed (2 timeouts under parallel fixed with explicit 60s timeouts on embedding-heavy contacts tests), evals 16/16 (7 files, 100%), build 0.
8. `[x]` Embedded wallets backend (WU-E2+E3, delegated worker high effort, independently verified by parent): migrations 20260901000500 + local 006 (user_wallets/signer_grants/wallet_operations, FORCE RLS, NO expires_at, NO budget columns), embedded.ts (idempotent sync, conflict, grants 10/50/3600, revoke flow), privy-client.ts (fixture + fail-closed live client on missing PRIVY_*), transfer-pipeline.ts (atomic claim → FOR UPDATE nonce → exact ERC-20 calldata chain 5042002 → fixture sign → decode/verify → restricted persistence → broadcast → receipt; F6 lost-signing vs lost-broadcast; identical-bytes-only retry; idempotency key unique), 4 authenticated HTTP routes. RED evidence: 2 real failures captured. Focused 23/23; full suite 513 passed / 10 skipped / 0 failed; lint/tsc/build 0. gitleaks/leask advisories: 0 findings.
9. `[~]` WU6 verification — full deterministic matrix GREEN (2026-09-08):

- Backend: lint 0, typecheck 0, tests 514 passed / 10 skipped / 0 failed, evals 16/16 (7 files), build 0.
- Frontend: lint 0, typecheck 0, tests 65 passed / 0 failed, build 0.
- PEW-013 activation flow added end-to-end (POST /v1/wallets/current/permission with explicit allowlist; server read-back before active; front WalletLifecycle + MSW + tests both sides).
- Pending: Portless browser E2E; live smoke BLOCKED (PRIVY_* key names below).

 1. `[ ]` Live smoke: BLOCKED — missing PRIVY_* keys (names above). Report as blocked, never as pass.

## Blockers log

- LIVE-SMOKE: missing vault-env keys PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_VERIFICATION_KEY, PRIVY_AUTHORIZATION_PRIVATE_KEY, VITE_PRIVY_APP_ID. Fixture work unblocked.
- FEE-Q2: user clarification pending; implementation assumption recorded above.
- DOC-PIN: medium-effort research invalid; revalidation with main-Pi-high web research scheduled at WU-E1 start (no implementation reliance until done).

## Final verification record (2026-09-08/09, session complete)

### Full deterministic matrix — ALL GREEN

- Backend: lint 0, typecheck 0, tests 514 passed / 10 skipped / 0 failed (91 files), evals 16/16 (7 files, 100%), build 0.
- Frontend: lint 0, typecheck 0, tests 65 passed / 0 failed (13 files), build 0.
- Browser E2E (`npm run test:e2e:browser`): 13 PASS / 0 FAIL — real fixture backend on fresh port 3123 with CORS for the E2E origin, real frontend dev server with MSW opted out (VITE_E2E_REAL_BACKEND=1): health, contacts create+list via HTTP, /v1/me envelope userId, conversations, turn -> confirmation_required for the E2E recipient, DB wallet_operations unchanged after unconfirmed turn, chromium launch, /perfil renders the created contact + wallet/permission states against the REAL backend, chat shows the confirmation preview, no transfer without explicit confirmation.
- gitleaks (real tool): 0 findings after reviewed dispositions (.gitleaksignore + .gitleaksignore path/allowlist for build artifacts).

### Fixes made while landing the E2E

- /v1/me now returns ApiEnvelope {ok:true,data:{userId,displayName}} matching the front contract (was a bare object).
- perfil.tsx degrades agenda/bills/wallet-summary (MSW-only features, no real-backend routes) to empty sections instead of failing the page; only identity+contacts are hard requirements.
- client.tsx: dev MSW worker skipped when VITE_E2E_REAL_BACKEND=1 (harness only; production unaffected).
- Cross-test /v1/me readers updated to the envelope shape (api-voice-auth, wallets-cross-user, contacts-cross-user).

### Scope delivered (summary)

Foundation: users/RLS/provisioning migrations (local+supabase), PrivyIdentityProvider (jose ES256), config matrix + PMU-024 fixture-only guard in privy mode, /v1/me, /v1/contacts CRUD + recipient_versions + cross-user RLS proofs, authenticated wallet reads + PMU-020 room-token auth in privy mode, frontend Privy login (email + single configured phone channel), Bearer + 401-retry-once, session-isolation generation guard, per-request memory runtime.
Embedded: user_wallets/signer_grants/wallet_operations (FORCE RLS, no expiry, no budget columns), idempotent sync + conflict + forged-owner rejection, grants 10 USDC/transfer + 50 USDC/rolling-3600s via Privy-config-only enforcement (accepted aggregate overshoot), activation with server read-back (PEW-013), revoke flow, fixture-first signing pipeline with atomic claim + per-wallet nonce serialization + exact ERC-20 calldata (chain 5042002, USDC 0x3600...0000) + decode/verify + restricted bytes + F6 reconciliation (lost-signing vs lost-broadcast, identical-bytes-only retry), 5 authenticated HTTP routes, fail-closed live Privy client, frontend wallet lifecycle + permission UI (indefinite revocable, separate fees, overshoot caveat).

### Correction (2026-09-09, slice: signer enrollment)

The prior "verification ALL GREEN" claims for the embedded scope were FIXTURE-ONLY; live sync/enrollment was NOT implemented then. This slice adds: real owner-verified sync (PrivyServerClient list-by-owner), prepare/complete enrollment with immutable per-user policy + server readback (active only on proof), live read-only smoke PASS (GET /v1/wallets → 200, 0 wallets), and the rolling-window enforcement BLOCKED pending wallet-identity group-by proof (parent gate; external config request recorded in signer-enrollment-status.md). Live login/capability probes and pipeline-to-conversation wiring remain open and are not claimed fixed.

### Open / blocked (never fabricated)

- LIVE-SMOKE: BLOCKED — missing vault-env keys: PRIVY_APP_ID, PRIVY_APP_SECRET, PRIVY_VERIFICATION_KEY, PRIVY_AUTHORIZATION_PRIVATE_KEY, VITE_PRIVY_APP_ID. Live Privy login smoke, live capability probes (gas bound, window min, policy enforcement against the configured app) and Arc test-fund transfer remain blocked until credentials exist; live signing stays disabled.
- FEE-Q2: fee accounting pending user confirmation (current behavior: fees shown separately, do NOT consume the caps).
- Recovery live flow (PEW-010 same-address proof) requires credentials.

## Verification log (durable)

- 2026-09-08: docs r3 consolidated; both state.yaml YAML-clean (edit-tool lint).
- 2026-09-08 WU1: isolated compose project `nana-privy-impl` (pgvector 0.8.1-pg16, port 5432). NOTE: bind-mount of docker/init/001-recipient-app.sql failed once on VirtioFS ("Is a directory"); applied manually via docker exec psql. Migration order 001→004 applied via npm run db:migrate (4 files).
- 2026-09-08 WU1: `npx vitest run tests/integration/users-db.test.ts` → 11 passed / 0 failed (fresh-DB sequence, concurrent provisioning, RLS scoping, recipient_app denials, NOBYPASSRLS, sentinel idempotency + conflict).
- 2026-09-08 env fix: embedding model cache was empty in this worktree; copied the complete model from the primary checkout's .cache (HF download stalls in sandbox). `npm run memory:prefetch` times out here — recorded as environment blocker, not a code issue.
- 2026-09-08 isolation regression fix: users FKs (NOT VALID) correctly reject unprovisioned users; added tests/fixtures/provision-user.ts and provisioned per-test userIds; server demo startup provisioning via onReady hook (PMU-004) pending in server.ts.
- 2026-09-08 gitleaks advisory (pre-existing, reviewed and dismissed, dispositions recorded via lens_diagnostic_mark): flagged values are (a) 42-char hex Ethereum test-fixture ADDRESSES (public identifiers) in api-wallet-official-wdk / wallet-api-normalization tests, (b) synthetic redaction-test fixtures in redaction.test.ts and telemetry-boundary.test.ts (plus its archived .txt copy), (c) an empty placeholder in .env.example:65 and a commented example PEM header template in .env.example:111 and docs/livekit-development-runbook.md:58. No real credentials exist anywhere in the tree; no rotation applicable; none of these files modified by this session.
- 2026-09-08 project-wide lens full scan: ~80 blocking findings across the repo are pre-existing (evals/voice realtime TS errors, zizmor unpinned CI actions, opengrep wss/nginx advisories in docs+compose, knip unlisted test deps, SQL-literal warnings in evals against fixture DBs). Repo CI gate (eslint + tsc) passes independently. Session-introduced files are clean; session-introduced rule violations (seed.ts unchecked throw) were fixed in-session.

## Docker/voice audit (2026-09-09, read-only — findings only, no files mutated)

Full report: docker-voice-audit.md. Headline: live voice needs LIVE_VOICE_ENABLED=true + Ed25519 LIVE_VOICE_BINDING_PRIVATE_KEY (PEM, Ed25519 via assertEd25519Key) on the API + matching LIVE_VOICE_BINDING_PUBLIC_KEY on the worker; STT needs NAN_API_KEY (nan.builders whisper); TTS needs ELEVENLABS_API_KEY (or ELEVEN_LABS); worker needs OPENAI_API_KEY (both demo and privy branches of readWorkerProcessConfig); LIVEKIT_URL/API_KEY/API_SECRET (LIVEKIT_DOCKER_URL ws://livekit:7880 internal, LIVEKIT_BROWSER_URL must stay ws://localhost:7880 for the browser); voice-worker profile in compose. Privy-mode room-token auth is already enforced (PMU-020); /v1/live-bindings 503 is correct behavior when LIVE_VOICE_ENABLED=false or binding key missing — fix is env, not code. Known privy-mode worker caveat: WorkerProcessConfig.demoUserId='' in privy mode; memory revalidation now goes through memoryForUser (resolved binding.sub), but any code path still reading config.demoUserId at runtime in the worker would get an empty tenant id — flagged for the live-voice slice.
