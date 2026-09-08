# Verification: Slice 1 (data boundary and secret scrubber)

Scope outline: `04-structure-outline.md` r2, Slice 1. Branch: `observability-slice1-port` (base `c5bc83e`, Worktrunk worktree). Re-verified this session from a fresh run of every command below; no numbers inherited from the previous receipt.

## Implemented scope (audited this session)

- `src/observability/telemetry-boundary.ts`: strict allowlist schemas (`conversation_turn`, `tool_call`, `error`, `latency`), forbidden-content detection with category-only violation labels, `scrubText`/`scrubValue` defense in depth, `scrubProviderErrorBody`, single admission gate `admitTelemetryEvent`.
- `src/observability/voice-trace.ts`: `VoiceTraceRecorder.record` drops the whole trace when `detectForbiddenContent` finds anything after redaction; `record` is a no-op when `config.enabled` is false (kill switch).
- `src/api/voice.ts`: upstream transcription error body is passed through `scrubProviderErrorBody` before logging.
- `tests/unit/telemetry-boundary.test.ts`: 16 tests (was 13; +1 regression added this session, see Fix below).

## Over-detection audit (seed phrases)

Probed empirically with a scratch script (`npx tsx`, run outside the repo tree) against `detectForbiddenContent`:

- Admitted (correct): 18-word plain lowercase sentence; 12-word comma-separated sentence; sentence containing the bare word "seed" (not "seed phrase") followed by 12+ words; sentence using "mnemonic" as a common noun followed by 12+ words; uppercase 12+ word sentence; sentence containing "passwords" followed by 12 words; 12-word sentence inside `result.summary`; `seed:` key with a non-BIP39-length value (13 words); `seed:` key with a short value.
- Blocked (correct, intentional): `recovery phrase <12 words>` label; Spanish `frase de recuperación <12 words>` label; 12 BIP39-count lowercase words under a mnemonic-like key (`wallet_seed:`) — the fail-closed mnemonic-key rule; labeled secret assignment (`secret: perseverance and practice...` via `credential_assignment` — labeled, fail-closed by design).

Result: no over-detection bug found beyond the intentional fail-closed mnemonic-key rule. Ordinary 12+ word sentences without a mnemonic/seed/recovery label are always admitted. **No change was made for over-detection.**

### Fix made this session (under-scrubbing, found during verification)

`scrubText("prefix Authorization: Bearer abcdef123456 suffix")` returned `prefix [redacted] abcdef123456 suffix` — the raw token survived, because `authorization_header`'s value class consumed the word "Bearer" before `bearer_token` could match. This violates Slice 1's stop condition ("any secret appears in a payload"). Minimal fix in `src/observability/telemetry-boundary.ts`: reordered `FORBIDDEN_PATTERNS` so `bearer_token` runs before `authorization_header`/`cookie_header`, with a comment explaining why. After the fix the same input returns `prefix [redacted] suffix`. Regression test added: `tests/unit/telemetry-boundary.test.ts` → `scrubs plain-text authorization headers without leaving the bare token` (asserts the token and "Bearer" are absent from scrub output and `detectForbiddenContent` still reports `$.header: bearer_token`).

## Checks (exact commands, this session, worktree root)

| # | Command | Exit | Result |
| --- | --------- | ------ | -------- |
| a | `npx vitest run tests/unit/telemetry-boundary.test.ts` | 0 | 1 file passed; **16/16 tests passed** (160 ms) |
| b | `npm test` (full suite) | 0 | **54 test files passed, 8 skipped** (62 total); **281 tests passed, 17 skipped** (298 total); 2.82 s |
| c | `npm run typecheck` (`tsc -p tsconfig.test.json --noEmit`) | 0 | clean |
| d | `npm run lint` (`eslint src tests --max-warnings=0`) | 0 | clean, zero warnings |
| e | `npm run build` (`tsc -p tsconfig.json`) | 0 | clean |

## Behavior verification map (proving test → behavior)

| Required behavior | Proving test(s) in `tests/unit/telemetry-boundary.test.ts` |
| --- | --- |
| Tool call events admitted with `arguments`, `result`, `isError`, `durationMs` | `admits allowlisted conversation, tool call, error, and latency payloads` (tool call with `arguments: { query }`, `result: { items, count }`, `isError: false`, `durationMs: 128` all admitted intact) |
| Rejection of secrets, tokens, cookies, authorization headers, labeled seed phrases | `blocks forbidden content (...) instead of emitting it` — `it.each` cases: authorization header, cookie header, api key assignment, bearer token, private key, seed phrase (violations carry category labels only, never the secret text); plus `blocks binding tokens (JWTs) inside tool payloads` (live ed25519 binding token → `forbidden_content`; `detectForbiddenContent({ token })` → `$.token: jwt`); plus `blocks labeled seed phrases and scrubs them, even without a colon` |
| Admission of normal long phrases | `admits ordinary long sentences without mnemonic context` (18 plain lowercase words admitted via both `detectForbiddenContent` and the full admission gate; punctuated Spanish sentence; `seed:` key with non-mnemonic value) — reinforced by this session's probe audit above |
| Kill switch `record: false` — disabled recorder never emits | `keeps record disabled as the kill switch: disabled recorder never emits` (`readVoiceTraceConfig({ NODE_ENV: "test" }).enabled === false`; recorder built with `enabled: false`; after `record(...)` → `emitted === 0` and `recorder.list() === []`) |
| No secrets in scrubbed provider error bodies | `scrubs provider error bodies while keeping safe context` (JSON body with `"authorization":"Bearer abcdef123456"` → token absent, `"quota exceeded"` preserved; `sk-liveabcdef123456` removed by `scrubText`) + new regression `scrubs plain-text authorization headers without leaving the bare token`; bounded length covered by `bounds provider error body length` (5000-char body → ≤ 2000) |
| Unknown fields / kinds rejected by strict allowlist | `rejects unknown fields and unknown kinds` (extra `sessionId` → schema rejection naming the field; `kind: "raw_provider_dump"` → schema rejection) |
| Whole-trace drop when a secret survives redaction | `drops traces whose redacted content still contains forbidden secrets` (recorder `enabled: true`, transcript containing labeled seed phrase → `emitted === 0`, `recorder.list() === []`) |

## E2E / real-route status

The real LiveKit Cloud canary was **not** attempted: it requires LiveKit Cloud credentials (a development project with API key/secret and a dashboard to inspect) and belongs to Slice 2 per the outline. One-line blockage: no LiveKit Cloud development-project credentials are available in this environment, and per the outline that canary is Slice 2 scope requiring Ramiro's approval.

Pre-transport coverage stands on the 16 unit tests above; no exporters, Sentry, LiveKit Agent Insights, or OpenTelemetry were activated; no real secrets or external accounts were added.

## Constraints respected

- No commit, push, merge, reset, or clean was performed (working tree left as-is; `git status` shows the same modified/untracked set plus this verification doc).
- `src/livekit/worker.ts`, `package.json`, and `package-lock.json` were not touched.
- Slice 2 (LiveKit Agent Insights config) was not started.

## Next owner

Slice 2 requires a new gate approved by Ramiro before touching `src/livekit/worker.ts`, LiveKit Cloud configuration, or any external account.
