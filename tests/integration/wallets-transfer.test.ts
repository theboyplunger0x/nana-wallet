import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/db/client.js";
import {
  EmbeddedWalletService,
  defaultGrantInput,
} from "../../src/wallet/embedded.js";
import { createPrivyWalletApiClient } from "../../src/wallet/privy-client.js";
import {
  TransferRejectedError,
  WalletTransferPipeline,
  type ConfirmedTransferInput,
} from "../../src/wallet/transfer-pipeline.js";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const RECIPIENT = "0x9999999999999999999999999999999999999999";
const TOKEN = "0x3600000000000000000000000000000000000000";
const CHAIN_ID = 5042002;

async function provisionUser(
  database: DatabaseClient,
  did: string,
): Promise<string> {
  const result = await database.query<{ id: string }>(
    "SELECT users_ensure_for_privy_did($1, $2) AS id",
    [did, did],
  );
  return result.rows[0]!.id;
}

type Fixture = {
  userId: string;
  walletId: string;
  walletAddress: string;
  grantId: string;
  recipient: string;
};

async function setupFixture(
  database: DatabaseClient,
  service: EmbeddedWalletService,
): Promise<Fixture> {
  const userId = await provisionUser(
    database,
    `did:privy:transfer-${randomUUID()}`,
  );
  await service.syncWallet(userId);
  const wallet = await service.getCurrentWallet(userId);
  const grant = await service.createGrant(
    userId,
    wallet.id,
    defaultGrantInput([RECIPIENT]),
  );
  return {
    userId,
    walletId: wallet.id,
    walletAddress: wallet.address,
    grantId: grant.grantId!,
    recipient: RECIPIENT,
  };
}

function transferInput(
  fixture: Fixture,
  idempotencyKey: string,
  amountAtomic6 = "10000000",
): ConfirmedTransferInput {
  return {
    userId: fixture.userId,
    grantId: fixture.grantId,
    walletId: fixture.walletId,
    previewId: `preview-${randomUUID()}`,
    idempotencyKey,
    recipientAddress: fixture.recipient,
    amountAtomic6,
    chainId: CHAIN_ID,
    token: TOKEN,
    walletAddress: fixture.walletAddress,
  };
}

suite("/v1/wallets transfer pipeline (fixture-first, PEW-006/008/014)", () => {
  let database: DatabaseClient;
  const previousEnv = { ...process.env };

  beforeAll(async () => {
    database = createDatabaseClient(databaseUrl!);
    process.env.WDK_TOOLS_SOURCE = "fixture";
  });

  afterAll(async () => {
    await database.close();
    if (previousEnv.WDK_TOOLS_SOURCE === undefined)
      delete process.env.WDK_TOOLS_SOURCE;
    else process.env.WDK_TOOLS_SOURCE = previousEnv.WDK_TOOLS_SOURCE;
  });

  it("runs the full fixture pipeline to a confirmed receipt and never exposes signed bytes", {
    timeout: 60_000,
  }, async () => {
    const service = new EmbeddedWalletService(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const fixture = await setupFixture(database, service);
    const pipeline = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const record = await pipeline.execute(
      transferInput(fixture, `${randomUUID()}`),
    );
    expect(record.status).toBe("confirmed");
    expect(record.txHash).toMatch(/^0x/);
    expect(record.nonce).toBe("0");
    expect(record.intent.recipient).toBe(RECIPIENT);
    expect(record.intent.chainId).toBe(CHAIN_ID);
    // Signed bytes / bearer capability never appear in a public record or response.
    expect("signedTx" in record).toBe(false);
    expect("signed_tx" in record).toBe(false);
    expect(JSON.stringify(record)).not.toContain("signature");
  });

  it("double-submits the same idempotency key and returns the same operation (no second dispatch)", {
    timeout: 60_000,
  }, async () => {
    const service = new EmbeddedWalletService(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const fixture = await setupFixture(database, service);
    const pipeline = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const key = randomUUID();
    const first = await pipeline.execute(transferInput(fixture, key));
    const second = await pipeline.execute(transferInput(fixture, key));
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("confirmed");
    const rows = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM wallet_operations WHERE user_id = $1 AND idempotency_key = $2",
      [fixture.userId, `${fixture.userId}:${key}`],
    );
    expect(rows.rows[0]?.count).toBe("1");
  });

  it("keeps exactly one winner for two concurrent confirmations of one preview", {
    timeout: 60_000,
  }, async () => {
    const service = new EmbeddedWalletService(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const fixture = await setupFixture(database, service);
    const pipeline = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const key = randomUUID();
    const [a, b] = await Promise.all([
      pipeline.execute(transferInput(fixture, key)),
      pipeline.execute(transferInput(fixture, key)),
    ]);
    expect(a.id).toBe(b.id);
    const rows = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM wallet_operations WHERE user_id = $1 AND preview_id = $2",
      [fixture.userId, a.previewId],
    );
    expect(rows.rows[0]?.count).toBe("1");
  });

  it("reconciles a lost signing response by re-signing the IDENTICAL intent", {
    timeout: 60_000,
  }, async () => {
    const service = new EmbeddedWalletService(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const fixture = await setupFixture(database, service);
    const lostPipeline = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
      {
        forceLostSigningResponse: true,
      },
    );
    const lost = await lostPipeline.execute(
      transferInput(fixture, randomUUID()),
    );
    expect(lost.status).toBe("claimed");
    expect(lost.txHash).toBeNull();

    const recovered = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const final = await recovered.reconcileUncertain(fixture.userId, lost.id);
    expect(final.status).toBe("confirmed");
    expect(final.nonce).toBe(lost.nonce);
    expect(final.intent.recipient).toBe(lost.intent.recipient);
    expect(final.intent.amountAtomic6).toBe(lost.intent.amountAtomic6);
  });

  it("reconciles a lost broadcast response using the recorded tx hash without re-broadcasting", {
    timeout: 60_000,
  }, async () => {
    const service = new EmbeddedWalletService(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const fixture = await setupFixture(database, service);
    const lostPipeline = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
      {
        forceLostBroadcastResponse: true,
      },
    );
    const lost = await lostPipeline.execute(
      transferInput(fixture, randomUUID()),
    );
    expect(lost.status).toBe("submitted");
    expect(lost.txHash).toMatch(/^0x/);

    const recovered = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const final = await recovered.reconcileUncertain(fixture.userId, lost.id);
    expect(final.status).toBe("confirmed");
    expect(final.txHash).toBe(lost.txHash);
  });

  it("rejects a wrong chain, a wrong token and a non-allowlisted recipient before signing", {
    timeout: 60_000,
  }, async () => {
    const service = new EmbeddedWalletService(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const fixture = await setupFixture(database, service);
    const pipeline = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );

    await expect(
      pipeline.execute(transferInput(fixture, randomUUID())),
    ).resolves.toMatchObject({ status: "confirmed" });

    const wrongChain = { ...transferInput(fixture, randomUUID()), chainId: 1 };
    await expect(pipeline.execute(wrongChain)).rejects.toBeInstanceOf(
      TransferRejectedError,
    );

    const wrongToken = {
      ...transferInput(fixture, randomUUID()),
      token: "0x9999999999999999999999999999999999999999",
    };
    await expect(pipeline.execute(wrongToken)).rejects.toBeInstanceOf(
      TransferRejectedError,
    );

    const wrongRecipient = {
      ...transferInput(fixture, randomUUID()),
      recipientAddress: "0x2222222222222222222222222222222222222222",
    };
    await expect(pipeline.execute(wrongRecipient)).rejects.toBeInstanceOf(
      TransferRejectedError,
    );
  });

  it("rejects an amount above the per-transfer cap", {
    timeout: 60_000,
  }, async () => {
    const service = new EmbeddedWalletService(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    const fixture = await setupFixture(database, service);
    const pipeline = new WalletTransferPipeline(
      database,
      createPrivyWalletApiClient(process.env, {}),
    );
    await expect(
      pipeline.execute(transferInput(fixture, randomUUID(), "10000001")),
    ).rejects.toBeInstanceOf(TransferRejectedError);
  });
});
