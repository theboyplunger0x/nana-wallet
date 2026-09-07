import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerHealthRoutes } from '../../src/api/health.js';
import type { WalletProvider } from '../../src/wallet/provider.js';

// CAR-017: config values used to fake a circle-arc environment. The unhealthy
// provider reason below must never echo any of them through /health.
const FAKE_CREDENTIALS = {
  apiKey: 'CIRCLE_FAKE_API_KEY_VALUE_DO_NOT_LEAK',
  entitySecret: 'fake-entity-secret-hex-value-do-not-leak',
  walletId: 'fake-sender-wallet-id-do-not-leak',
};

function fakeWalletProvider(health: () => Promise<unknown>): WalletProvider {
  return {
    id: 'circle-arc',
    mode: 'live',
    health: vi.fn(health),
    listNetworks: vi.fn(async () => []),
    listTokens: vi.fn(async () => []),
    getAddress: vi.fn(async () => ({ network: 'arc-testnet', address: '0x1' })),
    getBalance: vi.fn(async () => ({ network: 'arc-testnet', address: '0x1', balance: '0' })),
    getHistory: vi.fn(async () => ({ network: 'arc-testnet', transactions: [] })),
    previewTransfer: vi.fn(async () => {
      throw new Error('not used');
    }),
    broadcastTransfer: vi.fn(async () => {
      throw new Error('not used');
    }),
    waitForFinality: vi.fn(async () => {
      throw new Error('not used');
    }),
    close: vi.fn(async () => undefined),
  } as unknown as WalletProvider;
}

async function healthBody(wallet: WalletProvider) {
  const app = Fastify();
  registerHealthRoutes(app, { wallet });
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    return response.json();
  } finally {
    await app.close();
  }
}

describe('GET /health provider field (additive, D5)', () => {
  const previous = new Map<string, string | undefined>([
    ['WDK_TOOLS_SOURCE', process.env.WDK_TOOLS_SOURCE],
    ['WDK_NETWORK', process.env.WDK_NETWORK],
    ['WDK_WALLET_NAME', process.env.WDK_WALLET_NAME],
  ]);

  beforeEach(() => {
    process.env.WDK_TOOLS_SOURCE = 'circle-arc';
    process.env.WDK_NETWORK = 'arc-testnet';
    process.env.WDK_WALLET_NAME = FAKE_CREDENTIALS.walletId;
  });

  afterEach(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('reports a healthy provider without a reason', async () => {
    const body = await healthBody(fakeWalletProvider(async () => ({ status: 'healthy' })));

    expect(body.provider).toEqual({ status: 'healthy' });
    expect(body.provider.reason).toBeUndefined();
    expect(body.mode).toBe('live');
    expect(body.network).toBe('arc-testnet');
    expect(body.status).toBe('ok');
  });

  it('reports an unavailable provider with a scrubbed reason and keeps the legacy fields intact', async () => {
    const body = await healthBody(
      fakeWalletProvider(async () => ({
        status: 'unavailable',
        reason: 'Arc RPC unreachable: connection refused while resolving the Circle wallet address.',
      })),
    );

    expect(body.provider).toEqual({
      status: 'unavailable',
      reason: 'Arc RPC unreachable: connection refused while resolving the Circle wallet address.',
    });
    expect(body.mode).toBe('live');
    expect(body.mcp).toBe('connected');
    expect(body.wallet).toBe('unlocked');
    expect(body.network).toBe('arc-testnet');
  });

  it('never leaks Circle credentials in an unhealthy provider reason (CAR-017)', async () => {
    const body = await healthBody(
      fakeWalletProvider(async () => ({
        status: 'unavailable',
        reason: 'Circle API rejected the request: parameter validation failed (code 2).',
      })),
    );

    const reason = JSON.stringify(body.provider);
    expect(reason).not.toContain(FAKE_CREDENTIALS.apiKey);
    expect(reason).not.toContain(FAKE_CREDENTIALS.entitySecret);
    expect(reason).not.toContain(FAKE_CREDENTIALS.walletId);
  });

  it('degrades to unavailable when the provider health check throws instead of leaking the error', async () => {
    const body = await healthBody(
      fakeWalletProvider(async () => {
        throw new Error(`Circle SDK exploded with ${FAKE_CREDENTIALS.entitySecret}`);
      }),
    );

    expect(body.provider).toEqual({ status: 'unavailable', reason: 'The wallet provider health check failed.' });
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain(FAKE_CREDENTIALS.entitySecret);
    expect(bodyText).not.toContain(FAKE_CREDENTIALS.apiKey);
  });
});

describe('GET /health fixture-mode parity (additive field is backward compatible)', () => {
  const previousSource = process.env.WDK_TOOLS_SOURCE;
  const previousNetwork = process.env.WDK_NETWORK;

  afterEach(() => {
    if (previousSource === undefined) delete process.env.WDK_TOOLS_SOURCE;
    else process.env.WDK_TOOLS_SOURCE = previousSource;
    if (previousNetwork === undefined) delete process.env.WDK_NETWORK;
    else process.env.WDK_NETWORK = previousNetwork;
  });

  it('keeps the fixture contract and adds a healthy provider field', async () => {
    process.env.WDK_TOOLS_SOURCE = 'fixture';
    process.env.WDK_NETWORK = 'sepolia';

    const body = await healthBody(fakeWalletProvider(async () => ({ status: 'healthy' })));

    expect(body).toMatchObject({
      status: 'ok',
      mode: 'fixture',
      mcp: 'connected',
      wallet: 'unlocked',
      network: 'sepolia',
      provider: { status: 'healthy' },
    });
  });
});
