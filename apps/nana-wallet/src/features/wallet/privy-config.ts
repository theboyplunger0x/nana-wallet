import type { PrivyClientConfig } from "@privy-io/react-auth";

/**
 * Provision one user-owned Ethereum embedded wallet for both existing and new
 * Privy users. `all-users` is intentional: `users-without-wallets` would skip a
 * user who linked an external wallet but still needs Nana's embedded wallet.
 */
export const PRIVY_PROVIDER_CONFIG = {
  loginMethods: ["email", "sms"],
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
  },
} satisfies PrivyClientConfig;
