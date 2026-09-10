import type { DatabaseClient, Queryable } from "../db/client.js";
import { isValidEvmAddress } from "../memory/address.js";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ERC20,
  ERC20_TRANSFER_SELECTOR,
  deterministicHash,
  type PrivyWalletApiClient,
  type SigningIntent,
} from "./privy-client.js";

export type TransferOperationStatus =
  | "claimed"
  | "signed"
  | "submitted"
  | "confirmed"
  | "reverted"
  | "uncertain"
  | "rejected";

export type TransferIntent = {
  chainId: number;
  token: string;
  recipient: string;
  amountAtomic6: string;
  walletAddress: string;
};

export type ConfirmedTransferInput = {
  userId: string;
  grantId: string;
  walletId: string;
  conversationId?: string;
  previewId: string;
  idempotencyKey: string;
  recipientAddress: string;
  amountAtomic6: string;
  chainId: number;
  token: string;
  walletAddress: string;
};

/** Public operation record: NEVER carries signed_tx / signing secrets (PEW-011/014). */
export type WalletOperationRecord = {
  id: string;
  userId: string;
  walletId: string;
  grantId: string;
  conversationId: string | null;
  previewId: string | null;
  idempotencyKey: string;
  status: TransferOperationStatus;
  payloadHash: string | null;
  txHash: string | null;
  nonce: string | null;
  intent: TransferIntent;
  createdAt: string;
  updatedAt: string;
};

export class TransferRejectedError extends Error {
  public constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "TransferRejectedError";
  }
}

export class TransferUncertainError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TransferUncertainError";
  }
}

type OperationRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  grant_id: string;
  conversation_id: string | null;
  preview_id: string | null;
  idempotency_key: string;
  status: string;
  intent: TransferIntent;
  payload_hash: string | null;
  signed_tx: string | null;
  tx_hash: string | null;
  nonce: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type GrantRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  allowlisted_recipients: string[];
  per_transfer_atomic6: string;
  rolling_total_atomic6: string;
  rolling_window_seconds: number;
  state: string;
};

type WalletRow = {
  id: string;
  user_id: string;
  address: string;
  nonce: string;
  state: string;
};

const OPERATION_COLUMNS =
  "id, user_id, wallet_id, grant_id, conversation_id, preview_id, idempotency_key, status, intent, payload_hash, signed_tx, tx_hash, nonce, created_at, updated_at";

function pad64(hex: string): string {
  return hex.slice(2).padStart(64, "0");
}

/** Builds the exact ERC-20 transfer(recipient, amount) calldata (PEW-011/014). */
export function encodeTransferCalldata(
  recipient: string,
  amountAtomic6: string,
): string {
  if (!isValidEvmAddress(recipient))
    throw new TransferRejectedError(
      "recipient",
      "Recipient is not a valid EVM address.",
    );
  if (!/^\d+$/u.test(amountAtomic6))
    throw new TransferRejectedError(
      "amount",
      "Amount must be a non-negative integer string.",
    );
  const amountHex = BigInt(amountAtomic6).toString(16).padStart(64, "0");
  return `${ERC20_TRANSFER_SELECTOR}${pad64(recipient)}${amountHex}`;
}

/** Decodes the calldata and verifies it is exactly transfer(recipient, amount). */
export function decodeTransferCalldata(data: string): {
  recipient: string;
  amountAtomic6: string;
} {
  if (!data.startsWith(ERC20_TRANSFER_SELECTOR)) {
    throw new TransferRejectedError(
      "calldata",
      "Calldata is not the ERC-20 transfer selector.",
    );
  }
  const payload = data.slice(ERC20_TRANSFER_SELECTOR.length);
  if (payload.length !== 128)
    throw new TransferRejectedError("calldata", "Calldata length mismatch.");
  const recipient = `0x${payload.slice(24, 64)}`;
  const amountAtomic6 = BigInt(`0x${payload.slice(64, 128)}`).toString();
  return { recipient, amountAtomic6 };
}

function toPublic(row: OperationRow): WalletOperationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    grantId: row.grant_id,
    conversationId: row.conversation_id,
    previewId: row.preview_id,
    idempotencyKey: row.idempotency_key,
    status: row.status as TransferOperationStatus,
    payloadHash: row.payload_hash,
    txHash: row.tx_hash,
    nonce: row.nonce,
    intent: row.intent,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };
}

function iso(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export type PipelineFaultOptions = {
  /** Simulate a lost SIGNING response: leave the op 'claimed', nothing broadcast. */
  forceLostSigningResponse?: boolean;
  /** Simulate a lost BROADCAST response: record tx_hash, leave the op 'submitted'. */
  forceLostBroadcastResponse?: boolean;
};

/** Verify the decoded signed payload against the exact claimed intent (PEW-014). */
function verifySignedPayload(signedTx: string, expected: SigningIntent): void {
  let decoded: {
    from?: string;
    chainId?: number;
    nonce?: string;
    to?: string;
    value?: string;
    data?: string;
  };
  try {
    decoded = JSON.parse(signedTx);
  } catch {
    throw new TransferRejectedError(
      "signed",
      "Signed payload is not a decodable transaction.",
    );
  }
  if (decoded.from !== expected.from)
    throw new TransferRejectedError(
      "sender",
      "Recovered sender does not match the claimed wallet.",
    );
  if (decoded.chainId !== expected.chainId)
    throw new TransferRejectedError(
      "chain",
      "Signed payload chain does not match Arc Testnet.",
    );
  if (decoded.nonce !== expected.nonce.toString())
    throw new TransferRejectedError(
      "nonce",
      "Signed payload nonce does not match the reserved nonce.",
    );
  if (decoded.to !== expected.to)
    throw new TransferRejectedError(
      "token",
      "Signed payload recipient contract is not the USDC ERC-20 interface.",
    );
  if (decoded.value !== "0")
    throw new TransferRejectedError(
      "value",
      "Signed payload carries a non-zero native value.",
    );
  if (decoded.data !== expected.data)
    throw new TransferRejectedError(
      "calldata",
      "Signed payload calldata is not the exact transfer(recipient, amount).",
    );
}

/**
 * PEW-006/008/014: fixture-first signing and broadcast pipeline. Atomic claim
 * (one winner per confirmed preview), per-wallet nonce serialization, exact
 * ERC-20 calldata, decode/verify before restricted persistence, then broadcast
 * and receipt verification. Reconciliation (F6) reuses identical persisted bytes
 * or re-signs the IDENTICAL intent — never a new nonce or fee bump.
 */
// Fixture-only until durable real transport and receipt reconciliation are integrated.
export class WalletTransferPipeline {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly privy: PrivyWalletApiClient,
    private readonly faults: PipelineFaultOptions = {},
  ) {
    if (privy.mode !== "fixture") {
      throw new TransferRejectedError(
        "live_transport_unavailable",
        "This pipeline simulates dispatch and receipts and cannot execute live wallet transfers.",
      );
    }
  }

  private namespacedKey(userId: string, key: string): string {
    if (key.includes(":"))
      throw new TransferRejectedError(
        "idempotency",
        "Raw client idempotency key must not be reused across users.",
      );
    return `${userId}:${key}`;
  }

  public async execute(
    input: ConfirmedTransferInput,
  ): Promise<WalletOperationRecord> {
    const key = this.namespacedKey(input.userId, input.idempotencyKey);

    const existing = await this.findByIdempotency(input.userId, key);
    if (existing) return toPublic(existing);

    const claimed = await this.claim(input, key);
    if (!claimed.created) {
      return toPublic(claimed.row);
    }

    let row = claimed.row;
    if (this.faults.forceLostSigningResponse) {
      // Lost signing response: nothing persisted, nothing broadcast. Reconcile
      // re-signs the IDENTICAL intent.
      return toPublic(row);
    }

    const intent: TransferIntent = {
      chainId: input.chainId,
      token: input.token,
      recipient: input.recipientAddress,
      amountAtomic6: input.amountAtomic6,
      walletAddress: input.walletAddress,
    };
    const payloadHash = deterministicHash(JSON.stringify(intent));
    const calldata = encodeTransferCalldata(
      input.recipientAddress,
      input.amountAtomic6,
    );
    const signingIntent: SigningIntent = {
      chainId: input.chainId,
      from: input.walletAddress,
      to: ARC_USDC_ERC20,
      value: "0",
      data: calldata,
      nonce: BigInt(row.nonce ?? "0"),
    };

    const signed = await this.privy.signTransaction(signingIntent);
    verifySignedPayload(signed.signedTx, signingIntent);

    row = await this.persistSigned(
      row.id,
      input.userId,
      payloadHash,
      signed.signedTx,
      "signed",
    );
    if (this.faults.forceLostBroadcastResponse) {
      row = await this.markSubmitted(
        row.id,
        input.userId,
        this.fixtureTxHash(row),
      );
      return toPublic(row);
    }

    const txHash = this.fixtureTxHash(row);
    row = await this.markSubmitted(row.id, input.userId, txHash);
    row = await this.markConfirmed(row.id, input.userId, txHash);
    return toPublic(row);
  }

  /**
   * F6: reconcile an uncertain operation against its recorded attempt. A
   * claimed-but-unsigned op re-signs the IDENTICAL intent (same nonce, same
   * calldata). A signed/submitted op reuses the persisted bytes or verifies the
   * recorded broadcast hash — never a new nonce or fee bump.
   */
  public async reconcileUncertain(
    userId: string,
    operationId: string,
  ): Promise<WalletOperationRecord> {
    const row = await this.load(userId, operationId);
    if (!row)
      throw new TransferUncertainError(
        "Operation not found for reconciliation.",
      );

    if (row.status === "claimed" && !row.signed_tx) {
      // Lost signing response: re-sign the IDENTICAL intent.
      const intent = row.intent;
      const calldata = encodeTransferCalldata(
        intent.recipient,
        intent.amountAtomic6,
      );
      if (
        intent.chainId !== ARC_TESTNET_CHAIN_ID ||
        intent.token !== ARC_USDC_ERC20
      ) {
        throw new TransferRejectedError(
          "intent",
          "Reconciliation refused: intent is not the pinned Arc/USDC configuration.",
        );
      }
      const signingIntent: SigningIntent = {
        chainId: intent.chainId,
        from: intent.walletAddress,
        to: ARC_USDC_ERC20,
        value: "0",
        data: calldata,
        nonce: BigInt(row.nonce ?? "0"),
      };
      const signed = await this.privy.signTransaction(signingIntent);
      verifySignedPayload(signed.signedTx, signingIntent);
      let updated = await this.persistSigned(
        row.id,
        userId,
        row.payload_hash ?? deterministicHash(JSON.stringify(intent)),
        signed.signedTx,
        "signed",
      );
      const txHash = this.fixtureTxHash(updated);
      updated = await this.markSubmitted(updated.id, userId, txHash);
      return toPublic(await this.markConfirmed(updated.id, userId, txHash));
    }

    if (row.status === "signed" && row.signed_tx) {
      // Lost broadcast response BEFORE dispatch: re-broadcast the identical bytes.
      const intent = row.intent;
      let expectedData: string;
      try {
        const signedTx = JSON.parse(row.signed_tx) as { data?: string };
        expectedData =
          signedTx.data ??
          encodeTransferCalldata(intent.recipient, intent.amountAtomic6);
      } catch {
        throw new TransferRejectedError(
          "signed",
          "Reconciliation refused: persisted signed bytes are not decodable.",
        );
      }
      const canonical = encodeTransferCalldata(
        intent.recipient,
        intent.amountAtomic6,
      );
      if (expectedData !== canonical) {
        throw new TransferRejectedError(
          "signed",
          "Reconciliation refused: persisted calldata differs from the recorded intent.",
        );
      }
      const expected: SigningIntent = {
        chainId: intent.chainId,
        from: intent.walletAddress,
        to: ARC_USDC_ERC20,
        value: "0",
        data: canonical,
        nonce: BigInt(row.nonce ?? "0"),
      };
      verifySignedPayload(row.signed_tx, expected);
      const txHash = this.fixtureTxHash(row);
      const updated = await this.markSubmitted(row.id, userId, txHash);
      return toPublic(await this.markConfirmed(updated.id, userId, txHash));
    }

    if (row.status === "submitted" && row.tx_hash) {
      // Lost broadcast response AFTER dispatch: verify the recorded hash only.
      return toPublic(await this.markConfirmed(row.id, userId, row.tx_hash));
    }

    return toPublic(row);
  }

  /** Atomically claims a confirmed preview (one winner), reserving the wallet nonce. */
  private async claim(
    input: ConfirmedTransferInput,
    key: string,
  ): Promise<{ created: boolean; row: OperationRow }> {
    const claimed = await this.database.withUserTransaction(
      input.userId,
      async (client) => {
        const wallet = await client.query<WalletRow>(
          `SELECT id, user_id, address, nonce, state FROM user_wallets
         WHERE id = $1 AND user_id = $2 AND state = 'ready' FOR UPDATE`,
          [input.walletId, input.userId],
        );
        const walletRow = wallet.rows[0];
        if (!walletRow)
          throw new TransferRejectedError(
            "wallet",
            "Wallet is not ready for signing.",
          );
        if (walletRow.address !== input.walletAddress) {
          throw new TransferRejectedError(
            "sender",
            "Claimed sender does not match the bound wallet address.",
          );
        }

        const grant = await client.query<GrantRow>(
          `SELECT id, user_id, wallet_id, allowlisted_recipients, per_transfer_atomic6, rolling_total_atomic6, rolling_window_seconds, state
         FROM signer_grants WHERE id = $1 AND user_id = $2 AND state = 'active'`,
          [input.grantId, input.userId],
        );
        const grantRow = grant.rows[0];
        if (!grantRow)
          throw new TransferRejectedError("grant", "Grant is not active.");
        this.validateIntent(input, grantRow);

        const intent: TransferIntent = {
          chainId: input.chainId,
          token: input.token,
          recipient: input.recipientAddress,
          amountAtomic6: input.amountAtomic6,
          walletAddress: input.walletAddress,
        };
        let inserted: OperationRow | undefined;
        try {
          const result = await client.query<OperationRow>(
            `INSERT INTO wallet_operations
             (user_id, wallet_id, grant_id, conversation_id, preview_id, idempotency_key, status, intent, nonce)
           VALUES ($1, $2, $3, $4, $5, $6, 'claimed', $7::jsonb, $8)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING ${OPERATION_COLUMNS}`,
            [
              input.userId,
              input.walletId,
              input.grantId,
              input.conversationId ?? null,
              input.previewId,
              key,
              JSON.stringify(intent),
              walletRow.nonce,
            ],
          );
          inserted = result.rows[0];
          if (!inserted) {
            // Someone else claimed this idempotency key first: return their row.
            const existingRow = await this.findByIdempotencyIn(
              client,
              input.userId,
              key,
            );
            return { created: false, row: existingRow! };
          }
        } catch (error) {
          if ((error as { code?: string }).code === "23505") {
            const existingRow = await this.findByIdempotencyIn(
              client,
              input.userId,
              key,
            );
            if (existingRow) return { created: false, row: existingRow };
            const byPreview = await this.findByPreviewIn(
              client,
              input.userId,
              input.previewId,
            );
            if (byPreview) return { created: false, row: byPreview };
            throw error;
          }
          throw error;
        }

        await client.query(
          `UPDATE user_wallets SET nonce = nonce + 1, updated_at = now() WHERE id = $1 AND user_id = $2`,
          [input.walletId, input.userId],
        );
        return { created: true, row: inserted };
      },
    );
    return claimed;
  }

  private validateIntent(input: ConfirmedTransferInput, grant: GrantRow): void {
    if (input.chainId !== ARC_TESTNET_CHAIN_ID) {
      throw new TransferRejectedError(
        "chain",
        "Only Arc Testnet (5042002) is supported.",
      );
    }
    if (input.token !== ARC_USDC_ERC20) {
      throw new TransferRejectedError(
        "token",
        "Only the USDC ERC-20 interface is supported.",
      );
    }
    if (!isValidEvmAddress(input.recipientAddress)) {
      throw new TransferRejectedError(
        "recipient",
        "Recipient is not a valid EVM address.",
      );
    }
    const allowlist = Array.isArray(grant.allowlisted_recipients)
      ? grant.allowlisted_recipients
      : [];
    if (
      !allowlist.some(
        (entry) => entry.toLowerCase() === input.recipientAddress.toLowerCase(),
      )
    ) {
      throw new TransferRejectedError(
        "recipient",
        "Recipient is not on the grant allowlist.",
      );
    }
    const amount = BigInt(input.amountAtomic6);
    if (amount <= 0n)
      throw new TransferRejectedError("amount", "Amount must be positive.");
    if (amount > BigInt(grant.per_transfer_atomic6)) {
      throw new TransferRejectedError(
        "amount",
        "Amount exceeds the per-transfer cap.",
      );
    }
  }

  private fixtureTxHash(row: OperationRow): string {
    return deterministicHash(`tx|${row.id}|${row.nonce}`).replace(
      "0x",
      "0x0000",
    );
  }

  private async persistSigned(
    operationId: string,
    userId: string,
    payloadHash: string,
    signedTx: string,
    status: "signed",
  ): Promise<OperationRow> {
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<OperationRow>(
        `UPDATE wallet_operations SET status = $3, payload_hash = $4, signed_tx = $5, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING ${OPERATION_COLUMNS}`,
        [operationId, userId, status, payloadHash, signedTx],
      );
      if (!result.rows[0])
        throw new TransferUncertainError(
          "Operation not found while persisting signed bytes.",
        );
      return result.rows[0];
    });
  }

  private async markSubmitted(
    operationId: string,
    userId: string,
    txHash: string,
  ): Promise<OperationRow> {
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<OperationRow>(
        `UPDATE wallet_operations SET status = 'submitted', tx_hash = $3, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND status IN ('claimed', 'signed') RETURNING ${OPERATION_COLUMNS}`,
        [operationId, userId, txHash],
      );
      if (!result.rows[0]) {
        const row = await this.loadIn(client, userId, operationId);
        return row ?? (await this.load(userId, operationId))!;
      }
      return result.rows[0];
    });
  }

  private async markConfirmed(
    operationId: string,
    userId: string,
    txHash: string,
  ): Promise<OperationRow> {
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<OperationRow>(
        `UPDATE wallet_operations SET status = 'confirmed', tx_hash = $3, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND status IN ('submitted', 'signed') RETURNING ${OPERATION_COLUMNS}`,
        [operationId, userId, txHash],
      );
      if (!result.rows[0]) {
        const row = await this.loadIn(client, userId, operationId);
        return row ?? (await this.load(userId, operationId))!;
      }
      return result.rows[0];
    });
  }

  private async findByIdempotency(
    userId: string,
    key: string,
  ): Promise<OperationRow | undefined> {
    return this.database.withUserTransaction(userId, (client) =>
      this.findByIdempotencyIn(client, userId, key),
    );
  }

  private async findByIdempotencyIn(
    client: Queryable,
    userId: string,
    key: string,
  ): Promise<OperationRow | undefined> {
    const result = await client.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM wallet_operations WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, key],
    );
    return result.rows[0];
  }

  private async findByPreviewIn(
    client: Queryable,
    userId: string,
    previewId: string,
  ): Promise<OperationRow | undefined> {
    const result = await client.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM wallet_operations WHERE user_id = $1 AND preview_id = $2 ORDER BY updated_at DESC LIMIT 1`,
      [userId, previewId],
    );
    return result.rows[0];
  }

  private async load(
    userId: string,
    operationId: string,
  ): Promise<OperationRow | undefined> {
    return this.database.withUserTransaction(userId, (client) =>
      this.loadIn(client, userId, operationId),
    );
  }

  private async loadIn(
    client: Queryable,
    userId: string,
    operationId: string,
  ): Promise<OperationRow | undefined> {
    const result = await client.query<OperationRow>(
      `SELECT ${OPERATION_COLUMNS} FROM wallet_operations WHERE id = $1 AND user_id = $2`,
      [operationId, userId],
    );
    return result.rows[0];
  }
}

export const OPERATION_STATUSES: TransferOperationStatus[] = [
  "claimed",
  "signed",
  "submitted",
  "confirmed",
  "reverted",
  "uncertain",
  "rejected",
];

export { iso };
