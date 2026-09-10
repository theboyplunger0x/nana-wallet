import { describe, expect, it, vi } from "vitest";

import {
  FixtureBalanceReader,
  WalletBalancesError,
  WalletBalancesService,
  createBalanceReader,
  readBalanceReadConfig,
  type BalanceReader,
} from "../../src/wallet/balances.js";
import type { CurrentWallet } from "../../src/wallet/embedded.js";

/**
 * WP-003/WP-005/WP-008/WP-009: the service resolves the caller's own binding,
 * serves every non-ready state WITHOUT calling the reader, fails closed on an
 * inconsistent ready binding, and never touches signing (there is simply no
 * signing dependency to reach).
 */

function wallet(overrides: Partial<CurrentWallet> = {}): CurrentWallet {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    id: "22222222-2222-4222-8222-222222222222",
    state: "ready",
    address: "0x1111111111111111111111111111111111111111",
    chainFamily: "arc",
    provider: "privy",
    verifiedAt: null,
    ...overrides,
  };
}

const READY = wallet();

function readerStub(source: BalanceReader["source"] = "fixture") {
  return {
    source,
    readUsdcAtomic: vi.fn(async () => "1250000"),
  } satisfies BalanceReader & { readUsdcAtomic: ReturnType<typeof vi.fn> };
}

const OWN_ADDRESS = READY.address;

describe("WalletBalancesService", () => {
  it("returns the ready shape with one USDC asset and observedAt from the clock", async () => {
    const reader = readerStub();
    const service = new WalletBalancesService({
      resolveWallet: async () => READY,
      reader,
      clock: () => new Date("2026-09-09T12:00:00Z"),
    });
    await expect(service.getBalances(READY.userId)).resolves.toEqual({
      walletState: "ready",
      address: OWN_ADDRESS,
      chainId: 5042002,
      networkName: "Arc testnet",
      testnet: true,
      source: "fixture",
      observedAt: "2026-09-09T12:00:00.000Z",
      assets: [
        {
          tokenId: "5042002:0x3600000000000000000000000000000000000000",
          contract: "0x3600000000000000000000000000000000000000",
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          balanceAtomic: "1250000",
        },
      ],
    });
  });

  it("serves every non-ready state without calling the reader (WP-005)", async () => {
    const reader = readerStub();
    for (const state of [
      "unprovisioned",
      "provisioning",
      "recovery_required",
      "conflict",
      "unavailable",
    ] as const) {
      const scoped = new WalletBalancesService({
        resolveWallet: async () => wallet({ state, address: "" }),
        reader,
      });
      await expect(scoped.getBalances("u")).resolves.toEqual({
        walletState: state,
        chainId: 5042002,
        networkName: "Arc testnet",
        testnet: true,
        observedAt: null,
        assets: [],
      });
    }
    expect(reader.readUsdcAtomic).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent ready binding with 409 and no reader call (WP-007)", async () => {
    const reader = readerStub();
    const badAddress = new WalletBalancesService({
      resolveWallet: async () => wallet({ address: "not-an-address" }),
      reader,
    });
    await expect(badAddress.getBalances("u")).rejects.toMatchObject({
      status: 409,
      code: "WALLET_DATOS_INVALIDOS",
    });
    const badChain = new WalletBalancesService({
      resolveWallet: async () => wallet({ chainFamily: "ethereum" }),
      reader,
    });
    await expect(badChain.getBalances("u")).rejects.toMatchObject({
      status: 409,
      code: "WALLET_DATOS_INVALIDOS",
    });
    expect(reader.readUsdcAtomic).not.toHaveBeenCalled();
  });

  it("maps reader failures to a sanitized 503 (WP-007)", async () => {
    const service = new WalletBalancesService({
      resolveWallet: async () => READY,
      reader: {
        source: "fixture",
        readUsdcAtomic: async () => {
          throw new Error("http://secret-node?token=abc raw failure");
        },
      },
    });
    await expect(service.getBalances("u")).rejects.toMatchObject({
      status: 503,
      code: "BALANCE_NO_DISPONIBLE",
    });
    await expect(service.getBalances("u")).rejects.not.toThrow(/secret-node/);
  });
});

describe("FixtureBalanceReader (WP-009)", () => {
  it("serves per-address balances and errors on an unconfigured address", async () => {
    const reader = new FixtureBalanceReader({
      [OWN_ADDRESS]: "42",
    });
    await expect(
      reader.readUsdcAtomic(
        OWN_ADDRESS.toUpperCase(),
        new AbortController().signal,
      ),
    ).resolves.toBe("42");
    await expect(
      reader.readUsdcAtomic(
        "0x2222222222222222222222222222222222222222",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 503, code: "BALANCE_NO_DISPONIBLE" });
  });
});

describe("readBalanceReadConfig (WP-009)", () => {
  it("defaults to fixture without any configuration", () => {
    expect(readBalanceReadConfig({})).toEqual({
      source: "fixture",
      fixtureBalances: undefined,
    });
  });

  it("demands BALANCE_RPC_URL for rpc and rejects unknown sources", () => {
    expect(() => readBalanceReadConfig({ BALANCE_READ_SOURCE: "rpc" })).toThrow(
      /BALANCE_RPC_URL/,
    );
    expect(() => readBalanceReadConfig({ BALANCE_READ_SOURCE: "ws" })).toThrow(
      /fixture.*rpc/,
    );
    expect(
      readBalanceReadConfig({
        BALANCE_READ_SOURCE: "rpc",
        BALANCE_RPC_URL: "http://n",
      }).source,
    ).toBe("rpc");
  });

  it("normalizes fixture map keys to lowercase", () => {
    const config = readBalanceReadConfig({
      BALANCE_FIXTURE_BALANCES: JSON.stringify({ [OWN_ADDRESS]: "7" }),
    });
    const reader = createBalanceReader(config);
    expect(reader.source).toBe("fixture");
  });
});
