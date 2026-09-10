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
  ownerId = "owner-key-quorum",
  id = `provider-wallet-${randomUUID()}`,
): PrivyWalletRecord {
  return {
    id,
    address: "0x0000000000000000000000000000000000000001",
    chain_type: "ethereum",
    policy_ids: [],
    owner_id: ownerId,
    additional_signers: [
      { signer_id: "auth-signer-1", override_policy_ids: [policyId] },
    ],
    archived_at: null,
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
  lists?: PrivyWalletRecord[][];
  listStatuses?: number[];
}): { client: PrivyServerClient; fetchMock: ReturnType<typeof vi.fn> } {
  let listCall = 0;
  const fetchMock = vi.fn<PrivyFetch>(async (url) => {
    const method = url.startsWith(`${BASE}/policies`) ? "POST" : "GET";
    if (method === "POST") {
      return mockResponse({ id: options.policyId ?? "pol_1" });
    }
    if (url.includes("/wallets?user_id=")) {
      const status = options.listStatuses?.[listCall] ?? 200;
      const configured = options.lists?.[listCall] ?? options.list ?? [];
      listCall += 1;
      return status >= 400
        ? mockResponse({ error: "wallet_provider_unavailable" }, status)
        : mockResponse({ data: configured });
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

    it("demotes a stale ready binding when Privy no longer attributes a wallet to the user", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:removed-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const wallet = enrollWallet("pol_ignored");
      const { client } = mockServerClient({ lists: [[wallet], []] });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );

      expect((await service.syncWallet(userId)).state).toBe("ready");
      const removed = await service.syncWallet(userId);
      expect(removed).toMatchObject({ state: "unavailable", address: "" });
      await expect(service.getCurrentWallet(userId)).resolves.toMatchObject({
        state: "unavailable",
        address: "",
      });
    });

    it("demotes cached readiness when Privy cannot verify ownership", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:sync-outage-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const wallet = enrollWallet("pol_ignored");
      const { client } = mockServerClient({
        lists: [[wallet], [wallet]],
        listStatuses: [200, 503],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );

      expect((await service.syncWallet(userId)).state).toBe("ready");
      await expect(service.syncWallet(userId)).rejects.toBeInstanceOf(
        WalletUnavailableError,
      );
      await expect(service.getCurrentWallet(userId)).resolves.toMatchObject({
        state: "unavailable",
        address: "",
      });
    });

    it("serializes concurrent syncs so an older failure cannot overwrite a newer success", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:sync-race-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const wallet = enrollWallet("pol_ignored");
      let callCount = 0;
      let activeFetches = 0;
      let maxActiveFetches = 0;
      let markFirstStarted!: () => void;
      let markSecondStarted!: () => void;
      let rejectFirst!: (reason: Error) => void;
      const firstStarted = new Promise<void>((resolve) => {
        markFirstStarted = resolve;
      });
      const secondStarted = new Promise<void>((resolve) => {
        markSecondStarted = resolve;
      });
      const fetchMock = vi.fn<PrivyFetch>(async (url) => {
        if (!url.includes("/wallets?user_id="))
          return mockResponse({ error: "not_found" }, 404);

        callCount += 1;
        activeFetches += 1;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
        if (callCount === 1) {
          markFirstStarted();
          try {
            return await new Promise<ReturnType<typeof mockResponse>>(
              (_resolve, reject) => {
                rejectFirst = reject;
              },
            );
          } finally {
            activeFetches -= 1;
          }
        }

        markSecondStarted();
        activeFetches -= 1;
        return mockResponse({ data: [wallet] });
      });
      const client = new PrivyServerClient({
        appId: APP_ID,
        appSecret: APP_SECRET,
        baseUrl: BASE,
        fetch: fetchMock,
        requestTimeoutMs: 1_000,
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );

      const firstSync = service.syncWallet(userId);
      const firstResult = expect(firstSync).rejects.toBeInstanceOf(
        WalletUnavailableError,
      );
      await firstStarted;
      const secondSync = service.syncWallet(userId);
      const secondStartedBeforeRelease = await Promise.race([
        secondStarted.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);

      rejectFirst(new Error("older provider request failed"));
      await firstResult;
      await expect(secondSync).resolves.toMatchObject({
        state: "ready",
        address: wallet.address,
      });
      await expect(service.getCurrentWallet(userId)).resolves.toMatchObject({
        state: "ready",
        address: wallet.address,
      });
      expect(secondStartedBeforeRelease).toBe(false);
      expect(maxActiveFetches).toBe(1);
    });

    it("atomically replaces a stale ready binding when Privy attributes a new wallet", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:replacement-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const firstWallet = enrollWallet(
        "pol_ignored",
        "owner-key-quorum",
        `provider-wallet-${randomUUID()}`,
      );
      const secondWallet = {
        ...enrollWallet(
          "pol_ignored",
          "owner-key-quorum",
          `provider-wallet-${randomUUID()}`,
        ),
        address: "0x2222222222222222222222222222222222222222",
      };
      const { client } = mockServerClient({
        lists: [[firstWallet], [secondWallet]],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );

      await service.syncWallet(userId);
      const replaced = await service.syncWallet(userId);
      expect(replaced).toMatchObject({
        state: "ready",
        address: secondWallet.address,
      });
      const rows = await database.query<{
        provider_wallet_id: string;
        state: string;
      }>(
        "SELECT provider_wallet_id, state FROM user_wallets WHERE user_id = $1 ORDER BY provider_wallet_id",
        [userId],
      );
      expect(rows.rows).toEqual(
        expect.arrayContaining([
          { provider_wallet_id: firstWallet.id, state: "unavailable" },
          { provider_wallet_id: secondWallet.id, state: "ready" },
        ]),
      );
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

    it("prepare creates the per-transfer provider policy and a pending grant (user-authorized scope)", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:prep-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const { client, fetchMock } = mockServerClient({
        list: [enrollWallet("pol_enroll_1")],
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
      // Per-transfer policy created server-side; the rolling-hour aggregate
      // stays a pending feature (never enforced, never hidden).
      expect(prep.policyId).toBe("pol_1");
      expect(prep.aggregationReady).toBe(false);
      expect(prep.aggregateBlockReason).toMatch(/group_by/u);
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/policies") && init.method === "POST",
        ),
      ).toBe(true);
      const rows = await database.query<{ state: string }>(
        "SELECT state FROM signer_grants WHERE user_id = $1 LIMIT 1",
        [userId],
      );
      expect(rows.rows[0]?.state).toBe("pending");
    });

    it("does not activate when the attached signer policy differs from the stored grant", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:complete-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      // The provider wallet carries a signer with a DIFFERENT policy id:
      // ownership proves, but the stored grant's policy is not attached.
      const wallet = enrollWallet("pol_other");
      const { client } = mockServerClient({ list: [wallet] });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const localWallet = await service.getCurrentWallet(userId);
      await database.query(
        `INSERT INTO signer_grants
           (user_id, wallet_id, provider_policy_id, policy_hash, allowlisted_recipients,
            per_transfer_atomic6, rolling_total_atomic6, rolling_window_seconds, gas_ceiling, state)
           VALUES ($1, $2, 'pol_enroll_1', 'hash', '["0x1111111111111111111111111111111111111111"]'::jsonb,
                   '10000000', '50000000', 3600, '0.01', 'pending')`,
        [userId, localWallet.id],
      );

      const result = await service.completePermission(userId, localWallet.id);
      expect(result.verified).toBe(false);
      expect(result.observed?.policyAttached).toBe(false);
      const rows = await database.query<{ state: string }>(
        "SELECT state FROM signer_grants WHERE wallet_id = $1",
        [localWallet.id],
      );
      expect(rows.rows[0]?.state).toBe("pending");
    });

    it("never activates when the wallet disappears from the user's filtered list", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:ownership-loss-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const wallet = enrollWallet("pol_enroll_1");
      const { client } = mockServerClient({ lists: [[wallet], []] });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const localWallet = await service.getCurrentWallet(userId);
      await database.query(
        `INSERT INTO signer_grants
         (user_id, wallet_id, provider_policy_id, policy_hash, allowlisted_recipients,
          per_transfer_atomic6, rolling_total_atomic6, rolling_window_seconds, gas_ceiling, state)
         VALUES ($1, $2, 'pol_enroll_1', 'hash', '["0x1111111111111111111111111111111111111111"]'::jsonb,
                 '10000000', '50000000', 3600, '0.01', 'pending')`,
        [userId, localWallet.id],
      );

      const result = await service.completePermission(userId, localWallet.id);
      expect(result.verified).toBe(false);
      const rows = await database.query<{ state: string }>(
        "SELECT state FROM signer_grants WHERE wallet_id = $1",
        [localWallet.id],
      );
      expect(rows.rows[0]?.state).toBe("pending");
    });

    it("never reports a real Privy grant revoked without provider removal and read-back", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:revoke-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const wallet = enrollWallet("pol_enroll_1");
      const { client } = mockServerClient({ list: [wallet] });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const localWallet = await service.getCurrentWallet(userId);
      await database.query(
        `INSERT INTO signer_grants
         (user_id, wallet_id, provider_policy_id, provider_signer_id, policy_hash,
          allowlisted_recipients, per_transfer_atomic6, rolling_total_atomic6,
          rolling_window_seconds, gas_ceiling, state)
         VALUES ($1, $2, 'pol_enroll_1', 'auth-signer-1', 'hash',
                 '["0x1111111111111111111111111111111111111111"]'::jsonb,
                 '10000000', '50000000', 3600, '0.01', 'active')`,
        [userId, localWallet.id],
      );

      await expect(service.revokePermission(userId)).rejects.toBeInstanceOf(
        WalletUnavailableError,
      );
      const rows = await database.query<{ state: string }>(
        "SELECT state FROM signer_grants WHERE wallet_id = $1",
        [localWallet.id],
      );
      expect(rows.rows[0]?.state).toBe("revoking");
    });

    it("maps a provider failure during complete to unavailable and keeps the grant pending", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:complete-unavailable-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const wallet = enrollWallet("pol_enroll_1");
      const { client } = mockServerClient({
        lists: [[wallet], [wallet]],
        listStatuses: [200, 503],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const localWallet = await service.getCurrentWallet(userId);
      await database.query(
        `INSERT INTO signer_grants
           (user_id, wallet_id, provider_policy_id, policy_hash, allowlisted_recipients,
            per_transfer_atomic6, rolling_total_atomic6, rolling_window_seconds, gas_ceiling, state)
           VALUES ($1, $2, 'pol_enroll_1', 'hash', '["0x1111111111111111111111111111111111111111"]'::jsonb,
                   '10000000', '50000000', 3600, '0.01', 'pending')`,
        [userId, localWallet.id],
      );

      await expect(
        service.completePermission(userId, localWallet.id),
      ).rejects.toBeInstanceOf(WalletUnavailableError);
      const rows = await database.query<{ state: string }>(
        "SELECT state FROM signer_grants WHERE wallet_id = $1",
        [localWallet.id],
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

    it("authenticated prepare endpoint activates enrollment with the pending hourly limit surfaced", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:route-${randomUUID()}`;
      const wallet = enrollWallet("pol_route", did);
      const { client } = mockServerClient({
        list: [wallet],
        policyId: "pol_route_1",
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
        expect(prepare.json().data.policyId).toBe("pol_route_1");
        expect(prepare.json().data.aggregationReady).toBe(false);
        expect(JSON.stringify(prepare.json())).not.toContain(APP_SECRET);
      } finally {
        await app.close();
      }
    });

    it("rejects the legacy activation endpoint for an authenticated Privy user", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:legacy-activate-${randomUUID()}`;
      const { client } = mockServerClient({
        list: [enrollWallet("pol_legacy")],
      });
      const app = buildServer({ privyServer: client });
      try {
        const authorization = `Bearer ${await signToken(did, verifyPrivateKey)}`;
        const sync = await app.inject({
          method: "POST",
          url: "/v1/wallets/sync",
          headers: { authorization },
        });
        const userId = sync.json().data.userId as string;
        const activation = await app.inject({
          method: "POST",
          url: "/v1/wallets/current/permission",
          headers: { authorization },
          payload: {
            recipients: ["0x1111111111111111111111111111111111111111"],
          },
        });

        expect(activation.statusCode).toBe(503);
        expect(activation.json().error.code).toBe("WALLET_NO_DISPONIBLE");
        const rows = await database.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM signer_grants WHERE user_id = $1",
          [userId],
        );
        expect(rows.rows[0]?.count).toBe("0");
      } finally {
        await app.close();
      }
    });

    it("reports a legacy active row honestly with the pending hourly limit", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:legacy-active-${randomUUID()}`;
      const userId = await provisionUser(database, did);
      const { client } = mockServerClient({
        list: [enrollWallet("pol_legacy")],
      });
      const service = new EmbeddedWalletService(
        database,
        createPrivyWalletApiClient(process.env, {}),
        client,
        { keyQuorumId: "key-quorum-1" },
      );
      await service.syncWallet(userId);
      const wallet = await service.getCurrentWallet(userId);
      await database.query(
        `INSERT INTO signer_grants
           (user_id, wallet_id, provider_policy_id, provider_signer_id, policy_hash,
            allowlisted_recipients, per_transfer_atomic6, rolling_total_atomic6,
            rolling_window_seconds, gas_ceiling, state)
           VALUES ($1, $2, 'pol_legacy', 'signer-legacy', 'legacy-hash',
                   '["0x1111111111111111111111111111111111111111"]'::jsonb,
                   '10000000', '50000000', 3600, '0.01', 'active')`,
        [userId, wallet.id],
      );

      // USER DECISION (2026-09-09): the real state is reported honestly; the
      // unenforced hourly limit stays visible, never 'unavailable'.
      await expect(service.getPermission(userId)).resolves.toMatchObject({
        state: "active",
        grantId: expect.any(String),
        aggregationReady: false,
        aggregateOvershootCaveat: true,
      });
    });

    it("authenticated sync maps Privy discovery failures to 503", {
      timeout: 60_000,
    }, async () => {
      const did = `did:privy:sync-unavailable-${randomUUID()}`;
      const { client } = mockServerClient({ listStatuses: [503] });
      const app = buildServer({ privyServer: client });
      try {
        const response = await app.inject({
          method: "POST",
          url: "/v1/wallets/sync",
          headers: {
            authorization: `Bearer ${await signToken(did, verifyPrivateKey)}`,
          },
        });
        expect(response.statusCode).toBe(503);
        expect(response.json().error.code).toBe("WALLET_NO_DISPONIBLE");
        expect(response.json().error.message).not.toContain(
          "wallet_provider_unavailable",
        );
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
