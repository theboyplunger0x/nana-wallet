import type { FastifyInstance, FastifyRequest } from "fastify";
import { scrubProviderErrorBody } from "../observability/telemetry-boundary.js";
import {
  agentTranscribeRequestSchema,
  voiceSpeakRequestSchema,
  voiceRoomTokenRequestSchema,
  type AgentTranscribeResponse,
  type VoiceRoomTokenResponse,
} from "../contracts/http.js";
import { readElevenLabsApiKey } from "../config/privacy.js";
import type {
  RoomTokenInput,
  RoomTokenResult,
} from "../livekit/token-issuer.js";

export type LiveKitTokenIssuerDependency = {
  issue: (input: RoomTokenInput) => Promise<RoomTokenResult>;
};

export type RoomTokenAuthorization =
  | { ok: true; identity: string; roomName?: string }
  | { ok: false; reason: "unauthenticated" | "not_found" };

export type VoiceRoutesOptions = {
  liveKitTokenIssuer?: LiveKitTokenIssuerDependency;
  /**
   * PMU-020: authenticated room-token issuance. When provided (privy mode),
   * the route resolves identity, verifies conversation ownership under RLS and
   * derives the participant identity server-side. Denials never reach the issuer.
   */
  authorizeRoomToken?: (
    request: FastifyRequest,
    conversationId: string,
  ) => Promise<RoomTokenAuthorization>;
};

const NAN_BASE_URL = process.env.NAN_BASE_URL ?? "https://api.nan.builders/v1";
const NAN_STT_MODEL = process.env.NAN_STT_MODEL ?? "whisper";

const ELEVENLABS_BASE_URL =
  process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io/v1";
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
const ELEVENLABS_MODEL =
  process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";

async function transcribeWithWhisper(
  audio: Buffer,
  mimeType: string,
): Promise<string> {
  const apiKey = process.env.NAN_API_KEY;
  if (!apiKey)
    throw {
      code: "ERROR_INTERNO",
      message: "Speech-to-text is not configured.",
    };

  const form = new FormData();
  form.append("model", NAN_STT_MODEL);
  form.append("file", new Blob([audio], { type: mimeType }), "recording.webm");

  let upstream: Response;
  try {
    upstream = await fetch(`${NAN_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    throw {
      code: "SERVICIO_CAIDO",
      message: "Could not reach the transcription service.",
    };
  }

  if (!upstream.ok) {
    console.error(
      "nan.builders transcription failed",
      upstream.status,
      scrubProviderErrorBody(await upstream.text()),
    );
    throw { code: "SERVICIO_CAIDO", message: "Transcription failed." };
  }

  const result = (await upstream.json()) as { text?: string };
  return result.text ?? "";
}

export async function registerVoiceRoutes(
  app: FastifyInstance,
  options: VoiceRoutesOptions = {},
): Promise<void> {
  app.post(
    "/v1/agent/transcribe",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply,
    ): Promise<
      | { ok: true; data: AgentTranscribeResponse }
      | { ok: false; error: { code: string; message: string; field?: string } }
    > => {
      const parsed = agentTranscribeRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(422);
        return {
          ok: false,
          error: {
            code: "DATOS_INVALIDOS",
            message: "No pude leer esa grabación.",
            field: "audioBase64",
          },
        };
      }

      try {
        const audio = Buffer.from(parsed.data.audioBase64, "base64");
        const transcript = await transcribeWithWhisper(
          audio,
          parsed.data.mimeType,
        );
        return { ok: true, data: { transcript } };
      } catch (error) {
        reply.code(502);
        const { code, message } = error as { code: string; message: string };
        return { ok: false, error: { code, message } };
      }
    },
  );

  app.post(
    "/v1/voice/speak",
    async (request: FastifyRequest<{ Body: unknown }>, reply) => {
      const apiKey = readElevenLabsApiKey();
      if (!apiKey) {
        reply.code(500);
        return reply.send({
          status: "error",
          message: "Text-to-speech is not configured.",
          code: "tts_not_configured",
        });
      }

      const parsed = voiceSpeakRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return reply.send({
          status: "error",
          message: parsed.error.message,
          code: "invalid_body",
        });
      }

      let upstream: Response;
      try {
        upstream = await fetch(
          `${ELEVENLABS_BASE_URL}/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: parsed.data.text,
              model_id: ELEVENLABS_MODEL,
            }),
          },
        );
      } catch {
        reply.code(502);
        return reply.send({
          status: "error",
          message: "Could not reach the speech service.",
          code: "tts_unreachable",
        });
      }

      if (!upstream.ok || !upstream.body) {
        reply.code(502);
        return reply.send({
          status: "error",
          message: "Speech synthesis failed.",
          code: "tts_failed",
        });
      }

      reply.header("content-type", "audio/mpeg");
      return reply.send(Buffer.from(await upstream.arrayBuffer()));
    },
  );

  app.post(
    "/v1/voice/room-token",
    async (
      request: FastifyRequest<{ Body: unknown }>,
      reply,
    ): Promise<VoiceRoomTokenResponse | void> => {
      const parsed = voiceRoomTokenRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return reply.send({
          status: "error",
          message: parsed.error.message,
          code: "invalid_body",
        });
      }

      const issuer = options.liveKitTokenIssuer;
      if (!issuer) {
        reply.code(503);
        return reply.send({
          status: "error",
          message: "LiveKit room token issuance is not configured on this API.",
          code: "voice_token_unavailable",
        });
      }

      // PMU-020: in privy mode the caller must present a verified token and own
      // the conversation. Denials never reach the issuer; missing and foreign
      // conversations are indistinguishable (same 404).
      let identity: string | undefined;
      if (options.authorizeRoomToken) {
        const authorization = await options.authorizeRoomToken(
          request,
          parsed.data.conversationId,
        );
        if (!authorization.ok) {
          if (authorization.reason === "unauthenticated") {
            reply.code(401);
            return reply.send({
              status: "error",
              message: "Authentication required.",
              code: "no_autenticado",
            });
          }
          reply.code(404);
          return reply.send({
            status: "error",
            message: "Conversation not found.",
            code: "conversation_not_found",
          });
        }
        identity = authorization.identity;
      }

      try {
        // The issuer reads LiveKit credentials lazily per request, so the API
        // boots fine without LiveKit configuration and fails closed here.
        return await issuer.issue({ ...parsed.data, identity });
      } catch (error) {
        reply.code(503);
        return reply.send({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "LiveKit room token issuance failed.",
          code: "voice_token_unavailable",
        });
      }
    },
  );
}
