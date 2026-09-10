import type { DatabaseClient, Queryable } from "../db/client.js";
import { isValidEvmAddress } from "../memory/address.js";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ERC20,
  DEFAULT_GAS_CEILING,
  DEFAULT_ROLLING_WINDOW_SECONDS,
  PER_TRANSFER_USDC,
  ROLLING_TOTAL_USDC,
  type EffectiveProviderPolicy,
  type PrivyWalletApiClient,
  type ProviderWallet,
} from "./privy-client.js";
import {
  AGGREGATION_BLOCK_REASON,
  ENROLLMENT_PER_TRANSFER_USDC,
  ENROLLMENT_ROLLING_TOTAL_USDC,
  ENROLLMENT_WINDOW_SECONDS,
  buildEnrollmentPolicyRules,
} from "./enrollment-policy.js";
import {
  PrivyServerClient,
  PrivyServerError,
  type PrivyWalletRecord,
} from "./privy-server-client.js";
import type {
  PermissionState,
  WalletReadinessState,
} from "../contracts/http.js";

export const USDC_DECIMALS = 6n;

/** Converts a whole-USDC amount to its atomic6 integer string (10 USDC -> '10000000'). */
export function usdcToAtomic6(usdc: string): string {
  if (!/^\d+$/u.test(usdc))
    throw new GrantValidationError(
      "USDC amount must be a non-negative integer string.",
    );
  return (BigInt(usdc) * 10n ** USDC_DECIMALS).toString();
}

export function atomic6ToUsdc(atomic6: string): string {
  if (!/^\d+$/u.test(atomic6))
    throw new GrantValidationError(
      "atomic6 amount must be a non-negative integer string.",
    );
  return (BigInt(atomic6) / 10n ** USDC_DECIMALS).toString();
}

export class WalletError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}
export class WalletNotFoundError extends WalletError {
  public constructor(message = "Wallet not found.") {
    super("not_found", message);
    this.name = "WalletNotFoundError";
  }
}
export class GrantNotFoundError extends WalletError {
  public constructor(message = "Grant not found.") {
    super("grant_not_found", message);
    this.name = "GrantNotFoundError";
  }
}
export class GrantValidationError extends WalletError {
  public constructor(message: string) {
    super("grant_invalid", message);
    this.name = "GrantValidationError";
  }
}
export class GrantNotActiveError extends WalletError {
  public constructor(message = "Grant is not active.") {
    super("grant_not_active", message);
    this.name = "GrantNotActiveError";
  }
}
export class WalletOwnershipError extends WalletError {
  public constructor(message = "Wallet ownership could not be verified.") {
    super("wallet_ownership", message);
    this.name = "WalletOwnershipError";
  }
}
export class WalletUnavailableError extends WalletError {
  public constructor(message = "Wallet provider is unavailable.") {
    super("wallet_unavailable", message);
    this.name = "WalletUnavailableError";
  }
}
export class WalletConflictError extends WalletError {
  public constructor(
    message = "Multiple eligible wallets; selection is blocked.",
  ) {
    super("wallet_conflict", message);
    this.name = "WalletConflictError";
  }
}

export type GrantInput = {
  recipients: string[];
  perTransferAtomic6: string;
  rollingTotalAtomic6: string;
  rollingWindowSeconds: number;
  gasCeiling: string;
};

/** PEW-007: validates a grant envelope before it can bind a signing permission. */
export function validateGrantInput(input: GrantInput): void {
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    throw new GrantValidationError("At least one recipient is required.");
  }
  for (const recipient of input.recipients) {
    if (!isValidEvmAddress(recipient))
      throw new GrantValidationError(`Invalid recipient address: ${recipient}`);
  }
  if (!/^\d+$/u.test(input.perTransferAtomic6)) {
    throw new GrantValidationError(
      "Per-transfer limit must be a non-negative integer string.",
    );
  }
  if (!/^\d+$/u.test(input.rollingTotalAtomic6)) {
    throw new GrantValidationError(
      "Rolling total limit must be a non-negative integer string.",
    );
  }
  const perTransfer = BigInt(input.perTransferAtomic6);
  const rollingTotal = BigInt(input.rollingTotalAtomic6);
  if (perTransfer <= 0n)
    throw new GrantValidationError("Per-transfer limit must be positive.");
  if (rollingTotal <= 0n)
    throw new GrantValidationError("Rolling total limit must be positive.");
  if (input.rollingWindowSeconds !== DEFAULT_ROLLING_WINDOW_SECONDS) {
    throw new GrantValidationError("Rolling window must be 3600 seconds.");
  }
  if (!input.gasCeiling || input.gasCeiling.trim() === "") {
    throw new GrantValidationError("Gas ceiling is required.");
  }
}

/** The r3 pinned grant defaults: 10 USDC/transfer, 50 USDC/rolling hour, 3600s window. */
export function defaultGrantInput(
  recipients: string[],
  gasCeiling = DEFAULT_GAS_CEILING,
): GrantInput {
  return {
    recipients,
    perTransferAtomic6: usdcToAtomic6(PER_TRANSFER_USDC),
    rollingTotalAtomic6: usdcToAtomic6(ROLLING_TOTAL_USDC),
    rollingWindowSeconds: DEFAULT_ROLLING_WINDOW_SECONDS,
    gasCeiling,
  };
}

export type CurrentWallet = {
  userId: string;
  id: string;
  state: WalletReadinessState;
  address: string;
  chainFamily: string;
  provider: string;
  verifiedAt: string | null;
};

export type WalletSyncResult = {
  userId: string;
  state: WalletReadinessState;
  address: string;
  created: boolean;
};

export type PermissionSummary = {
  userId: string;
  grantId: string | null;
  state: PermissionState;
  perTransferUsdc: string;
  rollingTotalUsdc: string;
  rollingWindowSeconds: number;
  gasCeiling: string;
  recipients: string[];
  aggregateOvershootCaveat: boolean;
  // PEW-014: rolling-window aggregation remains provider-unproven; surfaced as
  // an explicit payment block instead of being silently hidden.
  aggregationReady: boolean;
  aggregateBlockReason: string;
};

/** PEW-014: the client-facing enrollment preparation outcome. */
export type EnrollmentPreparation = {
  walletId: string;
  walletAddress: string;
  policyId: string;
  quorumId: string;
  perTransferUsdc: string;
  rollingTotalUsdc: string;
  windowSeconds: number;
  aggregationReady: false;
  aggregateBlockReason: string;
};

/** PEW-014: the honest read-back verification outcome (never a client success flag). */
export type EnrollmentVerification = {
  verified: boolean;
  state: PermissionState;
  permission: PermissionSummary | null;
  observed: {
    walletOwnerMatches: boolean;
    policyAttached: boolean;
    observedPolicyIds: string[];
    observedSignerIds: string[];
  };
};

export type RevokeResult = {
  userId: string;
  state: PermissionState;
  remote: "revoked" | "unavailable";
};

type WalletRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_wallet_id: string;
  chain_family: string;
  address: string;
  state: string;
  verified_at: string | Date | null;
};

type GrantRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  provider_policy_id: string | null;
  provider_signer_id: string | null;
  policy_hash: string;
  allowlisted_recipients: string[];
  per_transfer_atomic6: string;
  rolling_total_atomic6: string;
  rolling_window_seconds: number;
  gas_ceiling: string;
  state: string;
};

const WALLET_COLUMNS =
  "id, user_id, provider, provider_wallet_id, chain_family, address, state, verified_at";
const GRANT_COLUMNS =
  "id, user_id, wallet_id, provider_policy_id, provider_signer_id, policy_hash, allowlisted_recipients, per_transfer_atomic6, rolling_total_atomic6, rolling_window_seconds, gas_ceiling, state";

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function mapWallet(row: WalletRow): CurrentWallet {
  return {
    userId: row.user_id,
    id: row.id,
    state: row.state as WalletReadinessState,
    address: row.state === "ready" ? row.address : "",
    chainFamily: row.chain_family,
    provider: row.provider,
    verifiedAt: iso(row.verified_at),
  };
}

/** Adapts a trusted server wallet record to the internal ProviderWallet shape. */
function liveRecordToProviderWallet(record: PrivyWalletRecord): ProviderWallet {
  return {
    providerWalletId: record.id,
    address: record.address,
    chainFamily: "arc",
    state: "ready",
  };
}

/**
 * PEW-001..005, 007, 013: user-owned embedded wallet binding and signer grant
 * service. Every DB access is RLS-scoped through the resolved internal UUID; the
 * Privy client provides the trusted ownership / policy / signing boundary.
 */
export class EmbeddedWalletService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly privy: PrivyWalletApiClient,
    private readonly privyServer?: PrivyServerClient,
    private readonly enrollment?: { keyQuorumId: string },
  ) {}

  private usesUnverifiedLivePolicy(): boolean {
    return Boolean(this.privyServer) || this.privy.mode === "live";
  }

  private async currentWalletRow(
    userId: string,
    client: Queryable,
  ): Promise<WalletRow | undefined> {
    const result = await client.query<WalletRow>(
      `SELECT ${WALLET_COLUMNS} FROM user_wallets
       WHERE user_id = $1 AND chain_family = 'arc'
       ORDER BY (state = 'ready') DESC, updated_at DESC
       LIMIT 1`,
      [userId],
    );
    return result.rows[0];
  }

  /** PEW-005: identity is separate from wallet readiness. */
  public async getCurrentWallet(userId: string): Promise<CurrentWallet> {
    const row = await this.database.withUserTransaction(userId, (client) =>
      this.currentWalletRow(userId, client),
    );
    if (!row) {
      return {
        userId,
        id: "",
        state: "unprovisioned",
        address: "",
        chainFamily: "arc",
        provider: "privy",
        verifiedAt: null,
      };
    }
    return mapWallet(row);
  }

  /**
   * PEW-002/003: idempotent provisioning. Reconciles existing verified Privy
   * wallets before creating another; never binds a client-supplied address.
   */
  public async syncWallet(
    userId: string,
    opts: { claimedAddress?: string } = {},
  ): Promise<WalletSyncResult> {
    // PEW-014: with a trusted server client configured, sync uses the
    // owner-filtered server list instead of the fixture ownership proof.
    if (this.privyServer) return this.syncWalletLive(userId, opts);
    return this.database.withUserTransaction(userId, async (client) => {
      await this.lockWalletSync(client, userId);
      const providerWallets = await this.privy.listWallets(userId);
      const owned: ProviderWallet[] = [];
      for (const wallet of providerWallets) {
        const proof = await this.privy.verifyOwnership(userId, {
          address: wallet.address,
          providerWalletId: wallet.providerWalletId,
        });
        if (proof.ownerVerified) owned.push(wallet);
      }

      if (opts.claimedAddress) {
        const matchesOwned = owned.some(
          (wallet) => wallet.address === opts.claimedAddress,
        );
        if (!matchesOwned)
          throw new WalletOwnershipError(
            "Client-supplied address does not match a verified owned wallet.",
          );
      }

      const eligible = owned.filter(
        (wallet) => wallet.chainFamily === "arc" && wallet.state === "ready",
      );
      let created: { created: boolean; address: string };
      if (eligible.length > 1) {
        await this.reconcileWalletRows(client, userId, owned, "conflict");
        created = { created: false, address: eligible[0].address };
      } else if (eligible.length === 1) {
        created = await this.upsertReadyWallet(client, userId, eligible[0]);
      } else if (owned.length > 0) {
        await this.reconcileWalletRows(client, userId, owned, "unavailable");
        created = { created: false, address: owned[0].address };
      } else {
        created = { created: false, address: "" };
      }

      const row = await this.currentWalletRow(userId, client);
      return {
        userId,
        state: (row?.state ??
          (eligible.length > 1
            ? "conflict"
            : "unprovisioned")) as WalletReadinessState,
        address: row?.state === "ready" ? row.address : "",
        created: created.created,
      };
    });
  }

  /**
   * PEW-014: owner-verified sync path used when a real Privy server client is
   * configured. Privy's authenticated `user_id` filter is the ownership proof;
   * `owner_id` is a key-quorum id, not the user's DID. We never create a wallet
   * server-side or bind a browser-provided wallet identity.
   */
  private async syncWalletLive(
    userId: string,
    opts: { claimedAddress?: string } = {},
  ): Promise<WalletSyncResult> {
    const outcome = await this.database.withUserTransaction(
      userId,
      async (client) => {
        // Serialize discovery and reconciliation across every app instance. The
        // provider request is bounded by PrivyServerClient's timeout, so an older
        // response cannot commit after a newer sync for the same user.
        await this.lockWalletSync(client, userId);
        const identity = await client.query<{ privy_did: string }>(
          "SELECT privy_did FROM users WHERE id = $1",
          [userId],
        );
        const privyDid = identity.rows[0]?.privy_did;
        if (!privyDid)
          throw new WalletOwnershipError(
            "User identity is not provisioned; cannot verify wallet ownership.",
          );

        let records: PrivyWalletRecord[];
        try {
          records = await this.privyServer!.listWalletsForUser(privyDid);
        } catch {
          await this.demoteCurrentWallets(client, userId, "unavailable");
          return { kind: "unavailable" as const };
        }
        const owned = records
          .filter(
            (record) =>
              record.chain_type === "ethereum" &&
              isValidEvmAddress(record.address),
          )
          .map(liveRecordToProviderWallet)
          .filter((wallet) => wallet.address.length > 0);

        if (opts.claimedAddress) {
          const matchesOwned = owned.some(
            (wallet) =>
              wallet.address.toLowerCase() ===
              opts.claimedAddress?.toLowerCase(),
          );
          if (!matchesOwned)
            throw new WalletOwnershipError(
              "Client-supplied address does not match a verified owned wallet.",
            );
        }

        let created: { created: boolean; address: string };
        if (owned.length > 1) {
          await this.demoteCurrentWallets(client, userId, "conflict");
          await this.reconcileWalletRows(client, userId, owned, "conflict");
          created = { created: false, address: owned[0].address };
        } else if (owned.length === 1) {
          // Release the one-ready-per-user/chain slot before a newly discovered
          // wallet is inserted. This also prevents a stale local selection from
          // surviving when Privy changes the wallet attributed to the user.
          await this.demoteCurrentWallets(client, userId, "unavailable");
          created = await this.upsertReadyWallet(client, userId, owned[0]);
        } else {
          // An empty trusted result revokes the evidence behind any cached ready
          // binding. Keep the row for auditability while failing readiness closed.
          await this.demoteCurrentWallets(client, userId, "unavailable");
          created = { created: false, address: "" };
        }

        const row = await this.currentWalletRow(userId, client);
        return {
          kind: "success" as const,
          result: {
            userId,
            state: (row?.state ??
              (owned.length > 1
                ? "conflict"
                : "unprovisioned")) as WalletReadinessState,
            address: row?.state === "ready" ? row.address : "",
            created: created.created,
          },
        };
      },
    );

    if (outcome.kind === "unavailable")
      throw new WalletUnavailableError(
        "Privy could not verify the user's wallet.",
      );
    return outcome.result;
  }

  private async lockWalletSync(
    client: Queryable,
    userId: string,
  ): Promise<void> {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`nana-wallet-sync:${userId}`],
    );
  }

  private async demoteCurrentWallets(
    client: Queryable,
    userId: string,
    state: "conflict" | "unavailable",
  ): Promise<void> {
    await client.query(
      `UPDATE user_wallets
       SET state = $2, verified_at = now(), updated_at = now()
       WHERE user_id = $1 AND chain_family = 'arc'`,
      [userId, state],
    );
  }

  private async reconcileWalletRows(
    client: Queryable,
    userId: string,
    wallets: ProviderWallet[],
    state: "conflict" | "unavailable",
  ): Promise<void> {
    for (const wallet of wallets) {
      await client.query(
        `INSERT INTO user_wallets (user_id, provider, provider_wallet_id, chain_family, address, state, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (provider_wallet_id) DO UPDATE SET
           address = EXCLUDED.address, state = EXCLUDED.state, verified_at = EXCLUDED.verified_at, updated_at = now()`,
        [
          userId,
          "privy",
          wallet.providerWalletId,
          wallet.chainFamily,
          wallet.address,
          state,
        ],
      );
    }
  }

  private async upsertReadyWallet(
    client: Queryable,
    userId: string,
    wallet: ProviderWallet,
  ): Promise<{ created: boolean; address: string }> {
    const result = await client.query<{ id: string; inserted: boolean }>(
      `INSERT INTO user_wallets (user_id, provider, provider_wallet_id, chain_family, address, state, verified_at)
       VALUES ($1, $2, $3, $4, $5, 'ready', now())
       ON CONFLICT (provider_wallet_id) DO UPDATE SET
         chain_family = EXCLUDED.chain_family,
         address = EXCLUDED.address,
         state = 'ready',
         verified_at = EXCLUDED.verified_at,
         updated_at = now()
       RETURNING id, (xmax = 0) AS inserted`,
      [
        userId,
        "privy",
        wallet.providerWalletId,
        wallet.chainFamily,
        wallet.address,
      ],
    );
    return {
      created: Boolean(result.rows[0]?.inserted),
      address: wallet.address,
    };
  }

  /** PEW-007/013: create a signer grant, reading back the effective policy before 'active'. */
  public async createGrant(
    userId: string,
    walletId: string,
    input: GrantInput,
  ): Promise<PermissionSummary> {
    if (this.usesUnverifiedLivePolicy()) {
      throw new WalletUnavailableError(
        "Privy permission activation requires verified user enrollment and policy read-back.",
      );
    }
    validateGrantInput(input);
    const grant = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const wallet = await client.query<WalletRow>(
          `SELECT ${WALLET_COLUMNS} FROM user_wallets WHERE id = $1 AND user_id = $2 AND state = 'ready'`,
          [walletId, userId],
        );
        if (!wallet.rows[0])
          throw new WalletNotFoundError("No ready wallet for this grant.");
        const inserted = await client.query<GrantRow>(
          `INSERT INTO signer_grants
           (user_id, wallet_id, policy_hash, allowlisted_recipients, per_transfer_atomic6, rolling_total_atomic6, rolling_window_seconds, gas_ceiling, state)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, 'pending')
         RETURNING ${GRANT_COLUMNS}`,
          [
            userId,
            walletId,
            deterministicPolicyHash(input),
            JSON.stringify(input.recipients),
            input.perTransferAtomic6,
            input.rollingTotalAtomic6,
            input.rollingWindowSeconds,
            input.gasCeiling,
          ],
        );
        return inserted.rows[0]!;
      },
    );

    // Read back the effective provider policy before activation (PEW-013). The
    // fixture read-back is deterministic; the live client fails closed.
    const effective: EffectiveProviderPolicy =
      await this.privy.readEffectivePolicy(walletId);
    const active = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const updated = await client.query<GrantRow>(
          `UPDATE signer_grants
         SET policy_hash = $3, provider_policy_id = $4, provider_signer_id = $5, state = 'active', updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING ${GRANT_COLUMNS}`,
          [
            grant.id,
            userId,
            effective.policyHash,
            effective.policyId,
            effective.signerId,
          ],
        );
        return updated.rows[0]!;
      },
    );
    return mapGrantSummary(userId, active);
  }

  /**
   * PEW-013: explicit permission activation. This endpoint is the SERVER side of
   * the enrollment flow: the client only requests activation; the backend reads
   * back the effective provider signer/policy before marking the grant active,
   * so the client can never assert enrollment succeeded. Fixture mode performs
   * the deterministic read-back; the live client fails closed without
   * credentials (signing stays disabled until WU-E1 proves the policy).
   */
  public async activatePermission(
    userId: string,
    recipients: string[],
  ): Promise<PermissionSummary> {
    const wallet = await this.getCurrentWallet(userId);
    if (wallet.state !== "ready") {
      throw new WalletNotFoundError(
        `Wallet is not ready (state: ${wallet.state}).`,
      );
    }
    if (this.usesUnverifiedLivePolicy()) {
      throw new WalletUnavailableError(
        "Privy permission activation requires verified user enrollment and policy read-back.",
      );
    }
    return this.createGrant(userId, wallet.id, defaultGrantInput(recipients));
  }

  /**
   * PEW-014: user-authenticated signer enrollment — prepare step. The backend
   * creates (or reuses) a policy holding the pinned envelope and persists a
   * `pending` grant before the browser adds the signer. The client can never
   * assert enrollment succeeded: only completePermission, backed by a real
   * read-back, can move the grant to `active`.
   */
  public async preparePermission(
    userId: string,
    recipients: string[],
  ): Promise<EnrollmentPreparation> {
    const wallet = await this.getCurrentWallet(userId);
    if (wallet.state !== "ready") {
      throw new WalletNotFoundError(
        `Wallet is not ready (state: ${wallet.state}).`,
      );
    }
    if (!this.enrollment?.keyQuorumId) {
      // 503 readiness-blocked when the authorization key quorum is not configured.
      throw new WalletUnavailableError(
        "Signer enrollment is disabled: no authorization key quorum is configured.",
      );
    }
    if (!this.privyServer) {
      throw new WalletUnavailableError(
        "Signer enrollment requires a configured Privy server client.",
      );
    }

    // USER DECISION (2026-09-09): enrollment is enabled with the provable
    // per-transfer policy (chain 5042002 + USDC contract + transfer <= 10 USDC
    // + recipient allowlist + gas ceiling). The rolling 50 USDC/3600 s
    // aggregate is NOT in the policy and stays a visible pending feature
    // (aggregationReady:false) until the provider proves wallet-identity
    // grouping. The complete-readback still proves ownership + exact policy.
    const input = defaultGrantInput(recipients);
    validateGrantInput(input);

    // Reuse an existing pending grant's immutable policy id instead of
    // recreating a policy on every retry (idempotent prepare).
    const existing = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const result = await client.query<GrantRow>(
          `SELECT ${GRANT_COLUMNS} FROM signer_grants
               WHERE user_id = $1 AND wallet_id = $2 AND state = 'pending'
               ORDER BY updated_at DESC LIMIT 1`,
          [userId, wallet.id],
        );
        return result.rows[0];
      },
    );

    let policyId: string;
    if (existing?.provider_policy_id) {
      policyId = existing.provider_policy_id;
    } else {
      const created = await this.privyServer.createPolicy(
        `nana-signer-grant-${wallet.address}`,
        buildEnrollmentPolicyRules({ recipients }),
      );
      policyId = created.id;
      await this.database.withUserTransaction(userId, async (client) => {
        await client.query(
          `INSERT INTO signer_grants
               (user_id, wallet_id, provider_policy_id, policy_hash, allowlisted_recipients, per_transfer_atomic6, rolling_total_atomic6, rolling_window_seconds, gas_ceiling, state)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, 'pending')`,
          [
            userId,
            wallet.id,
            policyId,
            deterministicPolicyHash(input),
            JSON.stringify(input.recipients),
            input.perTransferAtomic6,
            input.rollingTotalAtomic6,
            input.rollingWindowSeconds,
            input.gasCeiling,
          ],
        );
      });
    }

    return {
      walletId: wallet.id,
      walletAddress: wallet.address,
      policyId,
      quorumId: this.enrollment.keyQuorumId,
      perTransferUsdc: ENROLLMENT_PER_TRANSFER_USDC,
      rollingTotalUsdc: ENROLLMENT_ROLLING_TOTAL_USDC,
      windowSeconds: ENROLLMENT_WINDOW_SECONDS,
      aggregationReady: false,
      aggregateBlockReason: AGGREGATION_BLOCK_REASON,
    };
  }

  /**
   * PEW-014: signer enrollment — complete step. The backing read-back must
   * prove BOTH that the wallet appears in Privy's trusted `user_id`-filtered
   * result and that its additional signer carries the exactly-stored override
   * policy id. A client success flag / optimistic state can NEVER activate.
   */
  public async completePermission(
    userId: string,
    walletId: string,
  ): Promise<EnrollmentVerification> {
    if (!this.privyServer) {
      throw new WalletUnavailableError(
        "Signer enrollment read-back requires a configured Privy server client.",
      );
    }
    // `walletId` is the user_wallets.id returned by prepare; the pending grant
    // is looked up by that wallet so only the caller's own pending grant is
    // read back (RLS-scoped to the resolved internal UUID).
    const grant = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const result = await client.query<GrantRow>(
          `SELECT ${GRANT_COLUMNS} FROM signer_grants
               WHERE wallet_id = $1 AND user_id = $2 AND state = 'pending'
               ORDER BY updated_at DESC LIMIT 1`,
          [walletId, userId],
        );
        return result.rows[0];
      },
    );
    if (!grant) throw new GrantNotFoundError();

    const walletRow = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const result = await client.query<WalletRow>(
          `SELECT ${WALLET_COLUMNS} FROM user_wallets WHERE id = $1 AND user_id = $2`,
          [walletId, userId],
        );
        return result.rows[0];
      },
    );
    if (!walletRow) throw new WalletNotFoundError();

    // USER DECISION (2026-09-09): the readback below still proves BOTH the
    // owner (trusted user_id filter) AND the exact stored policy id before
    // activation; the rolling-hour aggregate simply is not part of the
    // policy yet (pending feature, surfaced as aggregationReady:false).

    const privyDid = await this.privyDidOf(userId);

    let serverWallet: PrivyWalletRecord;
    try {
      serverWallet = await this.privyServer.getVerifiedWalletForUser(
        privyDid,
        walletRow.provider_wallet_id,
      );
    } catch (error) {
      if (error instanceof PrivyServerError && error.status === 404) {
        // A wallet we cannot read back is NOT proof of attachment.
        return {
          verified: false,
          state: (grant.state as PermissionState) ?? "pending",
          permission: null,
          observed: {
            walletOwnerMatches: false,
            policyAttached: false,
            observedPolicyIds: [],
            observedSignerIds: [],
          },
        };
      }
      throw new WalletUnavailableError(
        "Privy could not verify the signer enrollment.",
      );
    }

    const signers = serverWallet.additional_signers;
    const observedPolicyIds = signers.flatMap((signer) =>
      PrivyServerClient.signerPolicyIds(signer),
    );
    const observedSignerIds = signers
      .map((signer) => PrivyServerClient.signerId(signer))
      .filter((value): value is string => Boolean(value));
    // Reaching this point proves ownership through the trusted user filter.
    const ownerMatches = true;
    const matchingSigner = signers.find(
      (signer) =>
        grant.provider_policy_id !== null &&
        PrivyServerClient.signerPolicyIds(signer).includes(
          grant.provider_policy_id ?? "",
        ),
    );
    const policyAttached = Boolean(grant.provider_policy_id && matchingSigner);

    if (!ownerMatches || !policyAttached) {
      return {
        verified: false,
        state: (grant.state as PermissionState) ?? "pending",
        permission: null,
        observed: {
          walletOwnerMatches: ownerMatches,
          policyAttached,
          observedPolicyIds,
          observedSignerIds,
        },
      };
    }

    const signerId = PrivyServerClient.signerId(matchingSigner!) ?? null;
    const active = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const updated = await client.query<GrantRow>(
          `UPDATE signer_grants
               SET state = 'active', provider_signer_id = $3, updated_at = now()
               WHERE id = $1 AND user_id = $2
               RETURNING ${GRANT_COLUMNS}`,
          [grant.id, userId, signerId],
        );
        return updated.rows[0]!;
      },
    );

    return {
      verified: true,
      state: "active",
      permission: mapGrantSummary(userId, active),
      observed: {
        walletOwnerMatches: ownerMatches,
        policyAttached,
        observedPolicyIds,
        observedSignerIds,
      },
    };
  }

  /** Resolves the caller's privy_did from the users table (RLS-scoped). */
  private async privyDidOf(userId: string): Promise<string> {
    return this.database.withUserTransaction(userId, async (client) => {
      const result = await client.query<{ privy_did: string }>(
        "SELECT privy_did FROM users WHERE id = $1",
        [userId],
      );
      const row = result.rows[0];
      if (!row)
        throw new WalletOwnershipError(
          "User identity is not provisioned; cannot verify wallet ownership.",
        );
      return row.privy_did;
    });
  }

  /** PEW-007: read-only grant summary with readable USDC limits; never credentials/bytes. */
  public async getPermission(userId: string): Promise<PermissionSummary> {
    const row = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const result = await client.query<GrantRow>(
          `SELECT ${GRANT_COLUMNS} FROM signer_grants
         WHERE user_id = $1
         ORDER BY (state = 'active') DESC, updated_at DESC
         LIMIT 1`,
          [userId],
        );
        return result.rows[0];
      },
    );
    const summary = mapGrantSummary(userId, row);
    // USER DECISION (2026-09-09): an active grant (achieved via readback) is
    // reported honestly as active; the unenforced rolling-hour limit stays
    // visible through aggregationReady:false / aggregateOvershootCaveat — never
    // hidden behind a fake 'unavailable' state.
    return summary;
  }

  /** PEW-013: revoke moves active -> revoking -> revoked; provider-unavailable stays 'revoking'. */
  public async revokePermission(userId: string): Promise<RevokeResult> {
    const grant = await this.database.withUserTransaction(
      userId,
      async (client) => {
        const result = await client.query<GrantRow>(
          `SELECT ${GRANT_COLUMNS} FROM signer_grants WHERE user_id = $1 AND state = 'active' ORDER BY updated_at DESC LIMIT 1`,
          [userId],
        );
        return result.rows[0];
      },
    );
    if (!grant) return { userId, state: "unavailable", remote: "unavailable" };

    await this.database.withUserTransaction(userId, async (client) => {
      await client.query(
        `UPDATE signer_grants SET state = 'revoking', updated_at = now() WHERE id = $1 AND user_id = $2`,
        [grant.id, userId],
      );
    });

    try {
      if (this.privyServer) {
        throw new Error(
          "Privy signer removal and trusted read-back are not implemented.",
        );
      }
      if (grant.provider_policy_id)
        await this.privy.revokeGrantPolicy(grant.provider_policy_id);
      await this.database.withUserTransaction(userId, async (client) => {
        await client.query(
          `UPDATE signer_grants SET state = 'revoked', updated_at = now() WHERE id = $1 AND user_id = $2`,
          [grant.id, userId],
        );
      });
      return { userId, state: "revoked", remote: "revoked" };
    } catch (error) {
      // Never claim remote revocation succeeded when the provider is unavailable.
      await this.database.withUserTransaction(userId, async (client) => {
        await client.query(
          `UPDATE signer_grants SET state = 'revoking', updated_at = now() WHERE id = $1 AND user_id = $2`,
          [grant.id, userId],
        );
      });
      throw new WalletUnavailableError(
        error instanceof Error ? error.message : "Privy revoke failed.",
      );
    }
  }
}

function deterministicPolicyHash(input: GrantInput): string {
  return `pol_${Buffer.from(
    `${input.perTransferAtomic6}|${input.rollingTotalAtomic6}|${input.rollingWindowSeconds}|${input.gasCeiling}|${input.recipients.join(",")}`,
  ).toString("base64url")}`;
}

function mapGrantSummary(
  userId: string,
  row: GrantRow | undefined,
): PermissionSummary {
  if (!row) {
    return {
      userId,
      grantId: null,
      state: "unavailable",
      perTransferUsdc: "",
      rollingTotalUsdc: "",
      rollingWindowSeconds: 0,
      gasCeiling: "",
      recipients: [],
      aggregateOvershootCaveat: true,
      aggregationReady: false,
      aggregateBlockReason: AGGREGATION_BLOCK_REASON,
    };
  }
  return {
    userId,
    grantId: row.id,
    state: row.state as PermissionState,
    perTransferUsdc: atomic6ToUsdc(row.per_transfer_atomic6),
    rollingTotalUsdc: atomic6ToUsdc(row.rolling_total_atomic6),
    rollingWindowSeconds: Number(row.rolling_window_seconds),
    gasCeiling: row.gas_ceiling,
    recipients: row.allowlisted_recipients ?? [],
    // PEW-007: the documented provider aggregate overshoot is a provider
    // limitation, never hidden behind a local cap.
    aggregateOvershootCaveat: true,
    // PEW-014: aggregation is provider-unproven (parent gate); block payments
    // until wallet-identity group_by is proven.
    aggregationReady: false,
    aggregateBlockReason: AGGREGATION_BLOCK_REASON,
  };
}

export const PINNED = {
  chainId: ARC_TESTNET_CHAIN_ID,
  usdcContract: ARC_USDC_ERC20,
};
