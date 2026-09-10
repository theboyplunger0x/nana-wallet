import type { EnrollmentPolicyRule } from "./enrollment-policy.js";

/**
 * PEW-014: real Privy server-API HTTP client (contract-exact, injectable fetch).
 *
 * This is the trusted server-side boundary for owner-verified wallet sync and
 * user-authenticated signer enrollment. It is deliberately NOT the same object as
 * the fixture/live `PrivyWalletApiClient`: every request here reaches the actual
 * Privy HTTP API with `privy-app-id` + `Authorization: Basic(base64(appId:appSecret))`.
 *
 * Security rules:
 *  - The app secret is only ever used to build the Basic header; it is never
 *    logged and never appears in a thrown `PrivyServerError` message.
 *  - The fetch implementation is injectable so contract-exact tests can assert
 *    method/url/headers without any live call.
 *  - A non-2xx response surfaces a typed `PrivyServerError` carrying the HTTP
 *    status and (when present) the provider API code — never the secret.
 */

export type PrivyFetch = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type PrivyServerClientConfig = {
  appId: string;
  appSecret: string;
  baseUrl?: string;
  fetch?: PrivyFetch;
};

/** A single policy id (and optional contract shape) returned by the provider. */
export type PrivyPolicyRecord = {
  id: string;
  [key: string]: unknown;
};

export type PrivyWalletRecord = {
  id: string;
  address: string;
  owner?: string;
  chain_type?: string;
  /** Signers attached to the wallet; each entry may expose policy ids. */
  signers?: PrivyWalletSigner[];
  [key: string]: unknown;
};

export type PrivyWalletSigner = {
  id?: string;
  signer_id?: string;
  signerId?: string;
  policy_ids?: string[];
  policyIds?: string[];
  [key: string]: unknown;
};

export class PrivyServerError extends Error {
  public constructor(
    public readonly status: number,
    public readonly providerCode: string | null,
    message: string,
  ) {
    super(message);
    this.name = "PrivyServerError";
  }
}

/** Extracts policy id(s) from a signer object, tolerating snake/camel casing. */
function policyIdsOf(signer: PrivyWalletSigner): string[] {
  if (Array.isArray(signer.policy_ids)) return signer.policy_ids;
  if (Array.isArray(signer.policyIds)) return signer.policyIds;
  return [];
}

function signerIdOf(signer: PrivyWalletSigner): string | undefined {
  return signer.signer_id ?? signer.signerId ?? signer.id;
}

export class PrivyServerClient {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseUrl: string;
  private readonly doFetch: PrivyFetch;

  public constructor(config: PrivyServerClientConfig) {
    if (!config.appId)
      throw new Error("Privy server client requires PRIVY_APP_ID.");
    if (!config.appSecret)
      throw new Error("Privy server client requires PRIVY_APP_SECRET.");
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.baseUrl = (config.baseUrl ?? "https://api.privy.io/v1").replace(
      /\/$/u,
      "",
    );
    this.doFetch = config.fetch ?? ((url, init) => fetch(url, init));
  }

  private headers(): Record<string, string> {
    const basic = Buffer.from(`${this.appId}:${this.appSecret}`).toString(
      "base64",
    );
    return {
      "privy-app-id": this.appId,
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T | unknown> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: this.headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
    const response = await this.doFetch(url, init);
    if (!response.ok) {
      let code: string | null = null;
      try {
        const parsed = (await response.json()) as {
          error?: string;
          code?: string;
        };
        code = parsed.error ?? parsed.code ?? null;
      } catch {
        // Non-JSON error body: preserve only the status.
      }
      throw new PrivyServerError(
        response.status,
        code,
        `Privy API request failed (${response.status}).`,
      );
    }
    return response.json();
  }

  /**
   * GET /v1/wallets?owner=<privy_did> — server-side trusted owner filter.
   * Responses use { data: [...] }.
   */
  public async listWalletsByOwner(
    ownerDid: string,
  ): Promise<PrivyWalletRecord[]> {
    const parsed = (await this.request(
      "GET",
      `/wallets?owner=${encodeURIComponent(ownerDid)}`,
    )) as { data?: PrivyWalletRecord[] };
    return parsed.data ?? [];
  }

  /**
   * GET /v1/wallets/:id — single wallet readback used to prove owner + attached
   * signer policy before activation.
   */
  public async getWallet(walletId: string): Promise<PrivyWalletRecord> {
    const parsed = (await this.request(
      "GET",
      `/wallets/${encodeURIComponent(walletId)}`,
    )) as PrivyWalletRecord;
    if (!parsed || typeof parsed.id !== "string") {
      throw new PrivyServerError(
        404,
        null,
        "Wallet readback returned no wallet id.",
      );
    }
    return parsed;
  }

  /**
   * POST /v1/policies — creates a policy named `name` holding every rule.
   * Returns { id }.
   */
  public async createPolicy(
    name: string,
    rules: EnrollmentPolicyRule[],
  ): Promise<{ id: string }> {
    const parsed = (await this.request("POST", "/policies", {
      version: "1.0",
      name,
      chain_type: "ethereum",
      rules,
    })) as { id: string };
    if (!parsed?.id) {
      throw new PrivyServerError(
        500,
        null,
        "Policy creation returned no policy id.",
      );
    }
    return { id: parsed.id };
  }

  /** GET /v1/policies/:id — policy readback (complete-readback verification). */
  public async getPolicy(policyId: string): Promise<PrivyPolicyRecord> {
    const parsed = (await this.request(
      "GET",
      `/policies/${encodeURIComponent(policyId)}`,
    )) as PrivyPolicyRecord;
    if (!parsed || typeof parsed.id !== "string") {
      throw new PrivyServerError(
        404,
        null,
        "Policy readback returned no policy id.",
      );
    }
    return parsed;
  }

  /** Convenience accessors for readback inspection (tolerant of casing). */
  public static signerPolicyIds(signer: PrivyWalletSigner): string[] {
    return policyIdsOf(signer);
  }

  public static signerId(signer: PrivyWalletSigner): string | undefined {
    return signerIdOf(signer);
  }
}
