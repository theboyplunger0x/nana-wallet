import { useWallets } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { api, queryKeys } from "@/lib/api";

/**
 * Reconciles Privy's user-owned embedded wallet with Nana after the SDK has
 * finished loading wallets. Browser wallet fields are only a change signal;
 * ownership, wallet id and address are rediscovered by the authenticated API.
 */
export function PrivyWalletSync({ userId }: { userId: string }) {
  const { ready, wallets } = useWallets();
  const queryClient = useQueryClient();
  const lastAttemptRef = useRef<string | null>(null);
  const walletSignal = useMemo(
    () =>
      wallets
        .map((wallet) => `${wallet.walletClientType}:${wallet.address.toLowerCase()}`)
        .sort()
        .join("|"),
    [wallets],
  );

  useEffect(() => {
    if (!ready) return;
    const attempt = `${userId}:${walletSignal}`;
    if (lastAttemptRef.current === attempt) return;
    lastAttemptRef.current = attempt;

    let cancelled = false;
    void api
      .syncWallet()
      .then(async () => {
        if (cancelled) return;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.currentWallet(userId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.wallet(userId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.movements(userId) }),
        ]);
      })
      .catch(() => {
        // WalletLifecycle owns the user-visible error and manual retry. Keep
        // this login reconciliation quiet so an API outage does not break auth.
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient, ready, userId, walletSignal]);

  return null;
}
