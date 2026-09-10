# Spec review: permission semantics and open questions

Date: 2026-09-08. Reviewer: Codex, read-only review of application code and the frozen r2 spec/design; this report and lifecycle status are the only new mutations. User request: review the spec and ask the open questions. This supersedes the previous readiness verdict for implementation planning, without changing D1 limited backend signer, D2 Privy recovery, D3 Arc Testnet or D7 preserve-existing phone channel.

## Verdict

Changes required before treating the spec as implementable. The prior Pi review checked outline consistency but did not resolve the product rules below or identify the provider guarantee mismatch. Its historical receipt remains intact. No implementation or live validation was performed.

## Findings

### F1: blocking, cumulative-budget guarantee contradicts documented concurrency behavior

Evidence: PEW-007 and PEW-014 in openspec/changes/privy-embedded-wallets/specs/privy-embedded-wallets/spec.md:69,137 require enforced finite cumulative grant caps. design.md:35 requires provider-side enforcement and disables signing if unavailable; design.md:37 says a compromised backend can spend only within the grant envelope.

Privy's current stateful-policy documentation explicitly says aggregate updates occur after signing and concurrent requests can pass before their values are recorded. It describes these policies as disaster-prevention controls rather than strict realtime enforcement. Therefore a local SQL lock can enforce a hard limit for requests through a healthy Nana service, but cannot make the provider aggregation a hard independent limit against a compromised signing backend. Leaving this solely to WU1 to discover would preserve an unfulfillable guarantee under the documented behavior.

Required correction: resolve Q1, then distinguish per-request provider restrictions, application atomic accounting and the adversary against which each guarantee holds. If independent hard cumulative limits remain required, design an independently enforced budget path before apply. This is not approval to add ZeroDev or another mechanism.

Source checked today: https://docs.privy.io/controls/policies/stateful-policies

### F2: major, permission lifetime and aggregation layout are not specified

Evidence: design.md:29,35 allow any future expiry and a per-wallet/grant aggregation. The same provider documentation limits rolling windows to 1–72 hours and aggregation definitions to 10 per app. One definition per user or renewed grant cannot scale indefinitely; buckets and definitions must be distinguished. An arbitrary permission lifetime cannot simply be equated with one rolling window.

Required correction: resolve Q2 for the user-facing permission model. Engineering must define a bounded aggregation layout with proven tenant partitioning, renewal/old-grant retirement and budget carryover behavior. Test at least eleven users, renewal overlap, window rollover and concurrent first-use. Never let a new grant silently reset an outstanding reservation or preserve two additive signing authorities.

### F3: major, amount and fee budgets have inconsistent meaning

Evidence: design.md:29 names maxTotalAtomic6, maxGasAtomic18 and consumed/reserved budget; design.md:35 adds amount and worst-case fee to SQL reservation, while the provider metric tracks ERC-20 transfer amounts. The spec never says whether the total shown to the user includes fees, how units are rounded, or whether gas is capped per payment and/or cumulatively.

Required correction: resolve Q2, then define separate transfer and fee accounting, exact conversion with conservative rounding, worst-case reservation and settlement of actual fees. Reverted transactions can cost gas. Signed-but-unsent or uncertain attempts must not release reserved spend automatically. Include boundary tests for transfer-plus-fee over the total, fractional fee units and revert-only gas spend.

### F4: major, logout behavior lacks a server-side authorization mechanism

Evidence: design.md:45 promises current-session revalidation and logout/dispatch ordering. The identity foundation (PMU-021 and its design.md:200) specifies browser generation counters and cache cleanup, not a server-side logout signal or revocable session record for an in-flight worker. Local cache clearing cannot enforce that promise in a server signer.

Required correction: resolve Q5 for the intended user behavior; engineering must then define authenticated session identifiers, backend revocation state, how logout reaches the backend, transaction locking and multi-device scope. Distinguish closing the app, losing the network, explicit logout and explicitly revoking the signer. Already signed transactions cannot be described as canceled merely because a session ended.

### F5: major, consent scenarios do not define the product interaction

Evidence: PEW-006/007/013 require explicit confirmation and enrollment but do not define when the permission screen appears, who selects limits, how a new recipient is authorized or what voice event counts as confirmation. design.md:31 requires a new grant for broader permissions, but no scenario describes replacing a recipient address or handling existing signed operations during that change.

Required correction: resolve Q2/Q3/Q4. Specify permission presentation, recipient changes, exact preview-bound consent, expiration and denial. Test unrelated affirmative speech, two pending previews, changed recipient address, broadening by an LLM/tool and a stale enrollment callback.

### F6: minor, a retained scenario names the wrong broadcasting component

Evidence: PEW-008 scenario at spec.md:83 says Privy may have dispatched a payment. The selected design uses eth_signTransaction followed by Nana's eth_sendRawTransaction.

Required correction: split lost-signing-response and lost-Arc-RPC-response cases; identify the known operation, payload, nonce and hash at each stage. Preserve the no-duplicate-dispatch invariant.

## Open product questions

These are new behavior details, not a request to reselect backend signing, Privy recovery or Arc Testnet. All recommendations below are proposals, not recorded approvals.

| ID | Question | Recommendation for the testnet MVP | Alternative / tradeoff |
|---|---|---|---|
| Q1 | Must the cumulative cap remain strict even if the Nana signing backend is compromised? | Strict local SQL cap for normal Nana execution; provider per-transfer/recipient/expiry controls plus best-effort aggregate protection. State the limitation explicitly. | A hard independent cap requires a different independently enforced architecture and additional work; keep that requirement if essential. |
| Q2 | Who chooses the limits, what does the total include and when does the permission expire? | Reviewable testnet preset: 10 USDC per payment, 50 USDC total including gas, 24 hours, no automatic renewal. These numbers are suggestions only. | User chooses finite values; still define maximum bounds, fee accounting and expiry. No implicit unlimited preset. |
| Q3 | Which recipients are authorized? | Only contacts explicitly selected in the permission; adding a contact or changing its address needs renewed authorization. | Every confirmed contact is eligible, which broadens authority automatically and changes the current policy design. |
| Q4 | What confirms an individual payment? | Button or explicit voice confirmation tied to the currently presented amount/recipient/preview; an unrelated yes does not authorize. | Additional authentication for each payment, adding friction but stronger evidence of current user presence. |
| Q5 | What happens if the app closes or the user logs out after confirming? | Closing/network loss lets the already confirmed payment finish; explicit logout blocks work not yet signed, while signed/submitted work remains reconcilable. | Require an active session until dispatch; a disconnect may leave the payment waiting, with explicit resume behavior. |

Response update: Q3-Q5 are recorded below. The latest response selects indefinite permission, 10 USDC per transfer and 50 USDC per rolling hour, enforced only through Privy configuration. Q1 is resolved; Q2 fee accounting remains open. Earlier recommendations are historical proposals.

## Engineering checks, not questions for the user

Pin/test SDK and Arc compatibility, provider gas-field support, policy-owner privileges, idempotency semantics, native/ERC-20 units, aggregation partitioning and server-session lifecycle. Retrieve the existing phone channel when Privy access is available; do not ask the user to rediscover it. Credentials and OTP access remain actual live-check dependencies. Recovery still uses Privy and preserves the same wallet as already chosen.

## Preservation and checks

Keep the reviewed r2 spec, design, outline and historical Pi receipt byte-identical. The lifecycle state points to this report as the controlling question inventory until answers are incorporated in a new revision. No app source, tests, keys, accounts or live wallets were changed. Check report/state formatting and verify the frozen artifact hashes after writing.

## User response and disposition

User response, 2026-09-08:

- Q1: "a que te referis con presupuesto". Clarification requested; no budget guarantee selected.
- Q2: "?". Clarification requested; no numeric limits, fee treatment or duration selected.
- Q3: "Dejemoslo por ahora como esta pero luego tenemso qeu hacer un front y una parte de back donde podamos agregar eso".
- Q4: "si".
- Q5: "Dejemoslo como esta ahora".

Q3 disposition: preserve the currently specified recipient authorization rules. Record a later frontend/backend feature for managing the permitted recipients. This does not authorize implementing that management UI/API now, automatically adding all future contacts, or removing the identity foundation's existing contact-CRUD scope. The future feature must cover adding/removing allowed recipients and address changes, permission reauthorization and stale-preview invalidation. Its exact scope remains a follow-up rather than a new blocker for this review.

Q4 disposition: interpret "si" as accepting that a button or explicit voice confirmation tied to the current preview is sufficient. No additional per-payment authentication requirement is added. Preserve user/wallet/conversation/preview binding and rejection of ambiguous or stale confirmation.

Q5 disposition: preserve the current r2 behavior, without introducing a new disconnect policy. The design revalidates active grant/session before dispatch, stops new dispatch if logout/revocation wins the race, and reconciles signed/submitted/uncertain operations. Engineering must still specify the server-side session signal identified in F4; "keep current behavior" is not evidence that this mechanism is implemented.

### Clarification for Q1 and Q2

Budget means the maximum cumulative amount transferable under one permission, across its payments. A per-payment limit is separate. Permission expiry defines how long that authority lasts, and the design must state whether fees consume the cumulative allowance. The earlier 10/50 USDC and 24-hour values are examples for discussion, not approved settings. Q1 asks which component guarantees that cumulative cap and what happens if the signing backend is compromised; Q2 asks for the product limits, their duration and fee treatment. Both remain unanswered.


## Superseded decision: indefinite permission and 15-minute spending window

User response, 2026-09-08: "a que te referis a un backend comprometido? El permiso que sea indefinido y lso valores que pusiste me gusta excepto por el 50 usdc para todas las transferencias, debería ser 50usdc para todas las transferencias dentro de un rango de 15 minutos".

The permission has no scheduled expiration and remains revocable by the user. The selected amount limits are 10 USDC per transfer and 50 USDC across transfers within 15 minutes, rather than a lifetime allowance of 50 USDC. Interpret the interval as a rolling window: evaluate the preceding 900 seconds at each payment, without fixed quarter-hour resets. This rolling interpretation was stated to the user and is an implementation assumption. Each transfer still requires its own preview and explicit confirmation. Session and preview expiration remain separate from the permission lifetime.

These decisions supersede the earlier 24-hour recommendation and the r2 requirements for a finite grant expiry and lifetime cumulative allowance. The frozen r2 artifacts retain their historical content; the next spec/design/outline revision must incorporate these decisions before planning implementation. Indefinite authority does not authorize automatic reactivation after revocation or recovery.

Q1 remains open: asking what a compromised backend means does not select the enforcement trust boundary. It means an attacker can control the signing service or use its signing credentials, potentially bypassing Nana's confirmation and local accounting checks. Provider-enforced restrictions can constrain those direct requests, but Nana's own database limit cannot be claimed as independent protection against that attacker.

Provider constraint verified again on 2026-09-08: Privy stateful-policy rolling windows have a documented minimum of 3600 seconds, so the requested 900-second window is not available natively. Its post-signing aggregate updates also permit concurrent requests to pass before counters update. Preserve the requested 15-minute behavior; do not silently substitute an hour or claim a strict provider guarantee. Application enforcement is a possible design only after the trust boundary is settled; independent hard enforcement requires another mechanism. Source: https://docs.privy.io/controls/policies/stateful-policies

Fee accounting remains unresolved: accepting the transfer amounts does not unambiguously decide whether network fees consume the 50-USDC allowance. Specify that separately, including the gas cap. Engineering must define atomic concurrent reservations, window-edge behavior, and treatment of signed or uncertain payments so that aging a reservation cannot enable overspending or duplicate dispatch.


## Controlling decision: one-hour window, Privy configuration only

User response, 2026-09-08: "bueno entonces dejemoslo solo con 1 hora y solo con config de privy".

Replace the 900-second proposal with Privy's native rolling 3600-second window. Keep 10 USDC per transfer, 50 USDC accumulated per hour, and an indefinite, user-revocable permission. Enforce these spending limits exclusively through Privy policies; do not add a Nana SQL spending-cap implementation or an independent enforcement architecture. Q1 is resolved in favor of the documented provider semantics, including possible aggregate overshoot from concurrent signing requests. Do not promise a strict atomic cumulative cap or introduce a compensating local cap without a new decision.

Preview and explicit confirmation per payment remain required. Persistence, operation idempotency, nonce coordination, ownership checks, revocation and uncertain-transaction reconciliation still belong to Nana; they are not an additional spending-limit system. The provider aggregate reflects its documented signing behavior, not a locally recomputed total of settled transfers. Policy configuration and its wallet/user bucket isolation must be verified before implementation is declared functional.

This decision supersedes the 15-minute section and earlier requirements for a local atomic spending budget, finite permission expiry, and independently strict cumulative enforcement. Incorporate these changes into the next spec/design/outline revision; the r2 review receipt is historical. Fee treatment and gas policy remain to be specified separately; this response does not explicitly choose whether the transfer allowance includes fees. No provider configuration was changed remotely and no application code was implemented in this documentation update.
