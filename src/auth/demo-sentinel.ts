import type { QueryResultRow } from "pg";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Minimal structural query executor satisfied by DatabaseClient. */
type SqlQueryExecutor = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};

/**
 * Idempotently provisions the demo sentinel user (PMU-004): a `users` row with
 * `privy_did='demo'` and `id = DEMO_USER_ID`. Repeated calls preserve the
 * configured UUID. A sentinel row with a different UUID (or a row already
 * occupying the configured UUID) rejects without modifying any data.
 */
export async function ensureDemoSentinelUser(
  database: SqlQueryExecutor,
  demoUserId: string,
): Promise<string> {
  if (!uuidPattern.test(demoUserId)) {
    throw new Error("DEMO_USER_ID must be a valid UUID.");
  }
  let result: { rows: { id: string }[] };
  try {
    result = await database.query<{ id: string }>(
      `INSERT INTO users (id, privy_did, display_name)
       VALUES ($1::uuid, 'demo', 'Demo')
       ON CONFLICT (privy_did) DO UPDATE SET last_seen_at = now()
       RETURNING id`,
      [demoUserId],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error(
        `Demo sentinel conflict: users row ${demoUserId} already exists with a different privy_did; refusing to modify data.`,
      );
    }
    throw error;
  }
  const resolved = result.rows[0]?.id;
  if (resolved !== demoUserId) {
    throw new Error(
      `Demo sentinel conflict: an existing demo users row uses id ${resolved} instead of ${demoUserId}; refusing to modify data.`,
    );
  }
  return resolved;
}
