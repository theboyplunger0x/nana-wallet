import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { buildServer } from "../../src/server.js";
import {
  createDatabaseClient,
  type DatabaseClient,
} from "../../src/db/client.js";
import {
  EmbeddedWalletService,
  WalletUnavailableError,
} from "../../src/wallet/embedded.js";
import { createPrivyWalletApiClient } from "../../src/wallet/privy-client.js";
import {
  PrivyServerClient,
  type PrivyFetch,
  type PrivyWalletRecord,
} from "../../src/wallet/privy-server-client.js";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const APP_ID = "test-enroll-app";
const APP_SECRET = "test-enroll-secret";
const BASE = "https://mock.privy.test/v1";
const DID = "did:privy:enroll-user";

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

/**
 * Standard wallet read-back for the enroll user (owner + signer with policy).
 * Every wallet gets a UNIQUE provider id so test runs never collide on the
 * `provider_wallet_id` unique constraint across different users (which would trip
 * the user_wallets RLS USING check on an ON CONFLICT update).
 */
function enrollWallet(
  policyId: string,
  owner = DID,
  id = `provider-wallet-${randomUUID()}`,
): PrivyWalletRecord {
  return {
    id,
    address: "0x0000000000000000000000000000000000000001",
    owner,
    chain_type: "ethereum",
    signers: [{ signer_id: "auth-signer-1", policy_ids: [policyId] }],
  };
}

function mockResponse(
  body: unknown,
  status = 200,
): {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
} {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

/**
 * Builds a server client backed by an injected fetch that dispatches on URL. The
 * wallet list and the single-wallet read-back are configurable so each scenario
 * can prove the contract without a live Privy call.
 */
function mockServerClient(options: {
  policyId?: string;
  list?: PrivyWalletRecord[];
  wallet?: PrivyWalletRecord;
}): { client: PrivyServerClient; fetchMock: ReturnType<typeof vi.fn> } {
  const fetchMock = vi.fn<PrivyFetch>(async (url) => {
    const method = url.startsWith(`${BASE}/policies`) ? "POST" : "GET";
    if (method === "POST") {
      return mockResponse({ id: options.policyId ?? "pol_1" });
    }
    if (url.includes("/wallets?owner=")) {
      return mockResponse({ data: options.list ?? [] });
    }
    if (url.includes("/wallets/")) {
      const wallet = options.wallet;
      if (!wallet) return mockResponse({ error: "not_found" }, 404);
      return mockResponse(wallet);
    }
    return mockResponse({ error: "not_found" }, 404);
  });
  const client = new PrivyServerClient({
    appId: APP_ID,
    appSecret: APP_SECRET,
    baseUrl: BASE,
    fetch: fetchMock,
  });
  return { client, fetchMock };
}

suite(
  "signer enrollment + owner-verified sync (PEW-014, privy mode, injected fetch)",
  () => {
    let database: DatabaseClient;
    let verifyPrivateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
    const previousEnv = { ...process.env };

    beforeAll(() => {
      database = createDatabaseClient(databaseUrl!);
      // Suite-wide test verification key (P-256, ES256) for the access-token
      // identity provider in privy mode.
      const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
      verifyPrivateKey = pair.privateKey;
      process.env.PRIVY_VERIFICATION_KEY = String(
        pair.publicKey.export({ type: "spki", format: "pem" }),
      );
      process.env.IDENTITY_PROVIDER = "privy";
      process.env.PRIVY_APP_ID = APP_ID;
      process.env.PRIVY_APP_SECRET = APP_SECRET;
      process.env.PRIVY_AUTHORIZATION_KEY_QUORUM_ID = "key-quorum-1";
      process.env.PRIVY_API_BASE_URL = BASE;
      process.env.WDK_TOOLS_SOURCE = "fixture";
      delete process.env.DEMO_USER_ID;
    });

    afterAll(async () => {
      await database.close();
      for (const key of [
        "IDENTITY_PROVIDER",
        "PRIVY_APP_ID",
        "PRIVY_APP_SECRET",
        "PRIVY_VERIFICATION_KEY",
        "PRIVY_AUTHORIZATION_KEY_QUORUM_ID",
        "PRIVY_API_BASE_URL",
      ]) {
        if (previousEnv[key] === undefined) delete process.env[key];
        else process.env[key] = previousEnv[key] as string;
      }
      if (previousEnv.WDK_TOOLS_SOURCE === undefined)
        delete process.env.WDK_TOOLS_SOURCE;
      else process.env.WDK_TOOLS_SOURCE = previousEnv.WDK_TOOLS_SOURCE;
    });

    it("sync gives unprovisioned for zero owned wallets and never creates a server wallet", {
      timeout: 60_000,
    }, async () => {
      const userId = await provisionUser(
        database,
        `did:privy:zero-${randomUUID()}`,
      );
      const { client } = mockServerClient({ list: [] });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      const result = await service.syncWallet(userId);
      expect(result.state).toBe("unprovisioned");
      expect(result.address).toBe("");
      const rows = await database.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM user_wallets WHERE user_id = $1",
        [userId],
      );
      expect(rows.rows[0]?.count).toBe("0");
    });

    it("sync binds a single owned wallet to ready and is idempotent", {
      timeout: 60_000,
    }, async () => {
      const userId = await provisionUser(
        database,
        `did:privy:one-${randomUUID()}`,
      );
      const { client } = mockServerClient({
        list: [enrollWallet("pol_ignored", `did:privy:one-${randomUUID()}`)],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      const first = await service.syncWallet(userId);
      expect(first.state).toBe("ready");
      expect(first.created).toBe(true);
      expect(first.address).toMatch(/^0x[0-9a-f]{40}$/u);
      const second = await service.syncWallet(userId);
      expect(second.created).toBe(false);
      expect(second.address).toBe(first.address);
    });

    it("sync marks multiple owned wallets as conflict", {
      timeout: 60_000,
    }, async () => {
      const userId = await provisionUser(
        database,
        `did:privy:two-${randomUUID()}`,
      );
      const did = `did:privy:two-${randomUUID()}`;
      const { client } = mockServerClient({
        list: [enrollWallet("pol_a", did), enrollWallet("pol_b", did)],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      const result = await service.syncWallet(userId);
      expect(result.state).toBe("conflict");
    });

    it("prepare is idempotent (same policyId on retry) and returns quorumId + aggregationReady:false", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:prep-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const { client } = mockServerClient({
        policyId: "pol_enroll_1",
        list: [enrollWallet("pol_enroll_1", did)],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const first = await service.preparePermission(userId, [
        "0x1111111111111111111111111111111111111111",
      ]);
      expect(first.policyId).toBe("pol_enroll_1");
      expect(first.quorumId).toBe("key-quorum-1");
      expect(first.aggregationReady).toBe(false);
      expect(first.aggregateBlockReason).toContain("group_by");
      const second = await service.preparePermission(userId, [
        "0x1111111111111111111111111111111111111111",
      ]);
      expect(second.policyId).toBe("pol_enroll_1");
    });

    it("complete proves owner + policy via read-back and activates", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:complete-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const wallet = enrollWallet("pol_enroll_1", did);
      const { client } = mockServerClient({
        policyId: "pol_enroll_1",
        list: [wallet],
        wallet,
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const prep = await service.preparePermission(userId, [
        "0x1111111111111111111111111111111111111111",
      ]);
      const result = await service.completePermission(userId, prep.walletId);
      expect(result.verified).toBe(true);
      expect(result.state).toBe("active");
      expect(result.permission?.state).toBe("active");
      expect(result.permission?.recipients).toContain(
        "0x1111111111111111111111111111111111111111",
      );
      expect(result.permission?.aggregationReady).toBe(false);
    });

    it("forged owner read-back keeps the grant pending and never activates", {
      timeout: 60_000,
    }, async () => {
      const userId = await provisionUser(
        database,
        `did:privy:forged-${randomUUID()}`,
      );
      const wallet = enrollWallet("pol_enroll_1", "did:privy:some-other-user");
      const { client } = mockServerClient({
        policyId: "pol_enroll_1",
        list: [wallet],
        // owner does NOT match the caller's privy_did → forged wallet
        wallet,
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const prep = await service.preparePermission(userId, [
        "0x1111111111111111111111111111111111111111",
      ]);
      const result = await service.completePermission(userId, prep.walletId);
      expect(result.verified).toBe(false);
      expect(result.state).toBe("pending");
      expect(result.permission).toBeNull();
      expect(result.observed.walletOwnerMatches).toBe(false);
      const rows = await database.query<{ state: string }>(
        "SELECT state FROM signer_grants WHERE wallet_id = $1",
        [prep.walletId],
      );
      // The grant stays pending (never an optimistic client success flag).
      expect(rows.rows[0]?.state).toBe("pending");
    });

    it("a client success flag alone can never activate (read-back lacks the policy)", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:csf-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const listWallet = enrollWallet("pol_enroll_1", did);
      const readbackWallet: PrivyWalletRecord = {
        ...listWallet,
        signers: [{ signer_id: "other-signer", policy_ids: ["pol_different"] }],
      };
      const { client } = mockServerClient({
        policyId: "pol_enroll_1",
        list: [listWallet],
        // owner correct but NO signer carries the stored policy id
        wallet: readbackWallet,
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const prep = await service.preparePermission(userId, [
        "0x1111111111111111111111111111111111111111",
      ]);
      const result = await service.completePermission(userId, prep.walletId);
      expect(result.verified).toBe(false);
      expect(result.observed.policyAttached).toBe(false);
      expect(result.observed.observedPolicyIds).toContain("pol_different");
      const rows = await database.query<{ state: string }>(
        "SELECT state FROM signer_grants WHERE wallet_id = $1",
        [prep.walletId],
      );
      expect(rows.rows[0]?.state).toBe("pending");
    });

    it("prepare is 503-readiness-blocked when the authorization quorum is not configured", {
      timeout: 60_000,
    }, async () => {
      const userId = await provisionUser(
        database,
        `did:privy:nq-${randomUUID()}`,
      );
      const { client } = mockServerClient({
        policyId: "pol_enroll_1",
        list: [enrollWallet("pol_enroll_1", `did:privy:nq-${randomUUID()}`)],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        // no keyQuorumId configured
      );
      await service.syncWallet(userId);
      await expect(
        service.preparePermission(userId, [
          "0x1111111111111111111111111111111111111111",
        ]),
      ).rejects.toBeInstanceOf(WalletUnavailableError);
    });

    it("authenticated prepare + complete flow via the HTTP envelope (privy token)", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:route-${randomUUID()}`;
      const wallet = enrollWallet("pol_route", did);
      const { client } = mockServerClient({
        policyId: "pol_route",
        list: [wallet],
        wallet,
      });
      // Build the app with the injected mock server client.
      const app = buildServer({ privyServer: client });
      try {
        const token = await signToken(did, verifyPrivateKey);
        const sync = await app.inject({
          method: "POST",
          url: "/v1/wallets/sync",
          headers: { authorization: `Bearer ${token}` },
        });
        expect(sync.statusCode).toBe(200);
        expect(sync.json().data.state).toBe("ready");

        const prepare = await app.inject({
          method: "POST",
          url: "/v1/wallets/current/permission/prepare",
          headers: { authorization: `Bearer ${token}` },
          payload: {
            recipients: ["0x1111111111111111111111111111111111111111"],
          },
        });
        expect(prepare.statusCode).toBe(200);
        const prep = prepare.json().data;
        expect(prep.policyId).toBe("pol_route");
        expect(prep.quorumId).toBe("key-quorum-1");
        expect(prep.aggregationReady).toBe(false);
        expect(JSON.stringify(prep)).not.toContain(APP_SECRET);

        const complete = await app.inject({
          method: "POST",
          url: "/v1/wallets/current/permission/complete",
          headers: { authorization: `Bearer ${token}` },
          payload: { walletId: prep.walletId },
        });
        expect(complete.statusCode).toBe(200);
        expect(complete.json().data.verified).toBe(true);
        expect(complete.json().data.state).toBe("active");
      } finally {
        await app.close();
      }
    });
  },
);

/** Signs a Privy-style ES256 access token for the given DID (suite verification key). */
async function signToken(
  did: string,
  verifyPrivateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(did)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 5)
    .setIssuer("privy.io")
    .setAudience(APP_ID)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(verifyPrivateKey);
}
