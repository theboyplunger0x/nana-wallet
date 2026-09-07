# Apply Progress: circle-arc-runtime-integration

## Batch 1 = PR A (this run)

Scope: design batches 1–3 (tasks batches 1, 2, 3) + the D3/D7 confirm-path seam. PR B/C (batches 4–6, fake-Circle integration) untouched.

### Completed tasks (all checked off in tasks.md)

- Batch 1: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
- Batch 2: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
- Batch 3: 3.1, 3.2, 3.3, 3.4
- Batch 4 (partial, per explicit parent slice): 4.1 (waiter selection in `executeConfirmedTransfer`) — the parent slice instruction required it; `src/wdk/transaction-receipt.ts` left byte-identical as mandated.

### Files changed

- `src/wallet/circle-arc-provider.ts` — `waitForFinality` hardened: single `eth_chainId` pre-check (parse failure or mismatch → immediate throw naming `arc-testnet` chain id; NOT swallowed into keep-polling), receipt-hash echo validation (case-insensitive; mismatch → `Arc RPC returned a receipt for a different transaction.`), transient receipt-read errors keep polling to the 120 s deadline then throw. Dropped the unused `eth_getTransactionByHash` leg of the poll. Idempotency (`previewId ?? randomUUID()`), 20 s/120 s deadlines, `uncertain`-on-timeout, empty ledger, `assertNetwork`, recipient/burn/self guards all preserved.
- `src/agent/definition.ts` — exported `SendTokenBroadcastInput = SendTokenInput & { previewId?: string }` (zod schema unchanged, model never sees `previewId`); `sendToken` copies a present `previewId` into the outgoing `TransferRequest`; exported `isLiveTransferSource(environment = process.env)` (`live` || `circle-arc`); `validateWalletTransferPolicy` gates on it.
- `src/agent/wallet-agent.ts` — `validateLiveTransferPolicy` gates on the shared `isLiveTransferSource`; `buildGuardedTools.guardedSendToken` injects `session.pendingTransfer.previewId` into the broadcast call input only when `dryRun:false`, `pendingMatches`, and a `previewId` exists (legacy WDK in-memory pending has none → WDK path byte-identical, CAR-015); confirm branch of `handleMessage` builds definition tools via `createWalletAgentDefinition()` + `toAiSdkTools` with `options.walletProvider` and only falls back to `getWdkTools()` without a provider; `executeConfirmedTransfer` widened with `walletProvider?`, selects the waiter (explicit injected waiter > `walletProvider.waitForFinality` > `defaultTransactionReceiptWaiter`), and its receipt/reverted messages are network-parameterized (`The ${pending.network} receipt ...`, `The transfer reverted on ${pending.network}.`); waiter exceptions surface their reason (`...could not be verified: <error.message>`).
- `src/conversations/service.ts` — `toTransferRequest` forwards `transfer.previewId` (conditional spread).
- Tests: extended `tests/unit/circle-arc-provider.test.ts` (fixture now returns echoing receipts + captures `createTransaction` inputs; new chain-id fail-closed, echo-mismatch, case-insensitive echo, transient-keep-polling, idempotency key/refId reuse vs last-resort key, testnet-only broadcast rejection tests); extended `tests/unit/wallet-agent-policy.test.ts` and `tests/unit/wallet-agent-definition.test.ts` with circle-arc parity matrices for BOTH gates (missing vars, over-limit, non-allowlisted/burn/malformed recipients, wallet/network/token mismatch, matching passes); new `tests/unit/wallet-agent-confirm-seam.test.ts` (duplicate confirm → `broadcast_in_progress`, uncertain retry → `broadcast_uncertain` with no second broadcast, missing preview → `no_pending_preview`, previewId preserved end-to-end through the provider seam, reverted → `transfer_reverted` naming the network, verification throw → `transaction_receipt_invalid` with reason); new `tests/unit/conversation-preview-id.test.ts` (typed `resolveDecision` confirm carries the persisted `previewId` from the claimed transfer through `toTransferRequest` into the broadcast request).

### Verification evidence (exact commands, in the worktree `/Users/ramiro/Desktop/projects/personales/aleph-hackathon.arc-migration`)

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` (`eslint src tests --max-warnings=0`) | exit 0 |
| `npx vitest run tests/unit/circle-arc-provider.test.ts tests/unit/wallet-agent-policy.test.ts tests/unit/wallet-agent-definition.test.ts tests/unit/wallet-agent-confirm-seam.test.ts tests/unit/conversation-preview-id.test.ts` | 5 files / 83 tests passed |
| `npm test` (full Vitest suite) | 69 files passed, 8 skipped; 408 passed, 17 skipped — no regression on fixture/live/WDK paths |

Standard Mode (strict_tdd: false per tasks.md): tests written alongside each change; verification evidence above.

### Deviations from design

- 4.1 implemented in PR A (parent slice instruction) even though tasks.md schedules it for batch 4/PR B; its dedicated test matrix (4.3) is NOT done — PR B.
- The guarded previewId injection is conditional on `previewId` existing (design says inject `session.pendingTransfer.previewId` unconditionally); the conditional spread keeps the legacy WDK path byte-identical (CAR-015) while satisfying CAR-006.
- Removed the unused `eth_getTransactionByHash` call in the finality poll (it was fetched and never read).

### Remaining tasks (unchecked)

- 4.2 (`normalizeBroadcastResult` → `explorerUrlFor`), 4.3 (explorer/waiter-selection tests) — PR B.
- Batches 5 (health contract), 6 (boot guard, `.env.example`, compose, docs), 7 (root verification, frontend suite, fake-Circle integration, manual E2E — 7.4 intentionally unchecked for the user) — PR B/C.
- Post-Apply Review (`<!-- sdd-owner: parent -->`) — parent-owned deferred lifecycle action.

### Workload / PR boundary

- PR A of 3 stacked PRs; delivery path resolved by parent (3 stacked, size:ok ≤400 lines).
- Actual diff: ~175 changed lines in `src/` (well inside budget) + ~465 lines of required test extensions/new suites → total ~640 changed lines, above the 400-line target. All extra lines are mandated tests (1.3, 1.4, 1.5, 2.6, 3.4 + seam tests); no test was dropped to fit the budget. Flagging to the parent for the PR boundary decision.

### Notes

- Engram was unreachable during this run (`127.0.0.1:7437` down); the artifact store for this change is the openspec files in the worktree — this file and the tasks.md checkboxes are the persisted progress (first apply-progress; nothing to merge from a prior run).
- No git commit performed (parent owns commits).
