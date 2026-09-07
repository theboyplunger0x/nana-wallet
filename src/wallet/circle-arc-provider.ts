import { randomUUID } from 'node:crypto';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import type { TransactionResult, TransferPreview } from '../contracts/http.js';
import type {
  BroadcastOutcome,
  FinalityOutcome,
  FinalityRequest,
  WalletAddress,
  WalletBalance,
  WalletHistory,
  WalletNetwork,
  WalletProvider,
  WalletProviderHealth,
  WalletToken,
  TransferRequest,
} from './provider.js';

export const ARC_TESTNET_NETWORK = 'arc-testnet';
export const ARC_TESTNET_CHAIN_ID = 5042002n;
export const ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.io';
export const ARC_TESTNET_EXPLORER_URL = 'https://testnet.arcscan.app/tx/';
const CIRCLE_BLOCKCHAIN = 'ARC-TESTNET';
// Arc Testnet's native gas asset is USDC; the demo verified transfers against
// this token address on-chain (docs/arc-mini-demo.md).
const ARC_USDC_TOKEN_ADDRESS = '0x3600000000000000000000000000000000000000';
const TOKEN = 'USDC';
const TOKEN_DECIMALS = 18;
const MAX_FEE_UNITS = '0.1';
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const EVM_TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/u;
const BROADCAST_POLL_INTERVAL_MS = 1_000;
const BROADCAST_TIMEOUT_MS = 20_000;
const FINALITY_POLL_INTERVAL_MS = 2_000;
const FINALITY_TIMEOUT_MS = 120_000;

export type CircleArcProviderConfig = {
  apiKey: string;
  entitySecret: string;
  senderWalletId: string;
};

export type CircleArcProviderOptions = {
  rpcUrl?: string;
  rpc?: (method: string, params?: unknown[]) => Promise<unknown>;
  client?: CircleClient;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

export type CircleClient = {
  getWallet(input: { id: string }): Promise<{ data?: { wallet?: CircleWallet } }>;
  estimateTransferFee(input: Record<string, unknown>): Promise<{ data?: { medium?: { networkFee?: unknown } } }>;
  createTransaction(input: Record<string, unknown>): Promise<{ data?: { id?: unknown } }>;
  getTransaction(input: { id: string }): Promise<{ data?: { transaction?: CircleTransaction } }>;
};

type CircleWallet = {
  id?: unknown;
  blockchain?: unknown;
  address?: unknown;
};

type CircleTransaction = {
  txHash?: unknown;
  state?: unknown;
};

export class CircleArcConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircleArcConfigError';
  }
}

export function readCircleArcProviderConfig(
  environment: NodeJS.ProcessEnv = process.env,
): CircleArcProviderConfig {
  const apiKey = environment.CIRCLE_API_KEY?.trim();
  const entitySecret = environment.CIRCLE_ENTITY_SECRET?.trim();
  const senderWalletId = environment.CIRCLE_SENDER_WALLET_ID?.trim();
  if (!apiKey || !entitySecret || !senderWalletId) {
    throw new CircleArcConfigError(
      'Circle Arc provider requires CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, and CIRCLE_SENDER_WALLET_ID.',
    );
  }
  if (!/^[a-fA-F0-9]{64}$/u.test(entitySecret)) {
    throw new CircleArcConfigError('CIRCLE_ENTITY_SECRET must be 64 hexadecimal characters.');
  }
  return { apiKey, entitySecret, senderWalletId };
}

function plainUnits(units: string, decimals: number): string {
  const value = BigInt(units).toString().padStart(decimals + 1, '0');
  const fraction = value.slice(-decimals).replace(/0+$/u, '');
  return value.slice(0, -decimals) + (fraction ? `.${fraction}` : '');
}

export class CircleArcProvider implements WalletProvider {
  public readonly id = 'circle-arc';
  public readonly mode = 'live' as const;

  private readonly rpcUrl: string;
  private readonly rpc: (method: string, params?: unknown[]) => Promise<unknown>;
  private readonly client: CircleClient;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  public constructor(
    private readonly config: CircleArcProviderConfig,
    options: CircleArcProviderOptions = {},
  ) {
    this.rpcUrl = options.rpcUrl ?? ARC_TESTNET_RPC_URL;
    this.rpc = options.rpc ?? ((method, params = []) => arcRpcCall(this.rpcUrl, method, params));
    this.client = options.client ?? (initiateDeveloperControlledWalletsClient({
      apiKey: config.apiKey,
      entitySecret: config.entitySecret,
    }) as unknown as CircleClient);
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.now = options.now ?? Date.now;
  }

  public async health(): Promise<WalletProviderHealth> {
    try {
      const address = await this.getAddress({ network: ARC_TESTNET_NETWORK, wallet: this.config.senderWalletId });
      if (!EVM_ADDRESS.test(address.address)) throw new Error('Circle wallet address is invalid.');
      return { status: 'healthy' };
    } catch (error) {
      return {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : 'Circle Arc provider unavailable.',
      };
    }
  }

  public async listNetworks(): Promise<WalletNetwork[]> {
    return [{ network: ARC_TESTNET_NETWORK, kind: 'testnet' }];
  }

  public async listTokens(network?: string): Promise<WalletToken[]> {
    this.assertNetwork(network ?? ARC_TESTNET_NETWORK);
    return [{ network: ARC_TESTNET_NETWORK, token: TOKEN, decimals: TOKEN_DECIMALS }];
  }

  public async getAddress(context: { network: string; wallet: string }): Promise<WalletAddress> {
    this.assertNetwork(context.network);
    const wallet = await this.requestWallet(this.config.senderWalletId);
    return { network: ARC_TESTNET_NETWORK, address: wallet.address };
  }

  public async getBalance(query: { network: string; token?: string; wallet: string }): Promise<WalletBalance> {
    this.assertNetwork(query.network);
    const address = (await this.getAddress({ network: query.network, wallet: this.config.senderWalletId })).address;
    const wei = (await this.rpc('eth_getBalance', [address, 'latest'])) as string;
    if (typeof wei !== 'string' || !/^0x[0-9a-fA-F]+$/u.test(wei)) {
      throw new Error('Arc RPC returned an invalid balance.');
    }
    return {
      network: ARC_TESTNET_NETWORK,
      token: query.token ?? TOKEN,
      address,
      balance: plainUnits(BigInt(wei).toString(), TOKEN_DECIMALS),
    };
  }

  public async getHistory(query: { network: string; token?: string; wallet: string }): Promise<WalletHistory> {
    this.assertNetwork(query.network);
    // History is out of scope for this slice: the provider reports an empty
    // ledger instead of fabricating entries.
    return { network: ARC_TESTNET_NETWORK, transactions: [] };
  }

  public async previewTransfer(request: TransferRequest): Promise<TransferPreview> {
    this.assertNetwork(request.network);
    await this.assertRecipient(request.to);
    const estimate = await this.client.estimateTransferFee({
      walletId: this.config.senderWalletId,
      tokenAddress: ARC_USDC_TOKEN_ADDRESS,
      blockchain: CIRCLE_BLOCKCHAIN,
      destinationAddress: request.to,
      amount: [request.amount],
    });
    const fee = estimate.data?.medium?.networkFee;
    if (typeof fee !== 'string' || !/^\d+(\.\d+)?$/u.test(fee)) {
      throw new Error('Circle returned no usable fee evidence.');
    }
    if (Number(fee) > Number(MAX_FEE_UNITS)) {
      throw new Error(`Estimated fee ${fee} exceeds the ${MAX_FEE_UNITS} USDC policy.`);
    }
    return {
      network: ARC_TESTNET_NETWORK,
      token: request.token,
      recipient: request.to,
      amount: request.amount,
      estimatedFee: fee,
    };
  }

  public async broadcastTransfer(request: TransferRequest): Promise<BroadcastOutcome> {
    this.assertNetwork(request.network);
    await this.assertRecipient(request.to);
    const idempotencyKey = request.previewId ?? randomUUID();
    let transactionId: string;
    try {
      const response = await this.client.createTransaction({
        walletId: this.config.senderWalletId,
        blockchain: CIRCLE_BLOCKCHAIN,
        tokenAddress: ARC_USDC_TOKEN_ADDRESS,
        destinationAddress: request.to,
        amount: [request.amount],
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey,
        refId: idempotencyKey,
      });
      const id = response.data?.id;
      if (typeof id !== 'string' || id.length === 0) throw new Error('Circle returned no transaction id.');
      transactionId = id;
    } catch (error) {
      const status = (error as { status?: unknown }).status;
      const code = (error as { code?: unknown }).code;
      if (status === 400 && code === 2) {
        return { kind: 'not_dispatched', reason: 'Circle rejected the transfer parameters; nothing was dispatched.' };
      }
      return {
        kind: 'uncertain',
        reason: error instanceof Error ? error.message : 'Circle dispatch outcome is unknown.',
      };
    }
    const deadline = this.now() + BROADCAST_TIMEOUT_MS;
    while (this.now() < deadline) {
      await this.sleep(BROADCAST_POLL_INTERVAL_MS);
      try {
        const transaction = (await this.client.getTransaction({ id: transactionId })).data?.transaction;
        const hash = transaction?.txHash;
        if (typeof hash === 'string' && EVM_TRANSACTION_HASH.test(hash)) {
          return {
            kind: 'submitted',
            transaction: {
              network: ARC_TESTNET_NETWORK,
              transactionHash: hash,
              explorerUrl: `${ARC_TESTNET_EXPLORER_URL}${hash}`,
            },
          };
        }
        if (['FAILED', 'CANCELLED', 'DENIED'].includes(transaction?.state as string)) {
          return { kind: 'not_dispatched', reason: `Circle transaction entered state ${String(transaction?.state)}.` };
        }
      } catch {
        // Keep polling until the deadline; a transient lookup failure must not
        // turn into a duplicate broadcast.
      }
    }
    return {
      kind: 'uncertain',
      reason: `Circle accepted the transfer (transaction id ${transactionId}) but no hash was available before the deadline. Do not re-broadcast.`,
    };
  }

  public async waitForFinality(request: FinalityRequest, signal?: AbortSignal): Promise<FinalityOutcome> {
    const transaction = 'transaction' in request ? request.transaction : request;
    const hash = transaction.transactionHash;
    if (!EVM_TRANSACTION_HASH.test(hash)) {
      throw new Error('Arc finality requires a valid transaction hash.');
    }
    const deadline = this.now() + FINALITY_TIMEOUT_MS;
    while (this.now() < deadline) {
      if (signal?.aborted) throw new Error('Arc finality wait was aborted.');
      const [onchain, receipt] = (await Promise.all([
        this.rpc('eth_getTransactionByHash', [hash]),
        this.rpc('eth_getTransactionReceipt', [hash]),
      ])) as Array<Record<string, unknown> | null>;
      const status = receipt?.status;
      if (status === '0x1') {
        return { status: 'confirmed', transactionHash: hash, network: ARC_TESTNET_NETWORK };
      }
      if (status === '0x0') {
        return { status: 'reverted', transactionHash: hash, network: ARC_TESTNET_NETWORK };
      }
      await this.sleep(FINALITY_POLL_INTERVAL_MS);
    }
    throw new Error('Arc transaction was not confirmed before the finality deadline.');
  }

  public async close(): Promise<void> {}

  private async requestWallet(walletId: string): Promise<{ id: string; address: string }> {
    const wallet = (await this.client.getWallet({ id: walletId })).data?.wallet;
    if (wallet?.id !== walletId) throw new Error('Circle wallet identity mismatch.');
    const address = wallet.address;
    if (typeof address !== 'string' || !EVM_ADDRESS.test(address)) {
      throw new Error('Circle wallet address is invalid.');
    }
    return { id: walletId, address };
  }

  private assertNetwork(network: string): void {
    if (network !== ARC_TESTNET_NETWORK) {
      throw new Error(`Circle Arc provider only supports network ${ARC_TESTNET_NETWORK}.`);
    }
  }

  private senderAddress: Promise<string> | undefined;

  private async getSenderAddress(): Promise<string> {
    this.senderAddress ??= this.requestWallet(this.config.senderWalletId).then((wallet) => wallet.address);
    return this.senderAddress;
  }

  private async assertRecipient(to: string): Promise<void> {
    if (!EVM_ADDRESS.test(to)) throw new Error('Recipient must be a valid EVM address.');
    const normalized = to.toLocaleLowerCase('en-US');
    if (/^0x0{40}$/u.test(normalized) || /^0x0{36}(0000|dead)$/iu.test(normalized)) {
      throw new Error('Refusing transfer to a zero or burn address.');
    }
    const sender = (await this.getSenderAddress()).toLocaleLowerCase('en-US');
    if (sender === normalized) throw new Error('Refusing transfer to the sender wallet.');
  }
}

async function arcRpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[] = [],
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as { error?: unknown; result?: unknown };
  if (!response.ok || data.error || !('result' in data)) throw new Error('Arc RPC unavailable.');
  return data.result;
}
