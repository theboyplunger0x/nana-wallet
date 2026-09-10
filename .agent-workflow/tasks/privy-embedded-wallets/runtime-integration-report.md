# Runtime integration report — per-user Privy wallet (2026-09-09)

Status: implementation landed by parent-reassigned bounded agents; this file records the integrated state, verification evidence and exact open blockers. Ownership: Pi session verifies and reports; parent owns receipt/external research.

## Contract corrections that landed (authoritative evidence)

- Privy wallet object uses `owner_id` (key-quorum owner id, NOT the user DID) + `additional_signers` + `entity{id,type}`. `owner`/`signers` field names do not exist — the client models the documented shape.
- Wallet list filter is `GET /v1/wallets?user_id=<Privy DID>` (docs /private/tmp/privy-wallet-list.md). `owner_id` is never treated as the user DID and never trusted from client input.
- Aggregation schema (docs /private/tmp/privy-aggregation-create.md): `ethereum_transaction` metric fields enum = `to`, `value`, `chain_id` ONLY — the previously drafted gas condition is unsupported and `in_condition_set` was the wrong operator (use `in`). Enrollment/signing is NOT enabled on those fake policy assumptions; the rolling 50 USDC/3600 s enforcement remains BLOCKED pending parent's aggregation research.

## Implemented (verified by tests, not mocks-only claims)

- Per-user WalletProvider resolution in privy mode: wallet routes (address/balance/history surface via /v1/wallets/*) and conversation preview/confirm resolve the authenticated user's own wallet; no global/demo fallback in privy mode; WDK/Circle adapters remain legacy demo-only.
- Ownership: Privy's authenticated `user_id` filter is the ownership proof; the user's `privy_did` comes from the `users` table; browser-provided ids/addresses/owner_id are never ownership evidence.
- Enrollment: prepare (immutable per-user policy) → browser addSigners consent → complete (server readback proving owner + exact policy id) → `active`. Never auto-regrants a revoked signer.
- Live signing stays blocked until the parent proves the exact rolling-window aggregation scope. No invented provider request shapes.

## Verification (actual execution, this session)

- Backend: lint 0, typecheck 0, build 0, evals 16/16 (100%), tests **591 passed / 10 skipped / 0 failed** (2 transient parallel-run flakes re-ran green).
- Frontend: tsc 0, tests **69 passed / 0 failed**, build 0.
- Focused enrollment/sync suites: 33/33 (client contract, enrollment idempotency + forged-owner rejection, sync 0/1/2-wallet paths, non-trustable client flags).
- Live read-only smoke (vault-env): GET /v1/wallets → 200, 0 wallets, zero mutations (earlier recorded; unchanged provider state).

## Real reads vs blocked signing (explicit)

- REAL: wallet sync/readiness, ownership verification via authenticated server filter, balance/history read surface (per-user resolution), prepare/readback endpoints, contract-level policy building.
- BLOCKED (never claimed working): live signing/broadcast (awaiting parent proof of the exact rolling 50 USDC/3600 s aggregation policy), wallet readback of signer/policy fields on the real app (needs a user wallet to exist), live two-user browser E2E with real OTP.

## Remaining (owner: parent unless reassigned)

1. Aggregation policy proof (rolling window) — parent researching.
2. Live wallet creation by a real user (browser) → then owner-filter + readback live verification.
3. `?owner=` → `user_id=` filter live verification against the real app once a wallet exists.
4. Docker compose.privy-local.yaml rebuild by parent to pick up current src.
