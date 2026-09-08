import { z } from "zod";

export const TELEMETRY_REDACTED = "[redacted]";

// Forbidden content is detected and BLOCKED (the whole event is dropped),
// never merely redacted. Violation labels never include the matched content.
const FORBIDDEN_PATTERNS: ReadonlyArray<
  readonly [category: string, pattern: RegExp]
> = [
  ["private_key", /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/u],
  // bearer_token runs BEFORE the header patterns: authorization_header's
  // value class would otherwise consume the word "Bearer" and leave the
  // bare token surviving scrubText (defense-in-depth leak).
  ["bearer_token", /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/iu],
  ["authorization_header", /\bauthorization["']?\s*:\s*["']?[^\r\n"']+/iu],
  ["cookie_header", /\b(?:set-)?cookie["']?\s*:\s*["']?[^\r\n"']+/iu],
  ["jwt", /\beyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{5,}/iu],
  [
    "credential_assignment",
    /\b(?:x[-_]api[-_]?key|api[-_]?key|apikey|access[-_]?token|auth[-_]?token|client[-_]?secret|secret|password|passwd|credential|private[-_]?key)\s*["']?\s*[:=]\s*["']?[^\s"',;{}[\]]{4,}/iu,
  ],
  [
    "binding_token",
    /\bbinding[-_]?token\s*["']?\s*[:=]\s*["']?[^\s"',;{}[\]]{8,}/iu,
  ],
  ["secret_token_shape", /\b(?:sk|pk)[-_][a-z0-9]{16,}\b/iu],
  // Seed phrases are only detected with an explicit mnemonic/seed/recovery
  // label, so ordinary 12+ word sentences are never blocked.
  [
    "seed_phrase",
    /\b(?:mnemonic|seed\s*phrase|recovery\s*phrase|backup\s*phrase|frase\s+semilla|frase\s+de\s+recuperaci[oó]n)\s*[:=]?\s*(?:[a-z]{3,}[\s,]+){11,23}[a-z]{3,}\b/iu,
  ],
];

// A value under a mnemonic-shaped key is a seed phrase only when it is a
// BIP39-length run (12/15/18/21/24) of plain lowercase words.
const MNEMONIC_KEY_PATTERN = /(?:mnemonic|seed|semilla|recovery|backup)/iu;
const MNEMONIC_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const CREDENTIAL_KEY = /^(?:authorization|(?:set[-_]?)?cookie|(?:x[-_]?)?api[-_]?key|access[-_]?token|auth[-_]?token|client[-_]?secret|entity[-_]?secret|secret|password|passwd|credential|private[-_]?key|binding[-_]?token)$/iu;

function isMnemonicShaped(value: string): boolean {
  const words = value.trim().split(/\s+/);
  return (
    MNEMONIC_WORD_COUNTS.has(words.length) &&
    words.every((word) => /^[a-z]{3,}$/u.test(word))
  );
}

/** Categories are labels only; the matched secret text is never reported. */
export function detectForbiddenContent(value: unknown, path = "$"): string[] {
  if (typeof value === "string") {
    return FORBIDDEN_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(
      ([category]) => `${path}: ${category}`,
    );
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      detectForbiddenContent(item, `${path}[${index}]`),
    );
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => {
      const unsafeKey = FORBIDDEN_PATTERNS.some(([, pattern]) => pattern.test(key));
      const childPath = `${path}.${unsafeKey ? '[field]' : key}`;
      if (unsafeKey) return [`${childPath}: forbidden_key`];
      if (CREDENTIAL_KEY.test(key) && item !== undefined && item !== null && item !== '') {
        return [`${childPath}: credential_value`];
      }
      if (
        typeof item === "string" &&
        MNEMONIC_KEY_PATTERN.test(key) &&
        isMnemonicShaped(item)
      ) {
        return [`${childPath}: seed_phrase`];
      }
      return detectForbiddenContent(item, childPath);
    });
  }
  return [];
}

/** Replaces forbidden content with a marker. Defense in depth after blocking. */
export function scrubText(value: string): string {
  let scrubbed = value;
  for (const [, pattern] of FORBIDDEN_PATTERNS)
    scrubbed = scrubbed.replace(new RegExp(pattern.source, pattern.flags + 'g'), TELEMETRY_REDACTED);
  return scrubbed;
}

export type TelemetryJsonValue =
  | string
  | number
  | boolean
  | null
  | TelemetryJsonValue[]
  | { [key: string]: TelemetryJsonValue };

export function scrubValue(value: unknown): TelemetryJsonValue {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (!value || typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [scrubText(key), CREDENTIAL_KEY.test(key) || (MNEMONIC_KEY_PATTERN.test(key) && typeof item === 'string' && isMnemonicShaped(item)) ? TELEMETRY_REDACTED : scrubValue(item)]),
  );
}

/**
 * Provider error bodies are logs, not structured events: they are scrubbed
 * (redacted) instead of dropped so the status/message context survives.
 */
export function scrubProviderErrorBody(body: string, maxLength = 2000): string {
  try {
    return JSON.stringify(scrubValue(JSON.parse(body))).slice(0, maxLength);
  } catch {
    // Non-JSON provider responses use text redaction.
  }
  return scrubText(body).slice(0, maxLength);
}

// --- Allowlisted telemetry events (strict schemas reject unknown fields) ---

const hashOrId = z.string().min(1).max(256);
const safeText = z.string().max(8000);

const jsonValue: z.ZodType<TelemetryJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const conversationTurnEventSchema = z.strictObject({
  kind: z.literal("conversation_turn"),
  conversationIdHash: hashOrId,
  turnId: hashOrId,
  role: z.enum(["user", "agent"]),
  text: safeText,
  language: z.enum(["es", "en"]).optional(),
  startedAt: z.string().optional(),
});

export const toolCallEventSchema = z.strictObject({
  kind: z.literal("tool_call"),
  conversationIdHash: hashOrId,
  turnId: hashOrId,
  toolCallId: hashOrId.optional(),
  name: z.string().min(1).max(128),
  arguments: jsonValue.optional(),
  result: jsonValue.optional(),
  isError: z.boolean().optional(),
  durationMs: z.number().finite().min(0).optional(),
});

export const telemetryErrorEventSchema = z.strictObject({
  kind: z.literal("error"),
  conversationIdHash: hashOrId.optional(),
  turnId: hashOrId.optional(),
  provider: z.string().max(64).optional(),
  code: z.string().min(1).max(128),
  message: safeText,
  providerErrorBody: z.string().max(8000).optional(),
});

export const latencyEventSchema = z.strictObject({
  kind: z.literal("latency"),
  conversationIdHash: hashOrId.optional(),
  name: z.enum([
    "stt",
    "turn_detection",
    "agent",
    "first_audio",
    "total",
    "tool",
  ]),
  durationMs: z.number().finite().min(0),
});

export const telemetryEventSchema = z.discriminatedUnion("kind", [
  conversationTurnEventSchema,
  toolCallEventSchema,
  telemetryErrorEventSchema,
  latencyEventSchema,
]);

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

export type TelemetryDecision =
  | { ok: true; event: TelemetryEvent }
  | { ok: false; reason: "schema"; issues: string[] }
  | { ok: false; reason: "forbidden_content"; violations: string[] };

/**
 * Single admission gate for telemetry payloads. Unknown fields and unknown
 * kinds are rejected by the strict schemas; forbidden content is rejected,
 * never emitted; surviving strings are scrubbed as defense in depth.
 */
export function admitTelemetryEvent(input: unknown): TelemetryDecision {
  const parsed = telemetryEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "schema",
      issues: parsed.error.issues.map(
        (issue) => scrubText(`${issue.path.join(".")}: ${issue.message}`),
      ),
    };
  }
  const violations = detectForbiddenContent(parsed.data);
  if (violations.length > 0)
    return { ok: false, reason: "forbidden_content", violations };
  // Re-parse the scrubbed value so the admitted event stays schema-typed.
  return {
    ok: true,
    event: telemetryEventSchema.parse(scrubValue(parsed.data)),
  };
}
