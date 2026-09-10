import { describe, expect, it } from "vitest";

import { PRIVY_PROVIDER_CONFIG } from "./privy-config";

describe("Privy embedded wallet configuration", () => {
  it("creates an Ethereum embedded wallet on login for existing and new users", () => {
    expect(PRIVY_PROVIDER_CONFIG.embeddedWallets.ethereum.createOnLogin).toBe("all-users");
    expect(PRIVY_PROVIDER_CONFIG.loginMethods).toEqual(["email", "sms"]);
  });
});
