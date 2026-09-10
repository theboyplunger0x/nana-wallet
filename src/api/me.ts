import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseClient } from "../db/client.js";
import { meResponseSchema, type MeResponse } from "../contracts/http.js";
export type MeRouteDependencies = {
  resolveUserId(request: FastifyRequest): Promise<string>;
  database: DatabaseClient;
};

/**
 * GET /v1/me (PMU-007): identity-only bootstrap for the authenticated user.
 * Requires a verified token (resolveUserId throws unauthenticated otherwise)
 * and reads the caller's own users row through RLS (PMU-006). Never includes
 * wallet, balance or privy_did data.
 */
export async function registerMeRoutes(
  app: FastifyInstance,
  dependencies: MeRouteDependencies,
): Promise<void> {
  app.get(
    "/v1/me",
    async (
      request,
      reply,
    ): Promise<
      | { ok: true; data: MeResponse }
      | { status: "error"; message: string; code: string }
    > => {
      const userId = await dependencies.resolveUserId(request);
      const result = await dependencies.database.withUserTransaction(
        userId,
        (client) =>
          client.query<{ id: string; display_name: string | null }>(
            "SELECT id, display_name FROM users WHERE id = $1::uuid",
            [userId],
          ),
      );
      const row = result.rows[0];
      if (!row) {
        reply.code(401);
        return reply.send({
          status: "error",
          message: "Authentication required.",
          code: "no_autenticado",
        });
      }
      // ApiEnvelope shape: the front's parseEnvelope expects { ok: true, data }.
      return {
        ok: true as const,
        data: meResponseSchema.parse({
          userId: row.id,
          displayName: row.display_name,
        }),
      };
    },
  );
}
