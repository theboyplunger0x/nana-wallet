# Runtime provider evidence, 2026-09-09

Scope: complete existing wallet functionality for authenticated Privy users. Existing WDK and Circle Arc adapters remain in source; current HTTP routes authenticate then discard the user identity and use global WALLET/NETWORK. Conversation runtime injects core.wallet singleton. This is the integration gap, not deletion of previous wallet implementation.

Read-only provider checks executed with vault-env (no values printed): GET /wallets HTTP200, zero wallets; GET /users paginated two requests, one user, zero Privy embedded Ethereum linked accounts. No live wallet creation or transfers performed. Public Arc RPC eth_chainId5042002 and USDC decimals6 verified.

Authoritative current references:

- <https://docs.privy.io/api-reference/wallets/get-all> : user filter is user_id, not owner. Pagination uses next_cursor.
- <https://docs.privy.io/api-reference/wallets/get> : wallet returns owner_id (key quorum), additional_signers, entity. A fabricated owner DID field is not sufficient contract evidence.
- <https://docs.privy.io/controls/policies/stateful-policies> : app-scoped aggregation; at most10 aggregations, rolling window minimum3600sec; documented group_by sources are request-derived. Per-wallet identity partitioning remains unproven.
- <https://docs.privy.io/api-reference/aggregations/create> : EthereumTransactionConditionField enum is to,value,chain_id. Prior gas condition is unsupported by this documented schema; recipient array must use in rather than condition-set reference operator. Existing enrollment payload cannot be treated as effective provider protection.

Implementation can safely complete real user-scoped reads and reject transfers explicitly until provider protections are established. Do not replace user-required Privy-only limits with local SQL caps or claim signing ready on fixture policy tests. No shared funded/demo fallback for Privy identities.

Orchestration: resumed Pi nan/glm5.3-flash high in recorded tab. Its response was unrelated and produced no accepted implementation; instructed it to stop. Parent reassigned bounded native agents privy_user_runtime (runtime/routes/conversations/provider/tests) and privy_ownership (trusted provider client/sync/frontend/tests), preserving all work. Parent owns Docker config, final checks and this evidence. Existing feature/signing completion remains unverified.

## Implemented runtime boundary

Privy identities now resolve their wallet from the authenticated internal user and the server-side Privy user_id membership query in HTTP, text and voice. Zero/multiple eligible wallets and stale mismatched bindings fail closed; no demo wallet fallback. Arc chain5042002 and token decimals6 are probed before actual balanceOf reads. Frontend creates the embedded wallet on login, synchronizes after SDK readiness and shows USDC from the wallet endpoint. Unsupported history returns501 explicitly without hiding a successful balance.

Live enrollment and legacy activation remain blocked while provider policy scope/fee enforcement is unproven. Existing active DB records do not establish live signing readiness. A new isolated transaction transport validates signed RLP, recovered sender, intent, chain, fees and transaction hash, with uncertain outcomes preserved. It is NOT connected to durable transfer orchestration. The old fixture pipeline rejects live clients before claiming an operation; no fabricated transaction can be returned as real.

Independent review caught and fixed stale readiness, multiple-wallet selection, legacy grant activation and timeout/body handling gaps. Final concurrent-sync ordering fix is being verified separately. Relevant final transport tests31/31 passed. Frontend frozen source:69/69 tests passed, lint/typecheck/build passed. Backend preliminary full isolated-DB run:587 passed10 skipped;16 evals passed. Final backend run and Docker rollout evidence follow below; these preliminary counts are not full live acceptance.

Browser discovery found no connected Chrome; standalone Chromium can verify the real sign-in dialog but cannot complete owner authentication. No OTP, wallet creation or transfer has been requested by an agent.
