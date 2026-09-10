import { describe, expect, it, vi } from "vitest";
import {
  PrivyServerClient,
  PrivyServerError,
  type PrivyFetch,
} from "../../src/wallet/privy-server-client.js";

const APP_ID = "client-id";
const APP_SECRET = "app-secret-value";
const BASIC = `Basic ${Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64")}`;
const BASE = "https://api.privy.io/v1";

/** Builds a mock Privy response object usable by the client's fetch contract. */
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

describe("PrivyServerClient (contract-exact HTTP boundary)", () => {
  it("listWalletsByOwner GETs /wallets?owner=... with privy-app-id + Basic headers", async () => {
    const fetchMock = vi.fn<PrivyFetch>(async () =>
      mockResponse({
        data: [
          {
            id: "wallet-1",
            address: "0x0000000000000000000000000000000000000001",
            owner: "did:privy:user-1",
            chain_type: "ethereum",
          },
        ],
      }),
    );
    const client = new PrivyServerClient({
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: fetchMock,
    });

    const wallets = await client.listWalletsByOwner("did:privy:user-1");
    expect(wallets).toHaveLength(1);
    expect(wallets[0].id).toBe("wallet-1");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${BASE}/wallets?owner=did%3Aprivy%3Auser-1`);
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers["privy-app-id"]).toBe(APP_ID);
    expect(headers.Authorization).toBe(BASIC);
  });

  it("getWallet GETs /wallets/:id and returns the record", async () => {
    const fetchMock = vi.fn<PrivyFetch>(async () =>
      mockResponse({
        id: "wallet-9",
        address: "0x0000000000000000000000000000000000000009",
        owner: "did:privy:user-1",
        signers: [{ signer_id: "signer-1", policy_ids: ["pol_abc"] }],
      }),
    );
    const client = new PrivyServerClient({
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: fetchMock,
    });

    const wallet = await client.getWallet("wallet-9");
    expect(wallet.id).toBe("wallet-9");
    expect(wallet.owner).toBe("did:privy:user-1");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${BASE}/wallets/wallet-9`);
    expect(init.method).toBe("GET");
  });

  it("createPolicy POSTs /policies with version/chain_type/rules and returns {id}", async () => {
    const fetchMock = vi.fn<PrivyFetch>(async () =>
      mockResponse({ id: "pol_new" }),
    );
    const client = new PrivyServerClient({
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: fetchMock,
    });
    const rules = [
      {
        field_source: "ethereum_transaction" as const,
        field: "chain_id",
        operator: "eq",
        value: 5042002,
      },
    ];

    const { id } = await client.createPolicy("my-policy", rules);
    expect(id).toBe("pol_new");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${BASE}/policies`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["privy-app-id"]).toBe(APP_ID);
    expect(headers.Authorization).toBe(BASIC);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      version: "1.0",
      name: "my-policy",
      chain_type: "ethereum",
    });
    expect(Array.isArray(body.rules)).toBe(true);
    expect(body.rules).toHaveLength(1);
  });

  it("getPolicy GETs /policies/:id and returns the record", async () => {
    const fetchMock = vi.fn<PrivyFetch>(async () =>
      mockResponse({ id: "pol_abc", version: "1.0", rules: [] }),
    );
    const client = new PrivyServerClient({
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: fetchMock,
    });
    const policy = await client.getPolicy("pol_abc");
    expect(policy.id).toBe("pol_abc");
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${BASE}/policies/pol_abc`);
  });

  it("surfaces a typed PrivyServerError with status + provider code but NEVER the secret", async () => {
    const fetchMock = vi.fn<PrivyFetch>(async () =>
      mockResponse(
        { error: "policy_conflict", message: "already exists" },
        409,
      ),
    );
    const client = new PrivyServerClient({
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: fetchMock,
    });

    const error = await client.createPolicy("p", []).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrivyServerError);
    const typed = error as PrivyServerError;
    expect(typed.status).toBe(409);
    expect(typed.providerCode).toBe("policy_conflict");
    expect(typed.message).not.toContain(APP_SECRET);
    expect(typed.message).not.toContain(APP_ID);
  });

  it("never throws with the secret when the constructor receives a short secret", async () => {
    const fetchMock = vi.fn<PrivyFetch>(async () => mockResponse({}, 500));
    const client = new PrivyServerClient({
      appId: APP_ID,
      appSecret: "short-secret",
      fetch: fetchMock,
    });
    const error = await client.getWallet("wallet-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PrivyServerError);
    expect((error as PrivyServerError).message).not.toContain("short-secret");
  });
});
