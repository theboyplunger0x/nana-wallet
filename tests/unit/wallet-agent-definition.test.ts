import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWalletAgentDefinition,
  normalizeWalletToken,
  validateWalletTransferPolicy,
  type WalletAgentContext,
} from '../../src/agent/definition.js';
import { createSession, resetSessionStore } from '../../src/conversations/test-fixtures.js';
import { FixtureWalletProvider } from '../../src/wallet/fixture-provider.js';

function context(): WalletAgentContext {
  const session = createSession();
  return {
    conversationId: session.id,
    userId: '11111111-1111-4111-8111-111111111111',
    language: 'en',
    config: { wallet: 'agent-demo', network: 'sepolia', token: 'usdt-test' },
    session,
    wallet: new FixtureWalletProvider(),
  };
}

describe('wallet agent definition', () => {
  const previousSource = process.env.WDK_TOOLS_SOURCE;
  const previousMaximum = process.env.WDK_MAX_TRANSFER_AMOUNT;
  const previousAllowed = process.env.WDK_ALLOWED_RECIPIENTS;

  afterEach(() => {
    resetSessionStore();
    if (previousSource === undefined) delete process.env.WDK_TOOLS_SOURCE;
    else process.env.WDK_TOOLS_SOURCE = previousSource;
    if (previousMaximum === undefined) delete process.env.WDK_MAX_TRANSFER_AMOUNT;
    else process.env.WDK_MAX_TRANSFER_AMOUNT = previousMaximum;
    if (previousAllowed === undefined) delete process.env.WDK_ALLOWED_RECIPIENTS;
    else process.env.WDK_ALLOWED_RECIPIENTS = previousAllowed;
  });

  it('owns the existing prompt and stable wallet tool catalog', () => {
    const definition = createWalletAgentDefinition();
    const input = context();

    expect(definition.instructions(input)).toContain('default token: "usdt-test"');
    expect(definition.tools(input).map((tool) => tool.name)).toEqual([
      'get_networks',
      'list_tokens',
      'get_address',
      'get_balance',
      'get_history',
      'send_token',
    ]);
    expect(definition.tools(input).find((tool) => tool.name === 'send_token')?.inputSchema.safeParse({
      network: 'sepolia', token: 'USDT', to: '0x1234567890123456789012345678901234567890', amount: '10', wallet: 'agent-demo', dryRun: true,
    }).success).toBe(true);
  });

  it('normalizes generic tokens before invoking a reusable provider operation', async () => {
    const definition = createWalletAgentDefinition();
    const input = context();
    const getBalance = vi.spyOn(input.wallet, 'getBalance');
    const balance = definition.tools(input).find((tool) => tool.name === 'get_balance');

    await balance?.execute({ network: 'sepolia', token: 'USD₮' }, input);

    expect(getBalance).toHaveBeenCalledWith({
      network: 'sepolia', token: 'usdt-test', wallet: 'agent-demo',
    });
    expect(normalizeWalletToken('my-usdt', 'usdt-test')).toBe('my-usdt');
  });

  it('keeps live transfer policy in the canonical operation layer', () => {
    process.env.WDK_TOOLS_SOURCE = 'live';
    process.env.WDK_MAX_TRANSFER_AMOUNT = '1';
    process.env.WDK_ALLOWED_RECIPIENTS = '0x1234567890123456789012345678901234567890';

    expect(validateWalletTransferPolicy({
      network: 'sepolia', token: 'usdt-test', to: '0x1234567890123456789012345678901234567890', amount: '1', wallet: 'agent-demo', dryRun: true,
    }, context().config)).toBeUndefined();
  });
});

describe('validateWalletTransferPolicy circle-arc parity', () => {
  const previousSource = process.env.WDK_TOOLS_SOURCE;
  const previousMaximum = process.env.WDK_MAX_TRANSFER_AMOUNT;
  const previousAllowed = process.env.WDK_ALLOWED_RECIPIENTS;

  const allowedAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const otherAddress = '0x1234567890123456789012345678901234567890';

  function gateInput(overrides: Partial<Parameters<typeof validateWalletTransferPolicy>[0]> = {}) {
    return {
      network: 'sepolia',
      token: 'usdt-test',
      to: allowedAddress,
      amount: '0.05',
      wallet: 'agent-demo',
      dryRun: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    resetSessionStore();
    process.env.WDK_TOOLS_SOURCE = 'circle-arc';
    process.env.WDK_MAX_TRANSFER_AMOUNT = '0.05';
    process.env.WDK_ALLOWED_RECIPIENTS = allowedAddress.toLocaleUpperCase('en-US');
  });

  afterEach(() => {
    if (previousSource === undefined) delete process.env.WDK_TOOLS_SOURCE;
    else process.env.WDK_TOOLS_SOURCE = previousSource;
    if (previousMaximum === undefined) delete process.env.WDK_MAX_TRANSFER_AMOUNT;
    else process.env.WDK_MAX_TRANSFER_AMOUNT = previousMaximum;
    if (previousAllowed === undefined) delete process.env.WDK_ALLOWED_RECIPIENTS;
    else process.env.WDK_ALLOWED_RECIPIENTS = previousAllowed;
  });

  it.each(['WDK_MAX_TRANSFER_AMOUNT', 'WDK_ALLOWED_RECIPIENTS'] as const)(
    'fails closed when %s is missing under circle-arc',
    (variable) => {
      delete process.env[variable];
      expect(validateWalletTransferPolicy(gateInput(), context().config)).toMatchObject({
error: 'policy_rejected',
      });
    },
  );

  it('rejects an over-limit amount under circle-arc', () => {
    expect(validateWalletTransferPolicy(gateInput({ amount: '0.055' }), context().config)).toMatchObject({
      error: 'policy_rejected',
    });
  });

  it.each([
    { label: 'non-allowlisted', to: otherAddress },
    { label: 'zero', to: '0x0000000000000000000000000000000000000000' },
    { label: 'burn', to: '0x000000000000000000000000000000000000dEaD' },
    { label: 'malformed', to: 'not-an-address' },
  ])('rejects a $label recipient under circle-arc', ({ to }) => {
    expect(validateWalletTransferPolicy(gateInput({ to }), context().config)).toMatchObject({
      error: 'policy_rejected',
    });
  });

  it.each([
    { label: 'wallet', override: { wallet: 'other-wallet' } },
    { label: 'network', override: { network: 'arc-testnet' } },
    { label: 'token', override: { token: 'USDC' } },
  ])('rejects a mismatched $label under circle-arc', ({ override }) => {
    expect(validateWalletTransferPolicy(gateInput(override), context().config)).toMatchObject({
      error: 'policy_rejected',
    });
  });

  it('allows a matching transfer under circle-arc', () => {
    expect(validateWalletTransferPolicy(gateInput(), context().config)).toBeUndefined();
  });

  it('stays inert without a live transfer source', () => {
    process.env.WDK_TOOLS_SOURCE = 'fixture';
    delete process.env.WDK_MAX_TRANSFER_AMOUNT;
    delete process.env.WDK_ALLOWED_RECIPIENTS;
    expect(validateWalletTransferPolicy(gateInput(), context().config)).toBeUndefined();
  });
});
