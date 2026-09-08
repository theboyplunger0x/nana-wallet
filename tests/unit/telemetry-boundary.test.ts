import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueLiveVoiceBinding } from "../../src/auth/live-binding.js";
import { readVoiceTraceConfig } from "../../src/config/privacy.js";
import {
  admitTelemetryEvent,
  detectForbiddenContent,
  scrubProviderErrorBody,
  scrubText,
} from "../../src/observability/telemetry-boundary.js";
import { VoiceTraceRecorder } from "../../src/observability/voice-trace.js";

const SEED_PHRASE =
  "wave fold moment stumble stone absent witness mixture barely ice milk camp";

function traceConfig(enabled: boolean) {
  return {
    enabled,
    environment: "development" as const,
    retentionDays: 7,
    privacyApproved: false,
  };
}

describe("telemetry data boundary", () => {
  it("scrubs every occurrence and the complete PEM body", () => {
    const body = 'Bearer firstsecret123 Bearer secondsecret456\n-----BEGIN PRIVATE KEY-----\nSYNTHETIC_PEM_PAYLOAD\n-----END PRIVATE KEY-----';
    const scrubbed = scrubProviderErrorBody(body);
    expect(scrubbed).not.toContain('firstsecret123');
    expect(scrubbed).not.toContain('secondsecret456');
    expect(scrubbed).not.toContain('SYNTHETIC_PEM_PAYLOAD');
  });

  it("blocks secrets stored as structured values or object keys without echoing them", () => {
    for (const arguments_ of [
      { apiKey: 'opaque-secret-value' },
      { authorization: 'Basic opaque-secret-value' },
      { cookie: 'session=opaque-secret-value' },
      { 'Bearer opaque-secret-value': 'ordinary' },
    ]) {
      const decision = admitTelemetryEvent({ kind: 'tool_call', conversationIdHash: 'c', turnId: 't', name: 'read', arguments: arguments_ });
      expect(decision).toMatchObject({ ok: false, reason: 'forbidden_content' });
      expect(JSON.stringify(decision)).not.toContain('opaque-secret-value');
    }
  });

  it("does not echo unexpected field names in schema errors", () => {
    const decision = admitTelemetryEvent({ kind: 'error', code: 'test', message: 'safe', 'Bearer opaque-secret-value': 'x' });
    expect(decision.ok).toBe(false);
    expect(JSON.stringify(decision)).not.toContain('opaque-secret-value');
  });

  it("admits allowlisted conversation, tool call, error, and latency payloads", () => {
    const turn = admitTelemetryEvent({
      kind: "conversation_turn",
      conversationIdHash: "hash-1",
      turnId: "turn-1",
      role: "user",
      text: "Busca el saldo de mi wallet",
      language: "es",
    });
    expect(turn).toMatchObject({
      ok: true,
      event: { kind: "conversation_turn", role: "user" },
    });

    const toolCall = admitTelemetryEvent({
      kind: "tool_call",
      conversationIdHash: "hash-1",
      turnId: "turn-1",
      toolCallId: "call-1",
      name: "search_balance",
      arguments: { query: "balance wallet-1" },
      result: { items: ["a", "b"], count: 2 },
      isError: false,
      durationMs: 128,
    });
    expect(toolCall).toMatchObject({
      ok: true,
      event: { kind: "tool_call", name: "search_balance", durationMs: 128 },
    });

    const failure = admitTelemetryEvent({
      kind: "error",
      conversationIdHash: "hash-1",
      turnId: "turn-1",
      provider: "nan.builders",
      code: "SERVICIO_CAIDO",
      message: "Transcription failed.",
      providerErrorBody: '{"error":"upstream unavailable"}',
    });
    expect(failure).toMatchObject({
      ok: true,
      event: { kind: "error", code: "SERVICIO_CAIDO" },
    });

    const latency = admitTelemetryEvent({
      kind: "latency",
      conversationIdHash: "hash-1",
      name: "total",
      durationMs: 512,
    });
    expect(latency).toMatchObject({
      ok: true,
      event: { kind: "latency", durationMs: 512 },
    });
  });

  it("rejects unknown fields and unknown kinds", () => {
    const unknownField = admitTelemetryEvent({
      kind: "tool_call",
      conversationIdHash: "hash-1",
      turnId: "turn-1",
      name: "search_balance",
      arguments: {},
      sessionId: "not-in-allowlist",
    });
    expect(unknownField).toMatchObject({ ok: false, reason: "schema" });
    if (!unknownField.ok && unknownField.reason === "schema") {
      expect(unknownField.issues.join(" ")).toContain("sessionId");
    } else {
      throw new Error("expected schema rejection with issues");
    }

    const unknownKind = admitTelemetryEvent({
      kind: "raw_provider_dump",
      body: "everything",
    });
    expect(unknownKind).toMatchObject({ ok: false, reason: "schema" });
  });

  it.each([
    [
      "authorization header",
      { authorization: "Authorization: Bearer abcdef123456" },
    ],
    ["cookie header", { cookie: "Cookie: session=abcdef123456" }],
    ["api key assignment", { config: "api_key = sk-liveabcdef123456" }],
    ["bearer token", { header: "bearer abcdefgh1234" }],
    [
      "private key",
      {
        pem: "-----BEGIN PRIVATE KEY-----MIIEvQIBADANBg-----END PRIVATE KEY-----",
      },
    ],
    ["seed phrase", { backup: SEED_PHRASE }],
  ])(
    "blocks forbidden content (%s) instead of emitting it",
    (_label, payload) => {
      const event = {
        kind: "tool_call",
        conversationIdHash: "hash-1",
        turnId: "turn-1",
        name: "search_balance",
        arguments: payload,
        result: { ok: true },
      };
      const decision = admitTelemetryEvent(event);
      expect(decision).toMatchObject({
        ok: false,
        reason: "forbidden_content",
      });
      if (!decision.ok && decision.reason === "forbidden_content") {
        const joined = decision.violations.join(" ");
        // Violations carry category labels only, never the secret content.
        expect(joined).not.toContain("sk-live");
        expect(joined).not.toContain("abcdefgh1234");
      } else {
        throw new Error("expected forbidden_content rejection");
      }
    },
  );

  it("blocks binding tokens (JWTs) inside tool payloads", async () => {
    const keys = generateKeyPairSync("ed25519");
    const token = await issueLiveVoiceBinding({
      userId: "user-1",
      conversationId: "conversation-1",
      privateKey: keys.privateKey,
      now: 100,
    });
    const event = {
      kind: "error",
      code: "binding_rejected",
      message: `binding token ${token} was rejected`,
    };
    expect(admitTelemetryEvent(event)).toMatchObject({
      ok: false,
      reason: "forbidden_content",
    });
    expect(detectForbiddenContent({ token })).toEqual(["$.token: jwt"]);
  });

  it("admits ordinary long sentences without mnemonic context", () => {
    // 18 plain lowercase words: exactly a BIP39 length, but no seed/mnemonic
    // label or key context, so it must be admitted.
    const sentence =
      "the agent searched the wallet service and answered with the balance and the last transactions without any error";
    expect(detectForbiddenContent({ text: sentence })).toEqual([]);
    const decision = admitTelemetryEvent({
      kind: "conversation_turn",
      conversationIdHash: "hash-1",
      turnId: "turn-1",
      role: "agent",
      text: sentence,
    });
    expect(decision).toMatchObject({
      ok: true,
      event: { kind: "conversation_turn" },
    });

    const punctuated =
      "El agente busca el saldo, muestra el resultado de la herramienta y responde sin errores.";
    expect(detectForbiddenContent({ text: punctuated })).toEqual([]);

    // A seed-named key with a non-mnemonic value is not blocked either.
    expect(
      detectForbiddenContent({
        seed: "not twelve words at all just a short value",
      }),
    ).toEqual([]);
  });

  it("blocks labeled seed phrases and scrubs them, even without a colon", () => {
    const labeled = `backup phrase ${SEED_PHRASE}`;
    expect(detectForbiddenContent({ note: labeled })).toEqual([
      "$.note: seed_phrase",
    ]);

    const withColon = `mnemonic: ${SEED_PHRASE}`;
    const scrubbed = scrubText(withColon);
    expect(scrubbed).not.toContain("wave fold");
    expect(scrubbed).toContain("[redacted]");
  });

  it("scrubs provider error bodies while keeping safe context", () => {
    const body =
      'Upstream error: {"message":"quota exceeded","authorization":"Bearer abcdef123456"}';
    const scrubbed = scrubProviderErrorBody(body);
    expect(scrubbed).not.toContain("Bearer abcdef123456");
    expect(scrubbed).toContain("quota exceeded");

    const withKey = "invalid api_key sk-liveabcdef123456 rejected";
    const scrubbedKey = scrubText(withKey);
    expect(scrubbedKey).not.toContain("sk-liveabcdef123456");
    expect(scrubbedKey).toContain("invalid");
  });

  it("scrubs plain-text authorization headers without leaving the bare token", () => {
    // Regression: authorization_header used to consume the word "Bearer"
    // before bearer_token could match, leaving the raw token in the output.
    const header = "prefix Authorization: Bearer abcdef123456 suffix";
    const scrubbed = scrubText(header);
    expect(scrubbed).not.toContain("abcdef123456");
    expect(scrubbed).not.toContain("Bearer");

    // detectForbiddenContent still blocks the original value.
    expect(detectForbiddenContent({ header })).toContain(
      "$.header: bearer_token",
    );
  });

  it("bounds provider error body length", () => {
    const longBody = "x".repeat(5000);
    expect(scrubProviderErrorBody(longBody).length).toBeLessThanOrEqual(2000);
  });

  it("keeps record disabled as the kill switch: disabled recorder never emits", async () => {
    const config = readVoiceTraceConfig({ NODE_ENV: "test" });
    expect(config.enabled).toBe(false);

    let emitted = 0;
    const recorder = new VoiceTraceRecorder(
      traceConfig(false),
      () => 0,
      () => {
        emitted += 1;
      },
    );
    await recorder.record({
      traceId: "trace-1",
      conversationIdHash: "conversation-1",
      roomIdHash: "room-1",
      startedAt: new Date(0).toISOString(),
      transcript: { redactedText: "hello", language: "en" },
      response: { redactedText: "hi", segments: 1 },
      toolCalls: [],
      timings: {
        sttMs: 1,
        turnDetectionMs: 1,
        agentMs: 1,
        firstAudioMs: 1,
        totalMs: 4,
      },
    });
    expect(emitted).toBe(0);
    expect(recorder.list()).toEqual([]);
  });

  it("drops traces whose redacted content still contains forbidden secrets", async () => {
    let emitted = 0;
    const recorder = new VoiceTraceRecorder(
      traceConfig(true),
      () => 0,
      () => {
        emitted += 1;
      },
    );
    await recorder.record({
      traceId: "trace-2",
      conversationIdHash: "conversation-1",
      roomIdHash: "room-1",
      startedAt: new Date(0).toISOString(),
      transcript: {
        redactedText: `backup phrase ${SEED_PHRASE}`,
        language: "en",
      },
      response: { redactedText: "ok", segments: 1 },
      toolCalls: [],
      timings: {
        sttMs: 1,
        turnDetectionMs: 1,
        agentMs: 1,
        firstAudioMs: 1,
        totalMs: 4,
      },
    });
    expect(emitted).toBe(0);
    expect(recorder.list()).toEqual([]);
  });
});
