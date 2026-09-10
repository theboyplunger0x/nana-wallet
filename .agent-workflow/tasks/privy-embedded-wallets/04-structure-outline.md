# Structure outline: Privy embedded wallets

Revision: 2026-09-08-r3. D1 limited backend signer, D2 Privy recovery and D3 Arc Testnet selected by user. r3 incorporates the controlling permission decision (indefinite revocable permission; 10 USDC per transfer; 50 USDC per rolling 3600 seconds enforced only through Privy configuration; no local SQL spending cap; aggregate concurrency limitation accepted) and the F6 broadcast-actor fix. Fee accounting follows the recorded implementation assumption (amount-only caps, fees separate) pending Q2. User explicitly authorized implementation; the earlier not-authorized gate is superseded.

## Prerequisite

Complete and verify privy-multi-user-foundation, including PMU-020..026. Keep its database/RLS, authenticated voice, session generation and fixture-only singleton guard. Reconcile shared runtime changes before starting wallet implementation.

## WU1: Privy/Arc compatibility and policy proof

Own proposed docs/privy-arc-runbook.md and a bounded tests/integration/privy-capabilities test harness. Pin compatible SDK versions and server API fields for user ownership, signer enrollment, policy owner, stateful rolling-window limits, gas restrictions, revocation, recovery and eth_signTransaction on 5042002. Test policy self-escalation with spending credentials. Validate decimals()=6, native USDC gas identity/18-decimal accounting and the shared underlying balance behavior without double-counting. Explicitly prove the provider-side per-transfer cap, the 3600-second rolling window and the gas bound; unsupported restrictions leave signing disabled. No capability is called verified until the configured app passes. Missing PRIVY_* credentials are a specific live blocker; never enable an unlimited fallback. Existing explicit fixture unit checks remain offline. Freeze the supported endpoint/DTO/policy mapping before WU2.

Evidence: negative provider requests rejected, ordinary permitted sign under a user-approved finite grant, recovery of the same wallet and exact SDK/config receipt. Signing/live transactions require separate scope authorization. Rollback: remove probe wiring, preserve any externally created assets and grants; never delete user wallets.

## WU2: Durable wallet bindings and permission records

Own new migrations after the foundation, src/wallet binding/grant repositories, and users-scoped wallet/permission HTTP contracts. Implement idempotent sync from verified provider ownership, unique active bindings, grant snapshots, permissions status/revoke flow and RLS. Implement atomic operation claims and per-wallet nonce reservation; there is no local amount/fee budget reservation — limits are enforced exclusively by the configured Privy policies. Keep backend and frontend contracts duplicated, tested by identical HTTP examples independently.

Evidence: DB integration A/B isolation, concurrent first login, provider-success/DB-failure reconciliation, forged owner rejection, active/revoking/revoked/unavailable grant states and forbidden policy mutation. Rollback: disable routes/provider selection without deleting bindings; preserve uncertain attempts for reconciliation.

## WU3: Per-user provider and durable transfer path

Own src/wallet Privy provider, src/runtime/dependencies.ts, src/conversations/service.ts and their HTTP state additions. Resolve wallet/grant from trusted identity in text and voice. Preserve preview/confirm and recipient-version checks; construct bounded ERC-20 payload, claim/reserve, sign with Privy, verify signed payload, persist hash/bytes, then broadcast exact bytes through Arc RPC. Reconcile hash/receipt without retrying with a new nonce. Expose submitted/rejected/reverted/uncertain distinctly. Replace the singleton guard only for the verified per-user provider.

Evidence: unit/integration/eval cases for missing confirmation, cross-user wallet, wrong chain/decimals/calldata, concurrent confirm, provider rolling-window policy enforcement with accepted aggregate overshoot, crash at every boundary, raw-byte redaction, lost-signing-response and lost-broadcast-response reconciliation, cancellation and grant revocation races. Check Arc receipt/event behavior using primary documentation and live evidence. Rollback: stop new claims/signatures, revoke where possible and retain reconciler; never use WDK/Circle as fallback.

## WU4: Web wallet lifecycle and permission UI

Own apps/nana-wallet wallet/profile routes, api.ts/types and voice-facing status UI. Present wallet readiness separately from permission readiness, explicit enrollment of the indefinite revocable permission, reviewable recipients/limits (10 USDC per transfer, 50 USDC per rolling hour) with the documented aggregate-overshoot caveat, revocation and Privy-managed recovery. Show both amount and fee in USDC separately without unit mixing; do not claim fees consume the transfer caps. Account switch clears old wallet/grant/conversation state; late callbacks are generation-scoped. Payment confirmation remains available in text/voice; no per-payment browser signing prompt is introduced.

Evidence: frontend tests/build and two-user Portless browser E2E against real fixture API/DB, including enrollment, preview/cancel, confirm, revoke, logout/race and recovery doubles. Test empty/missing/unbounded parameters cannot activate a grant. Keep demo fallback explicitly gated. Rollback: disable new wallet controls and show unavailable state, not another wallet's balance.

## WU5: Final verification and delivery

Run backend npm run lint, npm run typecheck, npm test with DB, npm run eval, npm run build; frontend lint/typecheck/test/build; browser E2E and relevant fixture voice/WDK regressions. Live smoke, only with actual credentials and authorized test funds: configured email/phone login, same-wallet recovery, signer enrollment of the indefinite permission, permitted transfer receipt, denial of wrong recipient/over-limit/revoked grants. Record commands, counts, skips, policy configuration and exact blockers. Read-only fixture evidence cannot substitute for OTP, policy or testnet results.

Deliver chained PRs with each slice's applicable checks; final shipping claim requires the full matrix. No PR/push/merge/live mutation is authorized by this outline. Archive only after dependent baseline sequencing and all required evidence.

## Acceptance map

PEW-001..005: WU1/WU2/WU4. PEW-006..008: WU2/WU3/WU4/WU5. PEW-009: WU3/WU4/WU5. PEW-010: WU1/WU4/WU5. PEW-011: WU1/WU3. PEW-012: WU5. PEW-013: WU1/WU2/WU4. PEW-014: WU1/WU2/WU3.

## Review-session housekeeping

Preserve the worktree/session receipt and independent review before closing only the created review pane. This is review orchestration, not a product verification gate.
