import { generateAuthorizationSignature } from "@privy-io/node";
import { Transaction, keccak256 } from "ethers";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ERC20,
  ERC20_TRANSFER_SELECTOR,
} from "./privy-client.js";

export const ARC_USDC_DECIMALS = 6;
export const ARC_USDC_PER_TRANSFER_LIMIT_ATOMIC6 = 10_000_000n;
export const ARC_USDC_ROLLING_LIMIT_ATOMIC6 = 50_000_000n;
export const ARC_USDC_ROLLING_WINDOW_SECONDS = 3600;
export const ERC20_DECIMALS_SELECTOR = "0x313ce567";

type Hex = `0x${string}`;

export type PrivyWalletRpcBody = {
  method: "eth_signTransaction";
  params: {
    transaction: {
      from: Hex;
      to: Hex;
      chain_id: number;
      nonce: Hex;
      data: Hex;
      value: "0x0";
      type: 2;
      gas_limit: Hex;
      max_fee_per_gas: Hex;
      max_priority_fee_per_gas: Hex;
    };
  };
};

export type PrivyAuthorizationSignatureInput = {
  version: 1;
  url: string;
  method: "POST";
  headers: {
    "privy-app-id": string;
    "privy-idempotency-key"?: string;
    "privy-request-expiry"?: string;
  };
  body: PrivyWalletRpcBody;
};

/**
 * Adapter seam for `generateAuthorizationSignature` from `@privy-io/node`.
 * The official SDK owns RFC 8785 request formatting and P-256 signature encoding.
 */
export type PrivyAuthorizationSigner = (input: {
  input: PrivyAuthorizationSignatureInput;
  authorizationPrivateKey: string;
}) => Promise<string> | string;

export type DecodedSignedTransaction = {
  from: string;
  chainId: bigint;
  nonce: bigint;
  to: string | null;
  value: bigint;
  data: string;
  gasLimit: bigint;
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
};

/**
 * Trusted EVM primitive seam. Production must provide a pinned direct dependency
 * (for example ethers Transaction.from + keccak256), never a transitive import.
 */
export type SignedTransactionCodec = {
  decode(rawTransaction: Hex): DecodedSignedTransaction;
  transactionHash(rawTransaction: Hex): Hex;
};

/** Official Privy SDK implementation of canonical request authorization. */
export const privyNodeAuthorizationSigner: PrivyAuthorizationSigner = ({
  input,
  authorizationPrivateKey,
}) => generateAuthorizationSignature({ input, authorizationPrivateKey });

/** Ethers implementation: RLP decode, secp256k1 sender recovery and Keccak-256. */
export const ethersSignedTransactionCodec: SignedTransactionCodec = {
  decode(rawTransaction) {
    const transaction = Transaction.from(rawTransaction);
    if (!transaction.signature || !transaction.from) {
      throw new Error("Signed transaction has no recoverable signature.");
    }
    return {
      from: transaction.from,
      chainId: transaction.chainId,
      nonce: BigInt(transaction.nonce),
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
      gasLimit: transaction.gasLimit,
      maxFeePerGas: transaction.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
    };
  },
  transactionHash(rawTransaction) {
    return keccak256(rawTransaction) as Hex;
  },
};

export type EthereumRpc = {
  request(method: string, params: readonly unknown[]): Promise<unknown>;
};

/** Small JSON-RPC 2.0 client with a bounded request time and injectable fetch. */
export class JsonRpcHttpClient implements EthereumRpc {
  private nextId = 1;

  public constructor(
    private readonly rpcUrl: string,
    private readonly doFetch: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {
    if (!/^https?:\/\//u.test(rpcUrl)) {
      throw new Error("Ethereum RPC URL must use HTTP or HTTPS.");
    }
  }

  public async request(
    method: string,
    params: readonly unknown[],
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const response = await this.doFetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Ethereum RPC HTTP failure (${response.status}).`);
    }
    const parsed = (await response.json()) as {
      jsonrpc?: unknown;
      id?: unknown;
      result?: unknown;
      error?: { code?: unknown };
    };
    if (
      parsed.jsonrpc !== "2.0" ||
      parsed.id !== id ||
      parsed.error ||
      !("result" in parsed)
    ) {
      const code =
        typeof parsed.error?.code === "number" ? ` (${parsed.error.code})` : "";
      throw new Error(`Ethereum RPC rejected or malformed the request${code}.`);
    }
    return parsed.result;
  }
}

export type PrivyPolicyReadiness = {
  walletId: string;
  policyId: string;
  readbackVerified: boolean;
  gasProtectionProven: boolean;
  aggregationProtectionProven: boolean;
  chainId: number;
  usdcContract: string;
  perTransferLimitAtomic6: string;
  rollingLimitAtomic6: string;
  rollingWindowSeconds: number;
};

export type ArcUsdcSigningIntent = {
  walletId: string;
  from: string;
  recipient: string;
  amountAtomic6: string;
  nonce: bigint;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  idempotencyKey: string;
};

export type VerifiedSignedTransaction = {
  rawTransaction: Hex;
  transactionHash: Hex;
  decoded: DecodedSignedTransaction;
};

export type BroadcastResult = {
  status: "submitted";
  transactionHash: Hex;
};

export type ReconciliationResult =
  | { status: "pending"; transactionHash: Hex }
  | { status: "confirmed"; transactionHash: Hex; blockNumber: bigint }
  | { status: "reverted"; transactionHash: Hex; blockNumber: bigint };

export class PrivyTransactionRejectedError extends Error {
  public constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "PrivyTransactionRejectedError";
  }
}

export class PrivyTransactionUncertainError extends Error {
  public constructor(
    public readonly stage: "sign" | "broadcast" | "reconcile",
    public readonly transactionHash?: Hex,
  ) {
    super(
      transactionHash
        ? `Transaction state is uncertain; reconcile ${transactionHash}.`
        : "Transaction state is uncertain; provider response was not conclusive.",
    );
    this.name = "PrivyTransactionUncertainError";
  }
}

/** Signed bytes exist but failed local intent verification; never retry blindly. */
export class PrivyTransactionQuarantinedError extends PrivyTransactionRejectedError {
  public readonly retrySafe = false;

  public constructor(
    reason: string,
    message: string,
    public readonly signedTransactionHash?: Hex,
  ) {
    super(reason, message);
    this.name = "PrivyTransactionQuarantinedError";
  }
}

export type PrivyTransactionTransportConfig = {
  appId: string;
  appSecret: string;
  authorizationPrivateKey: string;
  authorizationSigner: PrivyAuthorizationSigner;
  signedTransactionCodec: SignedTransactionCodec;
  ethereumRpc: EthereumRpc;
  /** Omitted by default: signing remains blocked until trusted read-back fills it. */
  policyReadiness?: PrivyPolicyReadiness;
  fetch?: typeof fetch;
  privyBaseUrl?: string;
  now?: () => number;
  requestExpiryMs?: number;
  fetchTimeoutMs?: number;
  rpcTimeoutMs?: number;
};

export type LivePrivyTransactionTransportConfig = Omit<
  PrivyTransactionTransportConfig,
  "authorizationSigner" | "signedTransactionCodec"
>;

function isAddress(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function isHex(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/u.test(value);
}

function normalizedAddress(value: string): string {
  return value.toLowerCase();
}

function quantity(value: bigint): Hex {
  if (value < 0n) {
    throw new PrivyTransactionRejectedError(
      "quantity",
      "Transaction quantities must be non-negative.",
    );
  }
  return `0x${value.toString(16)}`;
}

function parseAtomicAmount(value: string): bigint {
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new PrivyTransactionRejectedError(
      "amount",
      "USDC amount must be a positive atomic-unit integer.",
    );
  }
  const amount = BigInt(value);
  if (amount > ARC_USDC_PER_TRANSFER_LIMIT_ATOMIC6) {
    throw new PrivyTransactionRejectedError(
      "amount",
      "USDC amount exceeds the provider per-transfer policy envelope.",
    );
  }
  return amount;
}

/** Exact ERC-20 transfer(address,uint256) calldata for six-decimal Arc USDC. */
export function encodeArcUsdcTransferCalldata(
  recipient: string,
  amountAtomic6: string,
): Hex {
  if (!isAddress(recipient)) {
    throw new PrivyTransactionRejectedError(
      "recipient",
      "Recipient is not a valid EVM address.",
    );
  }
  const amount = parseAtomicAmount(amountAtomic6);
  const addressWord = recipient.slice(2).toLowerCase().padStart(64, "0");
  const amountWord = amount.toString(16).padStart(64, "0");
  return `${ERC20_TRANSFER_SELECTOR}${addressWord}${amountWord}`;
}

function assertPolicyReady(
  readiness: PrivyPolicyReadiness | undefined,
  walletId: string,
): void {
  const ready =
    readiness !== undefined &&
    readiness.walletId === walletId &&
    readiness.policyId.length > 0 &&
    readiness.readbackVerified &&
    readiness.gasProtectionProven &&
    readiness.aggregationProtectionProven &&
    readiness.chainId === ARC_TESTNET_CHAIN_ID &&
    normalizedAddress(readiness.usdcContract) ===
      normalizedAddress(ARC_USDC_ERC20) &&
    readiness.perTransferLimitAtomic6 ===
      ARC_USDC_PER_TRANSFER_LIMIT_ATOMIC6.toString() &&
    readiness.rollingLimitAtomic6 ===
      ARC_USDC_ROLLING_LIMIT_ATOMIC6.toString() &&
    readiness.rollingWindowSeconds === ARC_USDC_ROLLING_WINDOW_SECONDS;

  if (!ready) {
    throw new PrivyTransactionRejectedError(
      "policy_not_ready",
      "Privy policy readiness is unproven for this wallet.",
    );
  }
}

function assertHash(value: unknown, label: string): asserts value is Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/u.test(value)) {
    throw new PrivyTransactionRejectedError(
      "transaction_hash",
      `${label} did not return a valid Ethereum transaction hash.`,
    );
  }
}

function assertDecodedMatches(
  decoded: DecodedSignedTransaction,
  expected: PrivyWalletRpcBody["params"]["transaction"],
): void {
  const checks: Array<[boolean, string, string]> = [
    [
      normalizedAddress(decoded.from) === normalizedAddress(expected.from),
      "sender",
      "Recovered sender does not match the enrolled wallet.",
    ],
    [
      decoded.chainId === BigInt(expected.chain_id),
      "chain",
      "Signed transaction is not for Arc Testnet.",
    ],
    [
      decoded.nonce === BigInt(expected.nonce),
      "nonce",
      "Signed transaction nonce does not match the requested nonce.",
    ],
    [
      decoded.to !== null &&
        normalizedAddress(decoded.to) === normalizedAddress(expected.to),
      "token",
      "Signed transaction target is not Arc USDC.",
    ],
    [decoded.value === 0n, "value", "Signed transaction has native value."],
    [
      decoded.data.toLowerCase() === expected.data.toLowerCase(),
      "calldata",
      "Signed transaction calldata differs from the confirmed transfer.",
    ],
    [
      decoded.gasLimit === BigInt(expected.gas_limit),
      "gas_limit",
      "Signed transaction gas limit differs from the approved envelope.",
    ],
    [
      decoded.maxFeePerGas === BigInt(expected.max_fee_per_gas),
      "max_fee_per_gas",
      "Signed transaction max fee differs from the approved envelope.",
    ],
    [
      decoded.maxPriorityFeePerGas ===
        BigInt(expected.max_priority_fee_per_gas),
      "max_priority_fee_per_gas",
      "Signed transaction priority fee differs from the approved envelope.",
    ],
  ];
  const failed = checks.find(([matches]) => !matches);
  if (failed) {
    throw new PrivyTransactionRejectedError(failed[1], failed[2]);
  }
}

function readJsonRpcReceipt(value: unknown, expectedHash: Hex): ReconciliationResult {
  if (value === null) return { status: "pending", transactionHash: expectedHash };
  if (!value || typeof value !== "object") {
    throw new PrivyTransactionUncertainError("reconcile", expectedHash);
  }
  const receipt = value as {
    transactionHash?: unknown;
    blockNumber?: unknown;
    status?: unknown;
  };
  if (
    typeof receipt.transactionHash !== "string" ||
    receipt.transactionHash.toLowerCase() !== expectedHash.toLowerCase() ||
    !isHex(receipt.blockNumber) ||
    (receipt.status !== "0x0" && receipt.status !== "0x1")
  ) {
    throw new PrivyTransactionUncertainError("reconcile", expectedHash);
  }
  return {
    status: receipt.status === "0x1" ? "confirmed" : "reverted",
    transactionHash: expectedHash,
    blockNumber: BigInt(receipt.blockNumber),
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Operation deadline exceeded.")),
      timeoutMs,
    );
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Signs through Privy's wallet RPC, verifies the returned RLP locally, then
 * broadcasts only those exact bytes. The module never logs request material.
 */
export class PrivyTransactionTransport {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly requestExpiryMs: number;
  private readonly fetchTimeoutMs: number;
  private readonly rpcTimeoutMs: number;
  private readonly verifiedTransactions = new WeakSet<VerifiedSignedTransaction>();

  public constructor(private readonly config: PrivyTransactionTransportConfig) {
    if (!config.appId || !config.appSecret || !config.authorizationPrivateKey) {
      throw new Error("Privy transaction transport configuration is incomplete.");
    }
    this.baseUrl = (config.privyBaseUrl ?? "https://api.privy.io/v1").replace(
      /\/$/u,
      "",
    );
    this.doFetch = config.fetch ?? fetch;
    this.now = config.now ?? Date.now;
    this.requestExpiryMs = config.requestExpiryMs ?? 30_000;
    this.fetchTimeoutMs = config.fetchTimeoutMs ?? 10_000;
    this.rpcTimeoutMs = config.rpcTimeoutMs ?? 10_000;
  }

  /** Verifies that the exact RPC target is Arc Testnet and exposes 6-decimal USDC. */
  private async assertArcRpcReady(): Promise<void> {
    let chainId: unknown;
    let decimals: unknown;
    try {
      chainId = await withTimeout(
        this.config.ethereumRpc.request("eth_chainId", []),
        this.rpcTimeoutMs,
      );
      decimals = await withTimeout(
        this.config.ethereumRpc.request("eth_call", [
          { to: ARC_USDC_ERC20, data: ERC20_DECIMALS_SELECTOR },
          "latest",
        ]),
        this.rpcTimeoutMs,
      );
    } catch {
      throw new PrivyTransactionRejectedError(
        "rpc_readiness",
        "Arc RPC readiness could not be proven.",
      );
    }
    if (
      !isHex(chainId) ||
      BigInt(chainId) !== BigInt(ARC_TESTNET_CHAIN_ID) ||
      !isHex(decimals) ||
      BigInt(decimals) !== BigInt(ARC_USDC_DECIMALS)
    ) {
      throw new PrivyTransactionRejectedError(
        "rpc_readiness",
        "RPC chain or Arc USDC decimals do not match the pinned configuration.",
      );
    }
  }

  public async signTransfer(
    intent: ArcUsdcSigningIntent,
  ): Promise<VerifiedSignedTransaction> {
    assertPolicyReady(this.config.policyReadiness, intent.walletId);
    await this.assertArcRpcReady();
    if (!isAddress(intent.from) || !isAddress(intent.recipient)) {
      throw new PrivyTransactionRejectedError(
        "address",
        "Transfer contains an invalid EVM address.",
      );
    }
    if (!intent.idempotencyKey.trim()) {
      throw new PrivyTransactionRejectedError(
        "idempotency",
        "Privy signing requires an idempotency key.",
      );
    }
    if (
      intent.gasLimit <= 0n ||
      intent.maxFeePerGas <= 0n ||
      intent.maxPriorityFeePerGas < 0n ||
      intent.maxPriorityFeePerGas > intent.maxFeePerGas
    ) {
      throw new PrivyTransactionRejectedError(
        "fees",
        "Transaction gas and fee values are invalid.",
      );
    }

    const url = `${this.baseUrl}/wallets/${encodeURIComponent(intent.walletId)}/rpc`;
    const requestExpiry = String(this.now() + this.requestExpiryMs);
    const body: PrivyWalletRpcBody = {
      method: "eth_signTransaction",
      params: {
        transaction: {
          from: intent.from,
          to: ARC_USDC_ERC20 as Hex,
          chain_id: ARC_TESTNET_CHAIN_ID,
          nonce: quantity(intent.nonce),
          data: encodeArcUsdcTransferCalldata(
            intent.recipient,
            intent.amountAtomic6,
          ),
          value: "0x0",
          type: 2,
          gas_limit: quantity(intent.gasLimit),
          max_fee_per_gas: quantity(intent.maxFeePerGas),
          max_priority_fee_per_gas: quantity(intent.maxPriorityFeePerGas),
        },
      },
    };
    const signedHeaders = {
      "privy-app-id": this.config.appId,
      "privy-idempotency-key": intent.idempotencyKey,
      "privy-request-expiry": requestExpiry,
    };

    let response: Response;
    try {
      const authorizationSignature = await this.config.authorizationSigner({
        input: {
          version: 1,
          url,
          method: "POST",
          headers: signedHeaders,
          body,
        },
        authorizationPrivateKey: this.config.authorizationPrivateKey,
      });
      response = await this.doFetch(url, {
        method: "POST",
        headers: {
          ...signedHeaders,
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${this.config.appId}:${this.config.appSecret}`,
          ).toString("base64")}`,
          "privy-authorization-signature": authorizationSignature,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.fetchTimeoutMs),
      });
    } catch {
      throw new PrivyTransactionUncertainError("sign");
    }

    if (!response.ok) {
      if (
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 409 ||
        response.status === 425 ||
        response.status === 429
      ) {
        throw new PrivyTransactionUncertainError("sign");
      }
      throw new PrivyTransactionRejectedError(
        "privy_rejected",
        `Privy rejected transaction signing (${response.status}).`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new PrivyTransactionUncertainError("sign");
    }
    const signedTransaction = (
      parsed as { data?: { signed_transaction?: unknown; encoding?: unknown } }
    )?.data;
    if (
      !signedTransaction ||
      signedTransaction.encoding !== "rlp" ||
      !isHex(signedTransaction.signed_transaction)
    ) {
      throw new PrivyTransactionUncertainError("sign");
    }

    return this.verifySignedTransfer(signedTransaction.signed_transaction, intent);
  }

  /**
   * Re-verifies persisted RLP after a restart before allowing re-broadcast.
   * The caller must supply the exact persisted intent (including wallet + fees).
   */
  public verifySignedTransfer(
    rawTransaction: Hex,
    intent: ArcUsdcSigningIntent,
  ): VerifiedSignedTransaction {
    assertPolicyReady(this.config.policyReadiness, intent.walletId);
    if (!isAddress(intent.from) || !isAddress(intent.recipient)) {
      throw new PrivyTransactionRejectedError(
        "address",
        "Transfer contains an invalid EVM address.",
      );
    }
    const expected: PrivyWalletRpcBody["params"]["transaction"] = {
      from: intent.from,
      to: ARC_USDC_ERC20 as Hex,
      chain_id: ARC_TESTNET_CHAIN_ID,
      nonce: quantity(intent.nonce),
      data: encodeArcUsdcTransferCalldata(
        intent.recipient,
        intent.amountAtomic6,
      ),
      value: "0x0",
      type: 2,
      gas_limit: quantity(intent.gasLimit),
      max_fee_per_gas: quantity(intent.maxFeePerGas),
      max_priority_fee_per_gas: quantity(intent.maxPriorityFeePerGas),
    };
    let decoded: DecodedSignedTransaction;
    let transactionHash: Hex;
    try {
      decoded = this.config.signedTransactionCodec.decode(rawTransaction);
      transactionHash =
        this.config.signedTransactionCodec.transactionHash(rawTransaction);
      assertHash(transactionHash, "Signed transaction codec");
      assertDecodedMatches(decoded, expected);
    } catch (error) {
      if (error instanceof PrivyTransactionRejectedError) {
        throw new PrivyTransactionQuarantinedError(
          error.reason,
          error.message,
          transactionHash!,
        );
      }
      throw new PrivyTransactionQuarantinedError(
        "signed_transaction",
        "Privy returned an invalid signed transaction.",
      );
    }
    const verified = { rawTransaction, transactionHash, decoded };
    this.verifiedTransactions.add(verified);
    return verified;
  }

  public async broadcast(
    transaction: VerifiedSignedTransaction,
  ): Promise<BroadcastResult> {
    if (!this.verifiedTransactions.has(transaction)) {
      throw new PrivyTransactionRejectedError(
        "unverified_transaction",
        "Transaction bytes were not verified by this transport.",
      );
    }
    await this.assertArcRpcReady();
    let result: unknown;
    try {
      result = await withTimeout(
        this.config.ethereumRpc.request("eth_sendRawTransaction", [
          transaction.rawTransaction,
        ]),
        this.rpcTimeoutMs,
      );
    } catch {
      throw new PrivyTransactionUncertainError(
        "broadcast",
        transaction.transactionHash,
      );
    }
    if (
      typeof result !== "string" ||
      result.toLowerCase() !== transaction.transactionHash.toLowerCase()
    ) {
      throw new PrivyTransactionUncertainError(
        "broadcast",
        transaction.transactionHash,
      );
    }
    return { status: "submitted", transactionHash: transaction.transactionHash };
  }

  public async reconcile(
    transaction: VerifiedSignedTransaction,
  ): Promise<ReconciliationResult> {
    if (!this.verifiedTransactions.has(transaction)) {
      throw new PrivyTransactionRejectedError(
        "unverified_transaction",
        "Receipt cannot establish success without locally verified transaction bytes.",
      );
    }
    const transactionHash = transaction.transactionHash;
    try {
      await this.assertArcRpcReady();
      const receipt = await withTimeout(
        this.config.ethereumRpc.request("eth_getTransactionReceipt", [
          transactionHash,
        ]),
        this.rpcTimeoutMs,
      );
      return readJsonRpcReceipt(receipt, transactionHash);
    } catch (error) {
      if (error instanceof PrivyTransactionUncertainError) throw error;
      throw new PrivyTransactionUncertainError("reconcile", transactionHash);
    }
  }
}

/** Production factory using only direct, pinned cryptographic dependencies. */
export function createLivePrivyTransactionTransport(
  config: LivePrivyTransactionTransportConfig,
): PrivyTransactionTransport {
  return new PrivyTransactionTransport({
    ...config,
    authorizationSigner: privyNodeAuthorizationSigner,
    signedTransactionCodec: ethersSignedTransactionCodec,
  });
}
