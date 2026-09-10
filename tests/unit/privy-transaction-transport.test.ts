import { createPublicKey, verify } from "node:crypto";
import {
  formatRequestForAuthorizationSignature,
  generateP256KeyPair,
} from "@privy-io/node";
import { Wallet } from "ethers";
import { describe, expect, it, vi } from "vitest";
import {
  ARC_USDC_PER_TRANSFER_LIMIT_ATOMIC6,
  PrivyTransactionRejectedError,
  PrivyTransactionQuarantinedError,
  PrivyTransactionTransport,
  PrivyTransactionUncertainError,
  JsonRpcHttpClient,
  createLivePrivyTransactionTransport,
  encodeArcUsdcTransferCalldata,
  ethersSignedTransactionCodec,
  privyNodeAuthorizationSigner,
  type DecodedSignedTransaction,
  type PrivyAuthorizationSignatureInput,
  type PrivyPolicyReadiness,
  type SignedTransactionCodec,
} from "../../src/wallet/privy-transaction-transport.js";

const FROM = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const USDC = "0x3600000000000000000000000000000000000000";
const RAW = "0x02abcd" as const;
const HASH = `0x${"ab".repeat(32)}` as const;

function rpcReadinessResult(method: string): string | undefined {
  if (method === "eth_chainId") return "0x4cef52";
  if (method === "eth_call") return "0x6";
  return undefined;
}

const readyPolicy: PrivyPolicyReadiness = {
  walletId: "wallet-test",
  policyId: "policy-test",
  readbackVerified: true,
  gasProtectionProven: true,
  aggregationProtectionProven: true,
  chainId: 5042002,
  usdcContract: USDC,
  perTransferLimitAtomic6: "10000000",
  rollingLimitAtomic6: "50000000",
  rollingWindowSeconds: 3600,
};

const expectedCalldata: `0x${string}` =
  `0xa9059cbb${"0".repeat(24)}${RECIPIENT.slice(2)}${"989680".padStart(64, "0")}`;

const decoded: DecodedSignedTransaction = {
  from: FROM,
  chainId: 5_042_002n,
  nonce: 7n,
  to: USDC,
  value: 0n,
  data: expectedCalldata,
  gasLimit: 80_000n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
};

function makeTransport(options: {
  policy?: PrivyPolicyReadiness;
  decoded?: DecodedSignedTransaction;
  hash?: `0x${string}`;
  fetch?: typeof fetch;
  rpcRequest?: (method: string, params: readonly unknown[]) => Promise<unknown>;
  rpcTimeoutMs?: number;
} = {}) {
  const authorizationSigner = vi.fn(
    async (_input: {
      input: PrivyAuthorizationSignatureInput;
      authorizationPrivateKey: string;
    }) => "runtime-test-signature",
  );
  const codec: SignedTransactionCodec = {
    decode: vi.fn(() => options.decoded ?? decoded),
    transactionHash: vi.fn(() => options.hash ?? HASH),
  };
  const rpcRequest = vi.fn(
    options.rpcRequest ??
      (async (method: string) => rpcReadinessResult(method) ?? HASH),
  );
  const fetchImpl =
    options.fetch ??
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          method: "eth_signTransaction",
          data: { signed_transaction: RAW, encoding: "rlp" },
        }),
        { status: 200 },
      ),
    );
  const transport = new PrivyTransactionTransport({
    appId: "app-test",
    appSecret: "runtime-test-secret",
    authorizationPrivateKey: "runtime-test-p256-key",
    authorizationSigner,
    signedTransactionCodec: codec,
    ethereumRpc: { request: rpcRequest },
    policyReadiness: options.policy ?? readyPolicy,
    fetch: fetchImpl,
    now: () => 1_700_000_000_000,
    rpcTimeoutMs: options.rpcTimeoutMs,
  });
  return { transport, authorizationSigner, codec, rpcRequest, fetchImpl };
}

const intent = {
  walletId: "wallet-test",
  from: FROM,
  recipient: RECIPIENT,
  amountAtomic6: "10000000",
  nonce: 7n,
  gasLimit: 80_000n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  idempotencyKey: "operation-test",
};

describe("PrivyTransactionTransport", () => {
  it("encodes exact Arc USDC ERC-20 transfer calldata", () => {
    expect(ARC_USDC_PER_TRANSFER_LIMIT_ATOMIC6).toBe(10_000_000n);
    expect(encodeArcUsdcTransferCalldata(RECIPIENT, "10000000")).toBe(
      expectedCalldata,
    );
  });

  it("uses Privy's official formatter and P-256 signature implementation", async () => {
    const keyPair = await generateP256KeyPair();
    const signatureInput: PrivyAuthorizationSignatureInput = {
      version: 1,
      url: "https://api.privy.io/v1/wallets/wallet-test/rpc",
      method: "POST",
      headers: { "privy-app-id": "app-test" },
      body: {
        method: "eth_signTransaction",
        params: {
          transaction: {
            from: FROM,
            to: USDC,
            chain_id: 5_042_002,
            nonce: "0x7",
            data: expectedCalldata,
            value: "0x0",
            type: 2,
            gas_limit: "0x13880",
            max_fee_per_gas: "0x77359400",
            max_priority_fee_per_gas: "0x3b9aca00",
          },
        },
      },
    };
    const signature = await privyNodeAuthorizationSigner({
      input: signatureInput,
      authorizationPrivateKey: keyPair.privateKey,
    });
    const publicKey = createPublicKey({
      key: Buffer.from(keyPair.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    expect(
      verify(
        "sha256",
        formatRequestForAuthorizationSignature(signatureInput),
        publicKey,
        Buffer.from(signature, "base64"),
      ),
    ).toBe(true);
  });

  it("decodes a real EIP-1559 signed transaction and hashes its exact bytes", async () => {
    const wallet = Wallet.createRandom();
    const rawTransaction = (await wallet.signTransaction({
      type: 2,
      chainId: 5_042_002,
      nonce: 7,
      to: USDC,
      value: 0,
      data: expectedCalldata,
      gasLimit: 80_000,
      maxFeePerGas: 2_000_000_000,
      maxPriorityFeePerGas: 1_000_000_000,
    })) as `0x${string}`;

    expect(ethersSignedTransactionCodec.decode(rawTransaction)).toEqual({
      ...decoded,
      from: wallet.address,
    });
    expect(ethersSignedTransactionCodec.transactionHash(rawTransaction)).toMatch(
      /^0x[0-9a-f]{64}$/u,
    );
    expect(ethersSignedTransactionCodec.transactionHash(rawTransaction)).toBe(
      ethersSignedTransactionCodec.transactionHash(rawTransaction),
    );
  });

  it("constructs the live transport with the concrete SDK and EVM adapters", () => {
    expect(
      createLivePrivyTransactionTransport({
        appId: "app-test",
        appSecret: "runtime-test-secret",
        authorizationPrivateKey: "runtime-test-p256-key",
        ethereumRpc: { request: async () => null },
      }),
    ).toBeInstanceOf(PrivyTransactionTransport);
  });

  it("issues bounded JSON-RPC 2.0 requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: HASH })),
    );
    const rpc = new JsonRpcHttpClient(
      "https://rpc.test.invalid",
      fetchImpl,
      250,
    );
    await expect(
      rpc.request("eth_sendRawTransaction", [RAW]),
    ).resolves.toBe(HASH);
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: [RAW],
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("blocks before authorization when provider policy proof is incomplete", async () => {
    const { transport, authorizationSigner, fetchImpl } = makeTransport({
      policy: { ...readyPolicy, aggregationProtectionProven: false },
    });

    await expect(transport.signTransfer(intent)).rejects.toMatchObject({
      reason: "policy_not_ready",
    });
    expect(authorizationSigner).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong chain", "0x1", "0x6"],
    ["wrong decimals", "0x4cef52", "0x12"],
  ])("blocks signing when the exact RPC reports %s", async (_label, chain, decimals) => {
    const { transport, authorizationSigner, fetchImpl } = makeTransport({
      rpcRequest: async (method) =>
        method === "eth_chainId" ? chain : decimals,
    });
    await expect(transport.signTransfer(intent)).rejects.toMatchObject({
      reason: "rpc_readiness",
    });
    expect(authorizationSigner).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("signs the exact Privy request envelope and verifies returned bytes", async () => {
    const { transport, authorizationSigner, fetchImpl, codec } = makeTransport();

    await expect(transport.signTransfer(intent)).resolves.toEqual({
      rawTransaction: RAW,
      transactionHash: HASH,
      decoded,
    });
    const authorizationCall = authorizationSigner.mock.calls[0]?.[0];
    expect(authorizationCall).toEqual({
      input: {
        version: 1,
        url: "https://api.privy.io/v1/wallets/wallet-test/rpc",
        method: "POST",
        headers: {
          "privy-app-id": "app-test",
          "privy-idempotency-key": "operation-test",
          "privy-request-expiry": "1700000030000",
        },
        body: {
          method: "eth_signTransaction",
          params: {
            transaction: {
              from: FROM,
              to: USDC,
              chain_id: 5_042_002,
              nonce: "0x7",
              data: expectedCalldata,
              value: "0x0",
              type: 2,
              gas_limit: "0x13880",
              max_fee_per_gas: "0x77359400",
              max_priority_fee_per_gas: "0x3b9aca00",
            },
          },
        },
      },
      authorizationPrivateKey: "runtime-test-p256-key",
    });
    const fetchCall = vi.mocked(fetchImpl).mock.calls[0];
    const headers = fetchCall?.[1]?.headers as Record<string, string>;
    expect(headers["privy-authorization-signature"]).toBe(
      "runtime-test-signature",
    );
    expect(headers["privy-request-expiry"]).toBe("1700000030000");
    expect(codec.decode).toHaveBeenCalledWith(RAW);
    expect(codec.transactionHash).toHaveBeenCalledWith(RAW);
  });

  it.each([
    ["sender", { from: RECIPIENT }],
    ["chain", { chainId: 1n }],
    ["nonce", { nonce: 8n }],
    ["token", { to: RECIPIENT }],
    ["value", { value: 1n }],
    ["calldata", { data: "0xdead" }],
    ["gas_limit", { gasLimit: 79_999n }],
    ["max_fee_per_gas", { maxFeePerGas: 3n }],
    ["max_priority_fee_per_gas", { maxPriorityFeePerGas: 3n }],
  ])("rejects a signed transaction with mismatched %s", async (reason, patch) => {
    const { transport } = makeTransport({
      decoded: { ...decoded, ...patch },
    });
    const result = transport.signTransfer(intent);
    await expect(result).rejects.toBeInstanceOf(
      PrivyTransactionQuarantinedError,
    );
    await expect(result).rejects.toMatchObject({
      reason,
      retrySafe: false,
      signedTransactionHash: HASH,
    });
  });

  it("broadcasts the exact verified bytes and requires the deterministic hash", async () => {
    const { transport, rpcRequest } = makeTransport();
    const transaction = await transport.signTransfer(intent);
    await expect(
      transport.broadcast(transaction),
    ).resolves.toEqual({ status: "submitted", transactionHash: HASH });
    expect(rpcRequest).toHaveBeenCalledWith("eth_sendRawTransaction", [RAW]);
  });

  it("keeps a network-ambiguous broadcast uncertain with its deterministic hash", async () => {
    const { transport } = makeTransport({
      rpcRequest: async (method) => {
        const readiness = rpcReadinessResult(method);
        if (readiness) return readiness;
        throw new Error("socket closed");
      },
    });
    const transaction = await transport.signTransfer(intent);
    const result = transport.broadcast(transaction);
    await expect(result).rejects.toBeInstanceOf(PrivyTransactionUncertainError);
    await expect(result).rejects.toMatchObject({
      stage: "broadcast",
      transactionHash: HASH,
    });
  });

  it("bounds an injected RPC that never settles and reports broadcast uncertainty", async () => {
    const { transport } = makeTransport({
      rpcRequest: async (method) =>
        rpcReadinessResult(method) ?? new Promise<never>(() => undefined),
      rpcTimeoutMs: 5,
    });
    const transaction = await transport.signTransfer(intent);
    await expect(transport.broadcast(transaction)).rejects.toMatchObject({
      stage: "broadcast",
      transactionHash: HASH,
    });
  });

  it("refuses structurally valid bytes that did not pass local verification", async () => {
    const { transport, rpcRequest } = makeTransport();
    await expect(
      transport.broadcast({
        rawTransaction: RAW,
        transactionHash: HASH,
        decoded,
      }),
    ).rejects.toMatchObject({ reason: "unverified_transaction" });
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it("re-verifies persisted bytes before broadcasting after a restart", async () => {
    const { transport, rpcRequest } = makeTransport();
    const restored = transport.verifySignedTransfer(RAW, intent);
    await expect(transport.broadcast(restored)).resolves.toEqual({
      status: "submitted",
      transactionHash: HASH,
    });
    expect(rpcRequest).toHaveBeenCalledWith("eth_sendRawTransaction", [RAW]);
  });

  it.each([
    [null, "pending"],
    [
      { transactionHash: HASH, blockNumber: "0x2a", status: "0x1" },
      "confirmed",
    ],
    [
      { transactionHash: HASH, blockNumber: "0x2a", status: "0x0" },
      "reverted",
    ],
  ])("reconciles receipt %j as %s", async (receipt, status) => {
    const { transport } = makeTransport({
      rpcRequest: async (method) => rpcReadinessResult(method) ?? receipt,
    });
    const transaction = transport.verifySignedTransfer(RAW, intent);
    await expect(transport.reconcile(transaction)).resolves.toMatchObject({
      status,
      transactionHash: HASH,
    });
  });

  it("never treats a receipt for an unverified client hash as success", async () => {
    const { transport, rpcRequest } = makeTransport({
      rpcRequest: async () => ({
        transactionHash: HASH,
        blockNumber: "0x2a",
        status: "0x1",
      }),
    });
    await expect(
      transport.reconcile({
        rawTransaction: RAW,
        transactionHash: HASH,
        decoded,
      }),
    ).rejects.toMatchObject({ reason: "unverified_transaction" });
    expect(rpcRequest).not.toHaveBeenCalled();
  });

  it("keeps reconciliation uncertain when RPC readiness cannot be established", async () => {
    const { transport } = makeTransport({
      rpcRequest: async () => {
        throw new Error("RPC unavailable");
      },
    });
    const transaction = transport.verifySignedTransfer(RAW, intent);
    await expect(transport.reconcile(transaction)).rejects.toMatchObject({
      stage: "reconcile",
      transactionHash: HASH,
    });
  });

  it("rechecks RPC readiness before broadcasting verified bytes", async () => {
    let chain = "0x4cef52";
    const { transport, authorizationSigner, rpcRequest } = makeTransport({
      rpcRequest: async (method) => {
        if (method === "eth_chainId") return chain;
        return rpcReadinessResult(method) ?? HASH;
      },
    });
    const transaction = await transport.signTransfer(intent);
    expect(authorizationSigner).toHaveBeenCalledOnce();
    chain = "0x1";
    await expect(transport.broadcast(transaction)).rejects.toMatchObject({
      reason: "rpc_readiness",
    });
    expect(rpcRequest).not.toHaveBeenCalledWith("eth_sendRawTransaction", [RAW]);
  });

  it("does not expose configured secret material in provider failures", async () => {
    const { transport } = makeTransport({
      fetch: vi.fn(async () => new Response("forbidden", { status: 403 })),
    });
    let failure: unknown;
    try {
      await transport.signTransfer(intent);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PrivyTransactionRejectedError);
    expect(String(failure)).not.toContain("runtime-test-secret");
    expect(String(failure)).not.toContain("runtime-test-p256-key");
  });

  it("treats a server error after signing as an ambiguous lost response", async () => {
    const { transport } = makeTransport({
      fetch: vi.fn(async () => new Response("gateway failure", { status: 500 })),
    });
    await expect(transport.signTransfer(intent)).rejects.toMatchObject({
      stage: "sign",
      transactionHash: undefined,
    });
  });
});
