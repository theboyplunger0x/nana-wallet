# Signer enrollment status (bounded slice: real sync + addSigners enrollment)

Owner: Pi implementation session. Parent owns external config checks, herdr-session.md, and the Portless launch. Updated 2026-09-09.

## Controlling gates (parent, 2026-09-09)

- Only the key quorum is registered (read-back verified by parent). ZERO wallets on the app; no policy/aggregation created yet.
- Per-user policy creation deferred to the authenticated `prepare` flow (owner user DID).
- Shared aggregation resource may be created ONLY when wallet-identity grouping is proven. Docs evidence (official): `group_by` fields derive ONLY from request fields (`ethereum_transaction` | `ethereum_calldata`); NO `system.wallet_id` group-by is documented; aggregation definitions capped at 10 per app (r2 review). `from` is client input → grouping by `from` is NOT accepted as per-wallet proof.
- Consequence (implemented): rolling-window 50 USDC/3600 s readiness is **BLOCKED** (`aggregationReady:false` + explicit reason); no aggregation resource is created; no gas/recipient widening to force creation.

## External config request to parent (safe, no action by me)

To unblock the 50 USDC/rolling-3600 s provider enforcement, parent needs one of, via Privy support/dashboard (read-only confirmation acceptable):

1. Confirmation that a wallet-identity group-by scope exists for `eth_signTransaction` aggregations (e.g. a `system.wallet_id` field), OR
2. Confirmation of a per-wallet aggregation quota > 10/app (one aggregation per wallet), OR
3. Privy's documented position that a shared aggregation grouped by the request `from` field is the supported per-wallet partition (not accepted on our side without that statement).

Until then: per-transfer cap (10 USDC), recipient allowlist, chain 5042002 and gas ceiling ARE enforced by the per-user policy; the rolling-window piece is absent and readiness stays blocked.

## Actual provider surface (verified against official docs + live)

| Operation | Route | Auth | Verified |
| --- | --- | --- | --- |
| List wallets | `GET https://api.privy.io/v1/wallets` | `privy-app-id` + `Authorization: Basic base64(appId:appSecret)` | **LIVE PASS**: 200, `{data:[], next_cursor absent}`, 0 wallets |
| List wallets (limit param) | `GET /v1/wallets?limit=10` | same | **LIVE FAIL**: 500 "Unable to process request" — query-param shape unconfirmed; plain GET is the proven baseline |
| Owner filter | `GET /v1/wallets?owner=<did>` | same | Implemented per docs; live shape unverified until a user wallet exists |
| Wallet readback | `GET /v1/wallets/:id` | same | Implemented; used by complete-readback |
| Create policy | `POST /v1/policies` body `{version:'1.0',name,chain_type:'ethereum',rules[]}` | same | Implemented (contract-tested); live creation deferred to authenticated prepare |
| Policy readback | `GET /v1/policies/:id` | same | Implemented |
| Aggregation | `POST /v1/aggregations` | same | NOT CALLED (parent gate) |
| Frontend enrollment | `useSigners().addSigners(...)` | Privy user session (browser) | Docs shape `addSigners({params:{walletAddress,signers:[{keyQuorumId,policyIds}]}})`; **installed SDK exposes `addSigners({address,signers:[{signerId,policyIds}]})`** — bound to the installed SDK (noted in code); the server complete-readback is the source of truth, never the browser flag |

## Implementation state (this slice)

Backend:

- `src/config/privy-server.ts`: app id/secret + quorum id + P256 SPKI public key validation (no values ever printed).
- `src/wallet/privy-server-client.ts`: real client, injectable fetch; list-by-owner / get-wallet / create-policy / get-policy; Basic auth; typed errors without secret material.
- `src/wallet/enrollment-policy.ts`: single policy, rules = chain 5042002 + USDC contract + `transfer` amount ≤ 10 USDC + recipient allowlist + gas ceiling; NO aggregation condition (gate); exact calldata ABI field naming flagged for live confirmation at complete-readback.
- `src/wallet/embedded.ts`: `preparePermission` (immutable policy per user/wallet; reuses pending grant; 503 when quorum missing), `completePermission` (server readback MUST prove owner DID + signer attachment with EXACT stored policyId → only then `active`; `verified:false` otherwise, grant stays pending), real sync wiring via `listWalletsByOwner` (one wallet → ready; zero → unprovisioned; multiple → conflict; never creates wallets server-side).
- Routes: `POST /v1/wallets/current/permission/prepare`, `POST /v1/wallets/current/permission/complete`; permission GET carries `aggregationReady:false` + block reason.

Frontend:

- `PrivySignerEnrollment.tsx` (lazy, rendered ONLY inside the Privy tree): user consents via Privy modal → `addSigners` with backend quorum + immutable policy.
- `WalletLifecycle.tsx` privy flow: prepare → addSigners → complete(readback) → refetch; `verified:false` surfaced honestly; aggregation-blocked state shown.

## Tests and coverage

- `tests/unit/privy-server-client.test.ts`: exact method/url/headers (Basic present; secret never in errors), `{data:[...]}` parsing. PASS.
- `tests/integration/wallets-enrollment.test.ts`: prepare idempotent (same policyId), returns quorumId+policyId+`aggregationReady:false`; complete proves owner+policy → active; forged owner stays pending; sync 0/1/2 wallet paths; client success flag alone can never activate. PASS.
- Suites: backend 532 passed / 10 skipped / 0 failed; frontend 65/0; lint+tsc+build both sides 0.
- Live read-only smoke (`scripts/privy-live-smoke.mjs` via `vault-env run --names PRIVY_APP_ID,PRIVY_APP_SECRET`): **PASS** — GET /v1/wallets → 200, 0 wallets, zero mutations. `?limit=` 500 recorded above.

## Live server verification (Portless launch, 2026-09-09)

- Probed WITHOUT mutations against `https://nana-privy-api.localhost`: `/health` 200; `POST /v1/wallets/current/permission/prepare` → **401** unauthenticated (route live); `GET /v1/wallets/current` → **401** (route live). **No restart required** — the running backend already serves the enrollment surface with real Privy identity (JWKS PEM bundle) + injected app secret/quorum.
- Health advertises `sepolia` fixture network (legacy WDK read layer): Arc is NOT enabled and must not be claimed. WDK stays fixture (PMU-024 guard).

## Restart config reference (only if a restart is ever needed)

- Backend (Portless `nana-privy-api`): PRIVY_APP_ID + PRIVY_APP_SECRET + PRIVY_AUTHORIZATION_KEY_QUORUM_ID injected via vault-env; optional PRIVY_API_BASE_URL (default <https://api.privy.io/v1>); WDK_TOOLS_SOURCE=fixture, IDENTITY_PROVIDER=privy, PEM bundle env per parent's launcher. The private signer key is NOT used by this slice and must NOT be injected.
- Frontend (Portless `nana-privy`): only VITE_PRIVY_APP_ID (+ VITE_IDENTITY_PROVIDER=privy). No app secret in the frontend, ever.

## Honest limitations / open items

1. Wallet-identity aggregation scope unproven → rolling-window enforcement blocked (see request to parent).
2. `?owner=` filter and wallet-readback signer/policy field names are live-unverified until a user wallet exists (probed by prepare/complete, never by guessing).
3. Real Privy browser E2E (two users, injected test-identity boundary, Portless) is pending the parent's PEM-bundle identity fix that gates the backend launch (parent owns that file); the harness runs once the backend is up.
4. Actual wallet creation + consent happens in the user's browser (Privy); we never create wallets or enroll on the user's behalf; no funds are sent or signed in this slice.
5. Pipeline wiring to conversation execution and live signing remain out of this slice and stay disabled.
