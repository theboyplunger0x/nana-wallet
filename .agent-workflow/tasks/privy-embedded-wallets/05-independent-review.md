# Independent outline review

Reviewer: Pi, nan/glm5.3-flash, reasoning high.
Herdr: workspace w1C, tab w1C:t1H, pane w1C:p3B, agent privy-spec-review-r2.
Session: /Users/ramiro/.pi/agent/sessions/--private-tmp-nana-privy-specs-20260908--/2026-09-08T18-14-12-793Z_01a0823a-4839-7409-a3eb-5deea89f0327.jsonl

## Initial r2 review (verbatim reviewer response)

# Read-only outline review — privy-embedded-wallets r2

**Integrity**: All five file SHA-256 hashes match the manifest exactly; frozen scope is intact. No files were read beyond the five, no edits, no live calls, no delegation. Work preserved.

**User decisions honored**: D1 limited backend signer (D1 line 5, 03a; design.md:35 states the compromised-backend envelope honestly), D2 Privy recovery preserving address (design.md "Recovery", PEW-010), D3 Arc Testnet only (proposal, PEW-011), D7 preserve-existing phone channel with exact channel recorded as unverified deployment evidence (03a "Comprobaciones", design.md:86) — correct treatment, missing channel doesn't invalidate the plan.

## Findings

**Critical**: none.

**Controlling**: none. Non-escalation, ownership, idempotency, nonce, uncertainty, signed-bytes, recovery, front/back separation and verification plan are each explicitly covered (PEW-002/003/007/013; design.md:39–45; design.md:33 marks the stateful-aggregation probe "required capability probe, not an assumed support claim"; WU1 [04-structure-outline.md:11](/private/tmp/nana-privy-specs-20260908/.agent-workflow/tasks/privy-embedded-wallets/04-structure-outline.md:11) correctly frames missing PRIVY_* credentials as a specific live blocker, not a plan invalidator).

**Major**

1. **Gas-ceiling fallback not explicit** — [design.md:31](/private/tmp/nana-privy-specs-20260908/openspec/changes/privy-embedded-wallets/design.md:31) says "prove the provider-side ceiling in WU1 before enabling grants" but, unlike the cumulative cap ([design.md:33](/private/tmp/nana-privy-specs-20260908/openspec/changes/privy-embedded-wallets/design.md:33)), doesn't state the failure branch. Correction: add one sentence — if the provider-side `maxGasAtomic18` ceiling cannot be proven in WU1, signing stays disabled, mirroring the stateful-aggregation rule. Same explicit fail-closed wording should apply to per-payment transfer cap if provider policy can't express it.

2. **Acceptance map traceability is coarse** — [04-structure-outline.md:41](/private/tmp/nana-privy-specs-20260908/.agent-workflow/tasks/privy-embedded-wallets/04-structure-outline.md:41): PEW-006..008 map only to WU3/WU5, yet PEW-006 preview/confirmation and PEW-007 enrollment/review UI have material WU4 surfaces (WU4 evidence: enrollment, preview/cancel, confirm), and PEW-007/008 involve WU2 grant records. PEW-009 backend reconciliation ("continue under the original user", [design.md:87](/private/tmp/nana-privy-specs-20260908/openspec/changes/privy-embedded-wallets/specs/privy-embedded-wallets/spec.md:87)) is WU3 work but maps only WU4/WU5. Correction: extend the map (e.g. PEW-006..008: WU2/WU3/WU4/WU5; PEW-009: WU3/WU4/WU5). No requirement is left unimplemented — this is map precision, not scope.

**Minor**

3. **Pre-probe Arc facts presented as settled** — [design.md:19–25](/private/tmp/nana-privy-specs-20260908/openspec/changes/privy-embedded-wallets/design.md:19) table fixes RPC `https://rpc.testnet.arc.io`, explorer, and the 0x3600…0000 USDC interface before the WU1 probe. Acceptable since PEW-011 requires verifying RPC chain ID and `decimals()` live, but the table should carry a "pinned pending WU1 verification" annotation so a doc drift doesn't read as a verified fact.

4. **"Same underlying USDC balance" assertion** — [design.md:23](/private/tmp/nana-privy-specs-20260908/openspec/changes/privy-embedded-wallets/design.md:23) asserts native gas is an 18-decimal representation of the same USDC balance. Consistent with Arc's USDC-as-gas model, but it's asserted pre-probe; WU1 should explicitly confirm gas-token identity/decimals, since fee quoting in USDC (design.md:23, WU4:29) depends on it.

5. **Wording: "consume provider budget"** — [design.md:33](/private/tmp/nana-privy-specs-20260908/openspec/changes/privy-embedded-wallets/design.md:33): a signed-but-unsent attempt can't consume the provider's aggregation counter unless broadcast; the conservative accounting is local. Say "conservatively count against the grant budget (locally, and at the provider once observed)" to avoid implying a provider mechanism that may not exist.

6. **WU5 stray process line** — [04-structure-outline.md:37](/private/tmp/nana-privy-specs-20260908/.agent-workflow/tasks/privy-embedded-wallets/04-structure-outline.md:37) "Preserve worktree/session receipt before closing review panes" is harness process, not verification content; harmless but move it out of the WU5 verification paragraph if the outline is revised anyway.

## Checks passed (highlights)

- **Ownership**: server-verified via Privy authenticated API; bare address/SDK object/client userId can't assert ownership (design.md:11–13, PEW-002).
- **Permission non-escalation**: signer can't edit policy, add owners, export keys; self-escalation tested with spending credentials in WU1; "any route for the spending credential to remove restrictions blocks readiness" (design.md:29–35, PEW-013).
- **Signed bytes**: decode/verify every field, persist before broadcast, bearer-capability redaction tested, exact-bytes-only rebroadcast, no new nonce/fee bump (design.md:41–43, PEW-014).
- **Idempotency/nonce**: idempotent provisioning with conflict on multiple candidates, per-wallet serialized nonce reservation, provider idempotency scoped, never reuse client key across users (design.md:13, 39).
- **Uncertainty**: six-state outcome model, ambiguity preserved, unknown nonce consumption blocks retry, no failure claim on lost response (design.md:43–45, PEW-008).
- **Recovery**: Privy-managed, same address, no Nana secrets, recovery doesn't reactivate revoked/expired grants, no false promise without factors (design.md "Recovery", PEW-010).
- **Front/backend separation**: duplicated types, independent HTTP-example validation, VITE_PRIVY_APP_ID is the only frontend config; backend stays in `src/`, front in `apps/nana-wallet` (design.md:61–69, WU2:17/WU4:29).

## SHAs

| File | SHA-256 |
|---|---|
| 03a-open-questions.md | `c99805ef7902c70d44f8e62f889ebed237951b28bec34f2709dfa5b6f85d6ef7` |
| 04-structure-outline.md | `85a5da814ca987a1c78c46eead739ad3f7f1d92beababd82f2ba5e5486a737d8` |
| proposal.md | `f93c4d7de170bf364aeb1d2e0cc715a0cabd144a59fec89510a59f1434bd0cc9` |
| design.md | `ec4c476da533147369acc6acee340b368cff0b3a8a86f610d6d14276cdb17af5` |
| spec.md | `118e38393aa613cae1f1f545c5994c87443310e37f123a3f12758625f29206d0` |
| Concatenated five-file stream (manifest order) | `048ee5c162c450a30a9b5b84b057fab0cbd959ab26eca066af90f1e0dcb02fde` |

## Verdict

**Ready for HUMAN outline approval: YES**, with the two major corrections recommended before or at approval (they are one-sentence edits each and don't change scope, decisions, or the non-authorization posture). The plan correctly fails closed on unproven capabilities and does not let missing credentials invalidate the intent to test them.

## Parent dispositions

1. Major gas/amount failure branch: applied explicit signing-disabled requirement when either provider limit cannot be proven.
2. Major acceptance map: expanded PEW-006..009 across storage, backend and frontend units.
3. Minor pinned Arc values: annotated as documentation-derived, pending live WU1 evidence.
4. Minor native-gas accounting: added explicit WU1 identity/decimals/shared-balance check.
5. Minor aggregation wording: clarified local reservations and required provider counter semantics. The review's claim that counters cannot increment before broadcast is not accepted as established: the documented aggregation method is eth_signTransaction. WU1 must measure signing/duplicate behavior; no unsupported release is assumed.
6. Minor process line: moved session housekeeping out of WU5 product verification.

No user decision changed. The exact corrected manifest and final reviewer response follow after recheck.

## Final corrected review (verbatim)

# Bounded recheck — privy-embedded-wallets r2 corrected

**Integrity**: All five SHA-256 hashes match the corrected manifest exactly; 03a/proposal/spec unchanged from the original freeze, only 04-structure-outline.md and design.md revised as declared. No edits, no live calls, no delegation.

**Correction verification**:

1. **Gas/amount failure branch (major)** — resolved. [design.md:33](/private/tmp/nana-privy-specs-20260908/openspec/changes/privy-embedded-wallets/design.md:33) now states: unproven provider-side per-payment amount limit or `maxGasAtomic18` ceiling leaves signing MUST-disabled, no application-only substitute. Explicit fail-closed, mirrored for both limits.
2. **Acceptance map (major)** — resolved. [04-structure-outline.md:41](/private/tmp/nana-privy-specs-20260908/.agent-workflow/tasks/privy-embedded-wallets/04-structure-outline.md:41): PEW-006..008 now include WU2/WU3/WU4/WU5; PEW-009 includes WU3/WU4/WU5. Matches the traceability gaps identified.
3. **Pinned Arc values (minor)** — resolved. design.md:13 annotates the table as documentation-derived with live RPC/decimals/gas as WU1 acceptance checks.
4. **Native-gas identity (minor)** — resolved. WU1 (outline:11) now requires confirming native USDC gas identity/18-decimal accounting and shared-balance behavior without double-counting.
5. **Aggregation wording (minor)** — resolved, and the parent's disposition is correct over my original claim: Privy's stateful aggregation is documented on `eth_signTransaction`, so the counter may charge at signing time, before any broadcast. My "can't consume unless broadcast" assertion was not established; I withdraw it. The revised design.md:35 is right: reserve signed-but-unsent attempts conservatively in the local ledger, and WU1 must measure when charging occurs, duplicate counting, and whether release is supported — with no unsupported release assumed and no grant relaxation to reclaim capacity. This is the stronger, evidence-first formulation.
6. **Process line (minor)** — resolved. Housekeeping moved to its own section (outline:43–45), explicitly not a product verification gate.

**Remaining findings**:

- Critical: none. Controlling: none. Major: none.
- Nit (non-blocking): outline:3 still reads "Independent review pending" although the review now exists; cosmetic, safe to leave or fix at archive time.

**Corrected outline SHA-256** (five-file concatenated stream, manifest order):

`3568972a33ba96baa2ff3ddecc73715429bdc7a87e2a2df658649a7297a0c760`

(Per-file: 04 `217e77be5b3ffe454d30708998a3bf940054f987d0202da2802171c40ce1b38f`, design `ded78615b705d188935248cce84eb8a984afd41671a3a35f458df5d6fdefa22d`; other three unchanged.)

**Ready for HUMAN outline approval: YES.** No user decision changed; no implementation or live-signing authority is granted by this outline.

## Durable corrected manifest

```json
{
  ".agent-workflow/tasks/privy-embedded-wallets/03a-open-questions.md": "c99805ef7902c70d44f8e62f889ebed237951b28bec34f2709dfa5b6f85d6ef7",
  ".agent-workflow/tasks/privy-embedded-wallets/04-structure-outline.md": "217e77be5b3ffe454d30708998a3bf940054f987d0202da2802171c40ce1b38f",
  "openspec/changes/privy-embedded-wallets/proposal.md": "f93c4d7de170bf364aeb1d2e0cc715a0cabd144a59fec89510a59f1434bd0cc9",
  "openspec/changes/privy-embedded-wallets/design.md": "ded78615b705d188935248cce84eb8a984afd41671a3a35f458df5d6fdefa22d",
  "openspec/changes/privy-embedded-wallets/specs/privy-embedded-wallets/spec.md": "118e38393aa613cae1f1f545c5994c87443310e37f123a3f12758625f29206d0"
}
```

The reviewed outline keeps its pre-review header to preserve its exact hash. This receipt and state.yaml supersede that header: independent review completed; human outline approval pending.
