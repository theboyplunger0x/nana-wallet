import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWalletConversationService, type ConversationEvent } from '../../src/conversations/service.js';
import type { ConversationRepository } from '../../src/conversations/repository.js';
import type { ConversationSnapshot, ConversationState, WalletProgress } from '../../src/conversations/types.js';
import { CircleArcProvider, type CircleClient } from '../../src/wallet/circle-arc-provider.js';

/**
 * Typed conversation flow over a REAL CircleArcProvider wired to a fake Circle
 * HTTP transport and a fake Arc RPC — no network access. Drives the full
 * service path (previewTransfer -> resolveDecision -> runFinancialTransfer)
 * and asserts the circle-arc runtime end-to-end behavior, including the
 * explicit-uncertain states (CAR-006, CAR-007, CAR-008, CAR-009).
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RECIPIENT = '0x45b8eaeb93139bb31874f830dc66005fd0017eb8';
const RECIPIENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PREVIEW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HASH = `0x${'ab'.repeat(32)}`;

const PROVIDER_CONFIG = {
  apiKey: 'TEST_API_KEY:test:fixture',
  entitySecret: 'a'.repeat(64),
  senderWalletId: '22222222-2222-4222-8222-222222222222',
};
const SENDER_ADDRESS = '0x6983977dfa3fd16f8cb3a0e94c797ab4c7f06efc';

type CircleState = {
  createdTransactionId?: string;
  transactionHash?: string | null;
  receiptStatus?: string;
  /** When set, createTransaction throws this instead of dispatching. */
  createTransactionError?: unknown;
  /** Captures every createTransaction input for idempotency assertions. */
  createdTransactionInputs: Array<Record<string, unknown>>;
};

function fakeCircle(state: CircleState): CircleClient {
  return {
    async getWallet({ id }) {
      return { data: { wallet: { id, blockchain: 'ARC-TESTNET', address: SENDER_ADDRESS } } };
    },
    async estimateTransferFee() {
      return { data: { medium: { networkFee: '0.00001' } } };
    },
    async createTransaction(input: Record<string, unknown>) {
      state.createdTransactionInputs.push(input);
      if (state.createTransactionError) throw state.createTransactionError;
      if (state.createdTransactionId === undefined) {
        throw Object.assign(new Error('rejected'), { status: 400, code: 2 });
      }
      return { data: { id: state.createdTransactionId } };
    },
    async getTransaction({ id }) {
      return { data: { transaction: { id, txHash: state.transactionHash ?? null, state: 'COMPLETE' } } };
    },
  };
}

function fakeArcRpc(state: CircleState) {
  return async (method: string) => {
    if (method === 'eth_chainId') return `0x${(5042002n).toString(16)}`;
    if (method === 'eth_getTransactionReceipt') {
      if (state.receiptStatus === undefined) return null;
      return { status: state.receiptStatus, transactionHash: HASH };
    }
    throw new Error(`unexpected rpc method ${method}`);
  };
}

function circleArcProvider(state: CircleState): CircleArcProvider {
  // Instant virtual clock: the broadcast poll and the finality check resolve on
  // their first iteration without ever sleeping.
  return new CircleArcProvider(PROVIDER_CONFIG, {
    client: fakeCircle(state),
    rpc: fakeArcRpc(state),
    now: () => 0,
    sleep: async () => {},
  });
}

function recipientMemory() {
  return {
    userId: USER_ID,
    service: {
      getRecipientForVersion: async () => ({
        id: RECIPIENT_ID,
        userId: USER_ID,
        version: 1,
        address: RECIPIENT,
        name: 'Lucas',
        normalizedName: 'lucas',
        description: 'Friend',
        status: 'active',
        embeddingModelRevision: 'rev',
      }),
    },
  };
}

function repositoryFixture(): ConversationRepository {
  let snapshot: ConversationSnapshot = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: USER_ID,
    mode: 'typed',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    revision: 0,
    language: 'en',
    generation: 1,
    messages: [],
  };
  let transferStatus: 'previewed' | 'broadcasting' | 'submitted' | 'uncertain' | 'confirmed' | 'reverted' | 'receipt_invalid' | 'cancelled' | undefined;

  const repository = {
    async create() { return snapshot; },
    async get(requestUserId: string, id: string) {
      return requestUserId === USER_ID && id === snapshot.id ? { ...snapshot, messages: [...snapshot.messages] } : undefined;
    },
    async inspect(requestUserId: string, id: string) { return this.get(requestUserId, id); },
    async appendMessage(_requestUserId: string, _id: string, message: ConversationSnapshot['messages'][number]) {
      snapshot.messages.push(message);
    },
    async saveSnapshot(_requestUserId: string, incoming: ConversationSnapshot, _count: number) {
      snapshot = {
        ...incoming,
        pendingTransfer: incoming.pendingTransfer
          ? { ...incoming.pendingTransfer, previewId: incoming.pendingTransfer.previewId ?? PREVIEW_ID }
          : undefined,
        revision: incoming.revision + 1,
      };
      return snapshot;
    },
    async updateState(_requestUserId: string, _id: string, _revision: number, state: ConversationState) {
      snapshot = { ...snapshot, ...state, revision: snapshot.revision + 1 };
      return snapshot;
    },
    async setProgress(_requestUserId: string, _id: string, progress: WalletProgress) {
      snapshot = { ...snapshot, progress, revision: snapshot.revision + 1 };
      return snapshot;
    },
    async setPendingTransfer(_requestUserId: string, _id: string, transfer: NonNullable<ConversationSnapshot['pendingTransfer']>) {
      snapshot = { ...snapshot, pendingTransfer: { ...transfer, previewId: transfer.previewId ?? PREVIEW_ID }, revision: snapshot.revision + 1 };
      transferStatus = 'previewed';
      return snapshot;
    },
    async clearPendingTransfer() {
      transferStatus = 'cancelled';
      snapshot = { ...snapshot, pendingTransfer: undefined, transferResolutionState: undefined, revision: snapshot.revision + 1 };
      return snapshot;
    },
    async cancelPendingTransfer(_requestUserId: string, _id: string, previewId: string) {
      if (transferStatus !== 'previewed' || snapshot.pendingTransfer?.previewId !== previewId) return 'stale_preview' as const;
      transferStatus = 'cancelled';
      snapshot = { ...snapshot, pendingTransfer: undefined, revision: snapshot.revision + 1 };
      return 'cancelled' as const;
    },
    async claimPendingTransfer() {
      if (!snapshot.pendingTransfer) return { status: 'missing' as const };
      if (transferStatus === 'broadcasting') return { status: 'broadcasting' as const };
      if (transferStatus === 'uncertain') return { status: 'uncertain' as const };
      transferStatus = 'broadcasting';
      snapshot = { ...snapshot, transferResolutionState: 'broadcasting', revision: snapshot.revision + 1 };
      const claimed = snapshot.pendingTransfer;
      if (!claimed) return { status: 'missing' as const };
      return { status: 'claimed' as const, transfer: { ...claimed, previewId: claimed.previewId! } };
    },
    async releasePendingTransferClaim() {
      transferStatus = 'previewed';
      snapshot = { ...snapshot, transferResolutionState: undefined };
    },
    async markPendingTransferUncertain() {
      transferStatus = 'uncertain';
      snapshot = { ...snapshot, transferResolutionState: 'uncertain', revision: snapshot.revision + 1 };
    },
    async setLastTransactionHash(_requestUserId: string, _id: string, hash: string) {
      snapshot = { ...snapshot, lastTransactionHash: hash };
    },
    async markTransferSubmitted(_requestUserId: string, _id: string, hash: string) {
      transferStatus = 'submitted';
      snapshot = { ...snapshot, lastTransactionHash: hash, revision: snapshot.revision + 1 };
    },
    async finalizeTransfer(_requestUserId: string, _id: string, result: { status: 'confirmed' | 'reverted' | 'receipt_invalid'; transactionHash: string }) {
      transferStatus = result.status;
      snapshot = { ...snapshot, pendingTransfer: undefined, transferResolutionState: undefined, lastTransactionHash: result.transactionHash, revision: snapshot.revision + 1 };
    },
    async setMode() { return snapshot.revision + 1; },
    async acquireLiveLease() { throw new Error('not used'); },
    async renewLiveLease() { return false; },
    async releaseLiveLease() { return false; },
  };

  return repository as unknown as ConversationRepository;
}

async function collect(iterable: AsyncIterable<ConversationEvent>): Promise<ConversationEvent[]> {
  const events: ConversationEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function completedResult(events: ConversationEvent[]) {
  const completed = [...events].reverse().find((event) => event.type === 'turn-completed');
  if (!completed) throw new Error('no turn-completed event');
  return completed.result;
}

describe('fake-Circle typed transfer flow (circle-arc runtime)', () => {
  const previousEnv: Array<[string, string | undefined]> = [];

  function pin(name: string, value: string): void {
    previousEnv.push([name, process.env[name]]);
    process.env[name] = value;
  }

  beforeEach(() => {
    pin('WDK_TOOLS_SOURCE', 'circle-arc');
    pin('WDK_NETWORK', 'arc-testnet');
    pin('WDK_TOKEN', 'USDC');
    pin('WDK_WALLET_NAME', 'agent-demo');
    pin('WDK_MAX_TRANSFER_AMOUNT', '0.05');
    pin('WDK_ALLOWED_RECIPIENTS', RECIPIENT);
  });

  afterEach(() => {
    for (const [name, value] of previousEnv.reverse()) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    previousEnv.length = 0;
  });

  function buildService(state: CircleState) {
    const repository = repositoryFixture();
    const wallet = circleArcProvider(state);
    const service = createWalletConversationService({
      conversations: repository,
      wallet,
      memory: recipientMemory() as never,
    });
    return { repository, wallet, service };
  }

  async function preview(service: ReturnType<typeof createWalletConversationService>, repository: ConversationRepository) {
    const conversation = await repository.create(USER_ID);
    const previewResult = await service.previewTransfer({
      conversationId: conversation.id,
      userId: USER_ID,
      amount: '0.01',
      recipientId: RECIPIENT_ID,
      recipientVersion: 1,
    });
    expect(previewResult.status).toBe('confirmation_required');
    const persisted = await repository.get(USER_ID, conversation.id);
    const previewId = persisted?.pendingTransfer?.previewId;
    expect(previewId).toBe(PREVIEW_ID);
    return conversation.id;
  }

  it('previews, confirms, broadcasts, and confirms finality on Arc Testnet', async () => {
    const state: CircleState = {
      createdTransactionId: 'tx-1',
      transactionHash: HASH,
      receiptStatus: '0x1',
      createdTransactionInputs: [],
    };
    const { repository, service } = buildService(state);
    const conversationId = await preview(service, repository);

    const result = completedResult(await collect(service.resolveDecision({
      conversationId,
      userId: USER_ID,
      previewId: PREVIEW_ID,
      decision: 'confirm',
    })));

    expect(result).toMatchObject({ status: 'sent', transaction: { network: 'arc-testnet', transactionHash: HASH, explorerUrl: `https://testnet.arcscan.app/tx/${HASH}` } });
    // CAR-006: the persisted previewId reaches Circle as the idempotency key
    // and refId through toTransferRequest.
    expect(state.createdTransactionInputs).toHaveLength(1);
    expect(state.createdTransactionInputs[0]).toMatchObject({
      idempotencyKey: PREVIEW_ID,
      refId: PREVIEW_ID,
    });
    const final = await repository.get(USER_ID, conversationId);
    expect(final?.progress?.phase).toBe('completed');
    expect(final?.lastTransactionHash).toBe(HASH);
    expect(final?.pendingTransfer).toBeUndefined();
  });

  it('blocks the session as broadcast_uncertain when Circle fails mid-broadcast and never re-broadcasts on retry', async () => {
    const state: CircleState = {
      createTransactionError: new Error('Circle API unavailable.'),
      createdTransactionInputs: [],
    };
    const { repository, service } = buildService(state);
    const conversationId = await preview(service, repository);

    const first = completedResult(await collect(service.resolveDecision({
      conversationId,
      userId: USER_ID,
      previewId: PREVIEW_ID,
      decision: 'confirm',
    })));
    expect(first).toMatchObject({ status: 'error', code: 'broadcast_uncertain' });
    const uncertain = await repository.get(USER_ID, conversationId);
    expect(uncertain?.progress?.phase).toBe('uncertain');
    expect(uncertain?.transferResolutionState).toBe('uncertain');

    // A retry after an uncertain outcome must surface broadcast_uncertain and
    // must NOT dispatch a second createTransaction.
    const retry = completedResult(await collect(service.resolveDecision({
      conversationId,
      userId: USER_ID,
      previewId: PREVIEW_ID,
      decision: 'confirm',
    })));
    expect(retry).toMatchObject({ status: 'error', code: 'broadcast_uncertain' });
    expect(state.createdTransactionInputs).toHaveLength(1);
  });

  it('maps a reverted Arc receipt to transfer_reverted', async () => {
    const state: CircleState = {
      createdTransactionId: 'tx-1',
      transactionHash: HASH,
      receiptStatus: '0x0',
      createdTransactionInputs: [],
    };
    const { repository, service } = buildService(state);
    const conversationId = await preview(service, repository);

    const result = completedResult(await collect(service.resolveDecision({
      conversationId,
      userId: USER_ID,
      previewId: PREVIEW_ID,
      decision: 'confirm',
    })));

    expect(result).toMatchObject({ status: 'error', code: 'transfer_reverted' });
    const final = await repository.get(USER_ID, conversationId);
    expect(final?.progress?.phase).toBe('failed');
    expect(final?.lastTransactionHash).toBe(HASH);
  });
});
