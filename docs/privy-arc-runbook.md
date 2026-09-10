# Privy + Arc runbook (pinned facts for implementation)

Pinned 2026-09-08 via web research from official documentation (main-Pi-high revalidation; supersedes the blocked medium-effort research attempt). Live-capability probes against the configured Privy app remain a WU-E1 requirement once credentials exist — every item below marked **LIVE** must still be proven there.

## Privy SDK and auth

| Item | Value | Source |
| --- | --- | --- |
| Frontend SDK | `@privy-io/react-auth@^3.40.0` (installed in apps/nana-wallet; React 18+ supported) | npm + docs.privy.io/basics/react/installation |
| Token retrieval | `usePrivy().getAccessToken()` — refreshes near-expiry/expired tokens automatically | docs.privy.io/authentication/user-authentication/access-tokens |
| Access token | ES256 JWT, ~1h validity, `Authorization: Bearer` | same |
| Backend verification | ES256 JWT verify with app verification key, `iss=privy.io`, `aud=<app id>`; `exp` mandatory | same + API reference |
| Server SDK | `@privy-io/server-auth` historically provided `verifyAuth`; newer docs point to `@privy-io/node` — **LIVE**: pin the exact verification path in WU-E1 with credentials. Nana's own `PrivyIdentityProvider` verifies locally with `jose` (implemented, no SDK dependency). | npm/docs |

## Privy policies (spending limits)

| Item | Value | Source |
| --- | --- | --- |
| Window types | Only `'rolling'` windows supported | docs.privy.io/controls/policies/stateful-policies |
| Aggregation | "Tracks the running sum of USDC transfer amounts from eth_signTransaction requests over a rolling time window"; policy rejects signing when the running total would exceed the cap | docs.privy.io/recipes/using-stateful-policies |
| Update semantics | "When a request is made, all aggregations referenced in the wallet's policies are updated" — the r2 review (06-spec-review-open-questions.md, 2026-09-08) documents that these updates occur after signing and are not atomic with concurrent signing requests: concurrent requests can pass before values are recorded. This limitation is accepted (state.yaml `concurrent_aggregate_overshoot_limitation: accepted`) | same |
| Min window | 3600s recorded in 06-spec-review (verified against docs on 2026-09-08). **LIVE**: confirm per-rule support for the 50 USDC / 3600s wallet-partitioned aggregation | 06-spec-review + docs |
| Non-negotiables | No local SQL spending cap; Privy config is the only enforcement boundary; preview + explicit confirmation per payment stays an application control (not provider-guaranteed) | controlling decision, 06-spec-review |

## Arc Testnet

| Item | Value | Source |
| --- | --- | --- |
| Chain ID | 5042002 ("Set the Chain ID to `5042002`" — RPC error guide) | docs.arc.io/arc/references/rpc-endpoints |
| Native gas token | USDC (USDC is the gas asset; no WETH-style wrapper needed — native USDC satisfies IERC20 directly) | docs.arc.io/arc/references/contract-addresses |
| Decimals | 18 (native), 6 (ERC-20 interface) | docs.arc.io/integrate/infrastructure/bridges |
| USDC ERC-20 interface | `0x3600000000000000000000000000000000000000` (optional ERC-20 interface over the native USDC balance) | docs.arc.io/arc/references/contract-addresses |
| viem support | Arc Testnet ships as a built-in chain | docs.arc.io/arc/references/connect-to-arc |
| RPC / explorer / test funds | **LIVE**: confirm exact endpoint URLs and faucet path in WU-E1 | docs.arc.io |
| Receipt/event behavior | Validate Arc's documented emitter/log format before relying on conventional ERC-20 Transfer events | design r3 |

## Implementation consequences (r3)

- Transfer caps count transfer amount only; fees are shown separately in USDC and bounded by the Privy gas policy (recorded implementation assumption, pending Q2 user confirmation).
- Signing pipeline (fixture-first): atomic operation claim + per-wallet nonce reservation → exact `transfer(recipient, amount)` calldata, zero native value → `eth_signTransaction` under policy → decode/verify signed bytes → persist bytes+hash restricted → `eth_sendRawTransaction` → receipt verification. Lost-signing-response and lost-broadcast-response are distinct reconciliation cases; retries reuse identical persisted bytes only.
- Live signing stays disabled until WU-E1 proves the provider-side per-transfer cap, rolling window and gas bound against the configured app.
