import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../src/db/client.js";
import type { PrivyWalletApiClient } from "../../src/wallet/privy-client.js";
import { TransferRejectedError, WalletTransferPipeline } from "../../src/wallet/transfer-pipeline.js";

describe("fixture pipeline live transport boundary", () => {
  it("rejects a live client before any database claim or provider signature", () => {
    const withUserTransaction = vi.fn();
    const signTransaction = vi.fn();
    const database = { withUserTransaction } as unknown as DatabaseClient;
    const client = { mode: "live", signTransaction } as unknown as PrivyWalletApiClient;
    expect(() => new WalletTransferPipeline(database, client)).toThrow(TransferRejectedError);
    expect(withUserTransaction).not.toHaveBeenCalled();
    expect(signTransaction).not.toHaveBeenCalled();
  });
});
