import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  syncWallet: vi.fn(),
  useWallets: vi.fn(),
}));

vi.mock("@privy-io/react-auth", () => ({
  useWallets: mocks.useWallets,
}));

vi.mock("@/lib/api", () => ({
  api: { syncWallet: mocks.syncWallet },
  queryKeys: {
    currentWallet: (userId: string) => ["wallet", "current", userId],
    wallet: (userId: string) => ["wallet", "summary", userId],
    movements: (userId: string) => ["wallet", "movements", userId],
  },
}));

import { PrivyWalletSync } from "./PrivyWalletSync";

function Wrapper({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("PrivyWalletSync", () => {
  beforeEach(() => {
    mocks.syncWallet.mockReset().mockResolvedValue({ state: "ready" });
    mocks.useWallets.mockReset();
  });

  it("waits for Privy wallet readiness and never sends browser wallet fields", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    mocks.useWallets.mockReturnValue({
      ready: false,
      wallets: [
        { walletClientType: "privy", address: "0x1111111111111111111111111111111111111111" },
      ],
    });

    const view = render(
      <Wrapper client={queryClient}>
        <PrivyWalletSync userId="user-1" />
      </Wrapper>,
    );
    expect(mocks.syncWallet).not.toHaveBeenCalled();

    mocks.useWallets.mockReturnValue({
      ready: true,
      wallets: [
        { walletClientType: "privy", address: "0x1111111111111111111111111111111111111111" },
      ],
    });
    view.rerender(
      <Wrapper client={queryClient}>
        <PrivyWalletSync userId="user-1" />
      </Wrapper>,
    );

    await waitFor(() => expect(mocks.syncWallet).toHaveBeenCalledTimes(1));
    expect(mocks.syncWallet).toHaveBeenCalledWith();
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["wallet", "summary", "user-1"],
    });
  });
});
