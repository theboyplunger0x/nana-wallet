import { describe, expect, it } from 'vitest';
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_NETWORK,
  CircleArcProvider,
  CircleArcConfigError,
  readCircleArcProviderConfig,
  type CircleClient,
} from '../../src/wallet/circle-arc-provider.js';
import { createWalletProvider } from '../../src/runtime/dependencies.js';

const CONFIG = {
  apiKey: 'TEST_API_KEY:test:fixture',
  entitySecret: 'a'.repeat(64),
  senderWalletId: '11111111-1111-4111-8111-111111111111',
};
const SENDER_ADDRESS = '0x6983977dfa3fd16f8cb3a0e94c797ab4c7f06efc';
const RECIPIENT = '0x45b8eaeb93139bb31874f830dc66005fd0017eb8';
const HASH = `0x${'ab'.repeat(32)}`;

type FakeState = {
  chainId?: string;
  walletAddress?: string;
  walletIdResponse?: unknown;
  estimateFee?: string;
  createdTransactionId?: string;
  transactionHash?: string | null;
  transactionState?: string;
  receiptStatus?: string | null;
};

function fakeClient(state: FakeState): CircleClient {
  return {
    async getWallet({ id }) {
      if (state.walletIdResponse !== undefined) return { data: state.walletIdResponse as never };
      return { data: { wallet: { id, blockchain: 'ARC-TESTNET', address: state.walletAddress ?? SENDER_ADDRESS } } };
    },
    async estimateTransferFee() {
      return { data: { medium: { networkFee: state.estimateFee ?? '0.00001' } } };
    },
    async createTransaction() {
      if (state.createdTransactionId === undefined) {
        throw Object.assign(new Error('rejected'), { status: 400, code: 2 });
      }
      return { data: { id: state.createdTransactionId } };
    },
    async getTransaction({ id }) {
      return { data: { transaction: { id, txHash: state.transactionHash ?? null, state: state.transactionState ?? 'COMPLETE' } } };
    },
  };
}

function fakeRpc(state: FakeState) {
  return async (method: string) => {
    if (method === 'eth_chainId') return state.chainId ?? `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`;
    if (method === 'eth_getBalance') return `0x${(1_500_000n).toString(16)}`;
    if (method === 'eth_getTransactionReceipt') {
      return state.receiptStatus === null ? null : { status: state.receiptStatus ?? '0x1' };
    }
    if (method === 'eth_getTransactionByHash') return { hash: HASH };
    throw new Error(`unexpected rpc method ${method}`);
  };
}

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (milliseconds: number) => { time += milliseconds; },
  };
}

const instantClock = { now: () => 0, sleep: async (_milliseconds: number) => {} };

function provider(state: FakeState, clock = instantClock): CircleArcProvider {
  return new CircleArcProvider(CONFIG, { rpc: fakeRpc(state), client: fakeClient(state), ...clock });
}

describe('readCircleArcProviderConfig', () => {
  it('fails closed when any Circle credential is missing', () => {
    expect(() => readCircleArcProviderConfig({})).toThrow(CircleArcConfigError);
    expect(() => readCircleArcProviderConfig({ CIRCLE_API_KEY: 'k' })).toThrow(CircleArcConfigError);
    expect(() => readCircleArcProviderConfig({ CIRCLE_API_KEY: 'k', CIRCLE_ENTITY_SECRET: 'a'.repeat(64) })).toThrow(CircleArcConfigError);
  });

  it('rejects an entity secret that is not 64 hex characters', () => {
    expect(() => readCircleArcProviderConfig({
      CIRCLE_API_KEY: 'k',
      CIRCLE_ENTITY_SECRET: 'nothex',
      CIRCLE_SENDER_WALLET_ID: 'w',
    })).toThrow('64 hexadecimal');
  });

  it('accepts a complete configuration', () => {
    expect(readCircleArcProviderConfig({
      CIRCLE_API_KEY: 'k',
      CIRCLE_ENTITY_SECRET: 'a'.repeat(64),
      CIRCLE_SENDER_WALLET_ID: 'w',
    })).toEqual({ apiKey: 'k', entitySecret: 'a'.repeat(64), senderWalletId: 'w' });
  });
});

describe('createWalletProvider selection', () => {
  it('builds a CircleArcProvider when WDK_TOOLS_SOURCE=circle-arc', () => {
    const wallet = createWalletProvider({
      WDK_TOOLS_SOURCE: 'circle-arc',
      CIRCLE_API_KEY: 'k',
      CIRCLE_ENTITY_SECRET: 'a'.repeat(64),
      CIRCLE_SENDER_WALLET_ID: 'w',
    });
    expect(wallet.id).toBe('circle-arc');
    expect(wallet.mode).toBe('live');
  });
});

describe('CircleArcProvider reads', () => {
  it('reports the Arc Testnet network and USDC token', async () => {
    expect(await provider({}).listNetworks()).toEqual([{ network: ARC_TESTNET_NETWORK, kind: 'testnet' }]);
    expect(await provider({}).listTokens()).toEqual([{ network: ARC_TESTNET_NETWORK, token: 'USDC', decimals: 18 }]);
  });

  it('rejects unsupported networks', async () => {
    await expect(provider({}).getBalance({ network: 'sepolia', wallet: 'w' })).rejects.toThrow('arc-testnet');
  });

  it('reads the sender address and formats the native USDC balance', async () => {
    const address = await provider({}).getAddress({ network: ARC_TESTNET_NETWORK, wallet: 'w' });
    expect(address).toEqual({ network: ARC_TESTNET_NETWORK, address: SENDER_ADDRESS });
    const balance = await provider({}).getBalance({ network: ARC_TESTNET_NETWORK, wallet: 'w' });
    expect(balance.balance).toBe('0.0000000000015');
  });

  it('detects a wallet identity mismatch', async () => {
    const state: FakeState = { walletIdResponse: { wallet: { id: 'other-id', address: SENDER_ADDRESS } } };
    await expect(provider(state).getAddress({ network: ARC_TESTNET_NETWORK, wallet: 'w' })).rejects.toThrow('identity mismatch');
  });

  it('returns an empty history instead of fabricating entries', async () => {
    const history = await provider({}).getHistory({ network: ARC_TESTNET_NETWORK, wallet: 'w' });
    expect(history.transactions).toEqual([]);
  });
});

describe('CircleArcProvider transfers', () => {
  const request = {
    network: ARC_TESTNET_NETWORK,
    token: 'USDC',
    to: RECIPIENT,
    amount: '0.000001',
    wallet: 'agent-demo',
  };

  it('previews a transfer with Circle fee evidence', async () => {
    const preview = await provider({}).previewTransfer(request);
    expect(preview).toEqual({
      network: ARC_TESTNET_NETWORK,
      token: 'USDC',
      recipient: RECIPIENT,
      amount: '0.000001',
      estimatedFee: '0.00001',
    });
  });

  it('rejects a preview above the fee policy', async () => {
    await expect(provider({ estimateFee: '0.2' }).previewTransfer(request)).rejects.toThrow('exceeds');
  });

  it('refuses the sender wallet as recipient', async () => {
    await expect(provider({}).previewTransfer({ ...request, to: SENDER_ADDRESS })).rejects.toThrow('sender wallet');
  });

  it('refuses burn addresses', async () => {
    await expect(provider({}).previewTransfer({ ...request, to: `0x${'0'.repeat(36)}dead` })).rejects.toThrow('burn');
  });

  it('broadcasts, polls Circle for the hash, and reports the Arcscan explorer URL', async () => {
    const clock = fakeClock();
    const state: FakeState = { createdTransactionId: 'tx-1', transactionHash: HASH };
    const result = await provider(state, clock).broadcastTransfer(request);
    expect(result).toEqual({
      kind: 'submitted',
      transaction: {
        network: ARC_TESTNET_NETWORK,
        transactionHash: HASH,
        explorerUrl: `https://testnet.arcscan.app/tx/${HASH}`,
      },
    });
  });

  it('maps a Circle parameter rejection to not_dispatched', async () => {
    const result = await provider({}).broadcastTransfer(request);
    expect(result.kind).toBe('not_dispatched');
  });

  it('stays uncertain when no hash appears before the deadline', async () => {
    const clock = fakeClock();
    const state: FakeState = { createdTransactionId: 'tx-1', transactionHash: null };
    const result = await provider(state, clock).broadcastTransfer(request);
    expect(result.kind).toBe('uncertain');
    expect((result as { reason: string }).reason).toContain('Do not re-broadcast');
  });

  it('confirms finality on a successful Arc receipt', async () => {
    const finality = await provider({ receiptStatus: '0x1' }).waitForFinality({
      network: ARC_TESTNET_NETWORK,
      transactionHash: HASH,
      explorerUrl: 'https://testnet.arcscan.app/tx/0x',
    });
    expect(finality).toEqual({ status: 'confirmed', transactionHash: HASH, network: ARC_TESTNET_NETWORK });
  });

  it('reports reverted on a failed receipt', async () => {
    const finality = await provider({ receiptStatus: '0x0' }).waitForFinality({
      network: ARC_TESTNET_NETWORK,
      transactionHash: HASH,
      explorerUrl: 'https://testnet.arcscan.app/tx/0x',
    });
    expect(finality.status).toBe('reverted');
  });

  it('throws before the deadline when the receipt never arrives', async () => {
    const clock = fakeClock();
    const p = provider({ receiptStatus: null }, clock);
    await expect(p.waitForFinality({
      network: ARC_TESTNET_NETWORK,
      transactionHash: HASH,
      explorerUrl: 'https://testnet.arcscan.app/tx/0x',
    })).rejects.toThrow('finality deadline');
  });
});
