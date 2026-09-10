import { createDatabaseClient } from "../../src/db/client.js";

/**
 * Provisions a `users` row for a test userId. The users migration (PMU-023)
 * attaches NOT VALID foreign keys from user-scoped tables to `users`, so any
 * test writing conversations/recipients must provision its user first. Uses
 * the owner connection directly; tests run outside RLS scoping by design.
 */
export async function provisionTestUser(userId: string): Promise<void> {
 const url = process.env.DATABASE_URL;
 if (!url) return;
 const database = createDatabaseClient(url);
 try {
  await database.query(
   `INSERT INTO users (id, privy_did, display_name)
       VALUES ($1::uuid, $2, 'Test user')
       ON CONFLICT (privy_did) DO UPDATE SET last_seen_at = now()`,
   [userId, `test:${userId}`],
  );
 } finally {
  await database.close();
 }
}
