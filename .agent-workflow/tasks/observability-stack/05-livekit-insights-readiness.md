# Readiness report: LiveKit Agent Insights (pre-Slice 2)

Status: READY-PENDING-APPROVAL. This document prepares Slice 2 but does not execute it. Per `04-structure-outline.md` r2 and the RPI workflow, Slice 2 requires a separate approval gate owned by Ramiro before any configuration, account, secret, deployment, or exporter work happens.

## Proposed session record configuration

```text
record:
  audio: false        # audio export is always off (approved decision)
  transcript: true
  traces: true
  logs: true
  redaction: false
```

- `record: false` (the whole object absent/false) remains the kill switch: no telemetry config change may ever block a turn or a transfer.
- Project-level note: session-level `redaction: false` cannot disable a redaction enabled at the LiveKit Cloud project level. Slice 2 must verify the project has PII redaction OFF, otherwise the approved redaction:false semantics will silently not hold.
- Retention: Agent Insights retains conversation, tool call arguments/results, metrics and logs for 30 days (approved). Access must be restricted to the authorized team with a privacy notice; addresses, amounts, names and financial results that are part of the conversation WILL be stored — secrets/credentials must never be.

## What Slice 1 already guarantees (evidence in 90-verification.md)

1. Provider error bodies are scrubbed (`scrubProviderErrorBody`) before they can reach logs/telemetry — the design's precondition for enabling `logs: true` ("if the test fails, the rollout starts with logs:false") is now satisfied: `scrubs provider error bodies while keeping safe context` and the new regression `scrubs plain-text authorization headers without leaving the bare token` both pass.
2. A strict allowlist admission gate (`admitTelemetryEvent`) rejects unknown fields/kinds and any forbidden content (secrets, tokens, cookies, authorization headers, labeled seed phrases) instead of emitting it.
3. `record: false` kill switch proven: disabled recorder never emits (`keeps record disabled as the kill switch`).
4. `src/livekit/worker.ts` was intentionally not touched in Slice 1.

## What Slice 2 will need (not started, listed for the approval gate)

- Files: `src/livekit/worker.ts` (agent session `record` options), operational documentation; LiveKit Cloud project configuration.
- Automated checks: test asserting the exact options `audio:false, transcript:true, traces:true, logs:true, redaction:false`; kill-switch test; session-end flush test.
- E2E/canary: development project with a real search tool and synthetic data (fake secrets, names, addresses, amounts, hashes); verify in the dashboard the timeline shows arguments, output, duration and error per tool call.
- Manual checks: restricted access, no audio enabled, project-level redaction off, 30-day retention confirmed.
- Stop conditions: Agent Insights lacks the required detail, the canary leaks a secret, or telemetry affects latency/turn completion.

## Explicitly out of scope until separately approved

LiveKit Cloud configuration, Sentry setup, real secrets, deployments, exporters, and any commit/push. Slice 2 does not start without Ramiro's approval.
