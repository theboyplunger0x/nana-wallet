import type { DatabaseClient } from "../db/client.js";
import { isValidEvmAddress } from "../memory/address.js";
import { redactAddressLikeText, vectorLiteral } from "../memory/embedding.js";
import type { Embedding } from "../memory/types.js";

export type ContactRecord = {
  id: string;
  name: string;
  description: string;
  address: string;
  version: number;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type ContactWriteInput = {
  name: string;
  description: string;
  address: string;
};

export type ContactPatchInput = {
  name?: string;
  description?: string;
  address?: string;
  expectedVersion: number;
};

type RecipientRow = {
  id: string;
  name: string;
  description: string;
  address: string;
  version: number | string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

function iso(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function mapRecipient(row: RecipientRow): ContactRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    version: Number(row.version),
    status: row.status === "active" ? "active" : "inactive",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function normalizedContactName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es");
}

export class ContactsValidationError extends Error {}
export class ContactsNotFoundError extends Error {}
export class ContactsConflictError extends Error {}

const RECIPIENT_COLUMNS =
  "id, name, description, address, version, status, created_at, updated_at";

/**
 * User-surface contacts repository (PMU-008..013): recipient CRUD for the HTTP
 * contacts surface, strictly scoped by the resolved internal UUID through RLS
 * (`withUserTransaction`), bind-parameterized throughout. Kept separate from
 * the agent memory repository on purpose.
 */
export class ContactsRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async listActive(userId: string): Promise<ContactRecord[]> {
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<RecipientRow>(
        `SELECT ${RECIPIENT_COLUMNS}
         FROM recipients
         WHERE user_id = $1 AND status = 'active'
         ORDER BY normalized_name ASC`,
        [userId],
      );
      return result.rows.map(mapRecipient);
    });
  }

  public async create(
    userId: string,
    input: ContactWriteInput,
    embedding: Embedding,
    embeddingModelRevision: string,
  ): Promise<ContactRecord> {
    const name = this.validatedName(input.name);
    if (!isValidEvmAddress(input.address)) {
      throw new ContactsValidationError("address must be a valid EVM address");
    }
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<RecipientRow>(
        `INSERT INTO recipients (user_id, name, normalized_name, description, address, embedding, embedding_model_revision, provenance, address_confirmed_at)
         VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb, now())
         RETURNING ${RECIPIENT_COLUMNS}`,
        [
          userId,
          name,
          // Normalized name feeds embedding/agent matching; derived here so every
          // contact write satisfies the recipients constraints.
          normalizedContactName(name),
          redactAddressLikeText(input.description).trim(),
          input.address.trim(),
          vectorLiteral(embedding),
          embeddingModelRevision,
          JSON.stringify({ origin: "user" }),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("recipient insert returned no row");
      return mapRecipient(row);
    });
  }

  /**
   * PMU-010: versioned update. Locks the current row, verifies expectedVersion
   * (ContactsConflictError -> 409), snapshots the prior version into
   * owner-scoped recipient_versions and advances the projection atomically.
   */
  public async update(
    userId: string,
    recipientId: string,
    input: ContactPatchInput,
    embedding: Embedding,
    embeddingModelRevision: string,
  ): Promise<ContactRecord> {
    if (input.address !== undefined && !isValidEvmAddress(input.address)) {
      throw new ContactsValidationError("address must be a valid EVM address");
    }
    const contentChanged =
      input.name !== undefined ||
      input.description !== undefined ||
      input.address !== undefined;
    return this.database.withUserTransaction(userId, async (client) => {
      // Lock the current projection for the expected-version check.
      const current = await client.query<RecipientRow>(
        `SELECT ${RECIPIENT_COLUMNS}
         FROM recipients
         WHERE user_id = $1 AND id = $2 AND status = 'active'
         FOR UPDATE`,
        [userId, recipientId],
      );
      const row = current.rows[0];
      if (!row) throw new ContactsNotFoundError();
      if (Number(row.version) !== input.expectedVersion)
        throw new ContactsConflictError();

      await client.query(
        `INSERT INTO recipient_versions (recipient_id, user_id, version, name, description, address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          row.id,
          userId,
          Number(row.version),
          row.name,
          row.description,
          row.address,
        ],
      );

      const nextName =
        input.name !== undefined ? this.validatedName(input.name) : row.name;
      const nextDescription =
        input.description !== undefined
          ? redactAddressLikeText(input.description).trim()
          : row.description;
      const nextAddress = input.address?.trim() ?? row.address;
      const updated = await client.query<RecipientRow>(
        `UPDATE recipients
         SET name = $3, normalized_name = $4, description = $5,
             address = $6,
             embedding = $7::vector,
             embedding_model_revision = $8,
             version = version + 1,
             updated_at = now()
         WHERE user_id = $1 AND id = $2
         RETURNING ${RECIPIENT_COLUMNS}`,
        [
          userId,
          recipientId,
          nextName,
          normalizedContactName(nextName),
          nextDescription,
          nextAddress,
          // Regenerate the embedding whenever any embedded field changes so
          // agent retrieval reflects the current projection.
          contentChanged ? vectorLiteral(embedding) : vectorLiteral(embedding),
          contentChanged ? embeddingModelRevision : embeddingModelRevision,
        ],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new ContactsNotFoundError();
      return mapRecipient(updatedRow);
    });
  }

  /** PMU-011: soft delete — status flips to 'inactive', the row remains. */
  public async archive(
    userId: string,
    recipientId: string,
  ): Promise<ContactRecord | undefined> {
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<RecipientRow>(
        `UPDATE recipients
         SET status = 'inactive', updated_at = now()
         WHERE user_id = $1 AND id = $2 AND status = 'active'
         RETURNING ${RECIPIENT_COLUMNS}`,
        [userId, recipientId],
      );
      return result.rows[0] ? mapRecipient(result.rows[0]) : undefined;
    });
  }

  /** PMU-012: reveal the plain address for the owner only; 404-shaped otherwise. */
  public async revealAddress(
    userId: string,
    recipientId: string,
  ): Promise<string | undefined> {
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<{ address: string }>(
        `SELECT address FROM recipients
         WHERE user_id = $1 AND id = $2 AND status = 'active'`,
        [userId, recipientId],
      );
      return result.rows[0]?.address;
    });
  }

  private validatedName(name: string): string {
    const trimmed = redactAddressLikeText(name).trim();
    if (!trimmed) throw new ContactsValidationError("name is required");
    return trimmed;
  }
}
