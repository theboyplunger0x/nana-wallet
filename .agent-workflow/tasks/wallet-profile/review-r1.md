# Independent review r1 — 04-structure-outline.md

- Reviewed artifact: 04-structure-outline.md r1
- SHA256: 56ef74e46627e730a6110f3d4bd7453fd951f993bd2465d3d188fa9d02b7f806
- Reviewer: Pi, model nan / glm5.3-flash, reasoning effort high
- Basis: 03-design-discussion.md r1 and 03a-open-questions.md (both approved by Ramiro). Bounded plan review — no implementation, no network, no secrets/env reads, no delegation. Privy base is an uncommitted snapshot; inherited code was evaluated only as evidence of the base, never as work belonging to this plan.

## Verdict

READY for human approval, with one controlling correction (F1) to the balances contract wording. The plan is otherwise consistent with the approved design, the approved Q1–Q3 decisions, and the verified codebase.

## Findings

### F1 — Controlante: Arc USDC balance model is misstated in the balances contract

The outline says the adapter "Consulta balanceOf del contrato USDC sin sumar balance nativo." On Arc Testnet, native gas asset is USDC itself: `src/wallet/circle-arc-provider.ts` (comment at line ~23) and `docs/privy-arc-runbook.md` ("Native gas token | USDC (USDC is the gas asset...)") confirm there is only one ledger. The real hazard is the 18-vs-6 decimal duality, not double counting: `circle-arc-provider.ts` reads native `eth_getBalance` (18 decimals) and formats with `TOKEN_DECIMALS = 18`, while `EmbeddedWalletService` (`src/wallet/embedded.ts`) uses `USDC_DECIMALS = 6n`. If the new balances adapter reads native balances, a 6-decimal interpretation would misstate balances by 10^12.
Required correction: reword the balances contract to (a) pin the read to the 6-decimal ERC-20 interface `balanceOf` at `0x3600000000000000000000000000000000000000` (chainId 5042002, verified consistent with `ARC_TESTNET_CHAIN_ID` / `ARC_USDC_ERC20` in `src/wallet/privy-client.ts`), and (b) state the 18-vs-6 decimal duality as the explicit hazard the validator checks, replacing the "no double counting" framing.

### F2 — Major: payment/agenda/agent entry points become unreachable during slices 1–2

Current `apps/nana-wallet/src/routes/perfil.tsx` hosts the agent confirmation flow (`ConfirmarPlata`, `runAgentAction`, suggested-action buttons for agenda events, "Pagar ahora" bill buttons). Slice 1's simple view renders none of this, and lifecycle access is only restored in slice 3. Between slices, the money-confirmation and payment entry points are unreachable through UI. The outline's stop condition covers lifecycle restoration but not restoration of payment/confirmation entry points. Required correction: state explicitly that slice 3 (or the preserved-component re-render) restores these entry points, or accept and document the interim regression in the SDD tasks.

### F3 — Major: E2E "MSW deshabilitado" is already achievable, but the outline under-specifies it

`scripts/run-browser-e2e.mjs` and `apps/nana-wallet/src/client.tsx` show MSW is bypassed via the existing `VITE_E2E_REAL_BACKEND=1` env flag; runbook comments confirm dev MSW otherwise intercepts `/v1/me`, `/v1/contacts`, `/v1/agenda`, `/v1/wallet/*`. The outline's "MSW deshabilitado" requirement is achievable but should name this flag so the implementation doesn't invent a second mechanism. Required correction: reference `VITE_E2E_REAL_BACKEND` (or equivalent) in the slice 4 spec.

### F4 — Minor: Chromium-failure semantics differ from outline wording

Existing `run-browser-e2e.mjs` treats an absent Playwright chromium as a documented BLOCKED with exit 0 ("a chromium blocker is not a FAIL"). The outline says missing Chromium should "falla/bloquea explícitamente la evidencia E2E." The existing behavior is compatible with "bloquea" if interpreted as documented-blocked; no correction required, but the SDD tasks should preserve the current exit-code contract when restating it.

### F5 — Minor: readiness-state enumeration matches the contract

Outline's non-ready union (unprovisioned|provisioning|recovery_required|conflict|unavailable) matches `walletReadinessStateSchema` in `src/contracts/http.ts` minus `ready`. Consistent — no correction needed.

### F6 — Minor: infrastructure references verified

- `EmbeddedWalletService.getCurrentWallet(userId)` exists in `src/wallet/embedded.ts` and reads under RLS via `withUserTransaction` — outline reference valid.
- Chain ID 5042002 and USDC contract `0x3600000000000000000000000000000000000000` match `ARC_TESTNET_CHAIN_ID` / `ARC_USDC_ERC20` in `src/wallet/privy-client.ts`.
- Generation/cancelation guard exists (`resetSession`, generation counter in `src/wallet/session-isolation.ts` and front `session-isolation.ts`) — outline reference valid.
- `GET /v1/me` returns nullable `displayName` (`src/api/me.ts`) and front `api-types.ts` reflects `displayName: string | null` — outline's profile contract matches the base.
- Portless is an established tool in this repo's runbooks (`docs/nani-e2e-runbook.md`).
- `tests/e2e/browser` does not yet exist; slice 4 correctly proposes it as new.

### F7 — Minor: query-key wiring note

Current `queryKeys.wallet(userId)` is shared by perfil and mi-plata; the outline's plan for a new key including userId and chainId is correct and should be stated as a new, distinct key. No correction needed.

### Verification of plan claims against code

- `GET /v1/me` returns nullable `displayName` (`src/api/me.ts`, `apps/nana-wallet/src/lib/api-types.ts` line ~247) — outline's profile contract matches.
- `EmbeddedWalletService.getCurrentWallet(userId)` exists, reads under RLS via `withUserTransaction` — outline reference valid.
- Chain ID 5042002 and USDC contract `0x3600000000000000000000000000000000000000` match `ARC_TESTNET_CHAIN_ID` / `ARC_USDC_ERC20` in `src/wallet/privy-client.ts`.
- Generation/cancelation guard exists (`resetSession`, generation counter in both `src/wallet/session-isolation.ts` and `apps/nana-wallet/src/lib/session-isolation.ts`).
- `run-browser-e2e.mjs` supports real-backend browser checks and Playwright chromium — outline's slice 4 direction is grounded.
- WalletLifecycle currently in `perfil.tsx`, rendered as `<WalletLifecycle userId={userId} />` — slice 1/3 plan matches the base.

## Readiness verdict

READY for human approval, conditional on resolving F1 (controlante) and recording F2/F3 corrections in the SDD tasks. No contradiction was found with the approved design (03 r1) or Q1–Q3. Scope, currency, and data decisions match the approvals. Inherited snapshot code (e.g., `circle-arc-provider.ts`, `WalletLifecycle`) is base context, not work belonging to this plan.

Next step per plan: human approval of the outline, then openspec/changes/wallet-profile/ phases (proposal → spec → design → tasks) before apply.
