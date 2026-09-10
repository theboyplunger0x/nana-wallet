import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerHealthRoutes } from "./api/health.js";
import { registerWalletRoutes } from "./api/wallet.js";
import { registerConversationRoutes } from "./api/conversations.js";
import {
  createConfiguredDatabaseClient,
  type DatabaseClient,
} from "./db/client.js";
import { PostgresConversationRepository } from "./conversations/postgres-repository.js";
import { createWalletConversationService } from "./conversations/service.js";
import { readRecipientMemoryConfig } from "./config/env.js";
import { registerVoiceRoutes, type VoiceRoutesOptions } from "./api/voice.js";
import { readLiveKitTokenIssuerConfig } from "./config/livekit.js";
import { issueRoomToken, type RoomTokenInput } from "./livekit/token-issuer.js";
import {
  createConfiguredWalletForUser,
  createCoreDependencies,
} from "./runtime/dependencies.js";
import {
  DemoIdentityProvider,
  type RequestIdentityProvider,
} from "./auth/identity.js";
import { ensureDemoSentinelUser } from "./auth/demo-sentinel.js";
import {
  PrivyIdentityError,
  PrivyIdentityProvider,
  readPrivyVerificationInputs,
} from "./auth/privy-identity.js";
import { registerMeRoutes } from "./api/me.js";
import {
  registerContactsRoutes,
  createContactsEmbedder,
} from "./api/contacts.js";
import { ContactsRepository } from "./memory/contacts-repository.js";
import { FinancialTaskRegistry } from "./conversations/financial-task-registry.js";
import {
  readApiProcessConfig,
  readIdentityProviderMode,
} from "./config/process.js";
import {
  getConfiguredRecipientMemoryRuntime,
  getMemoryRuntimeForUser,
} from "./memory/runtime.js";
import {
  EmbeddedWalletService,
  WalletUnavailableError,
} from "./wallet/embedded.js";
import {
  WalletBalancesService,
  createBalanceReader,
  readBalanceReadConfig,
} from "./wallet/balances.js";
import {
  createPrivyWalletApiClient,
  type PrivyWalletApiClient,
} from "./wallet/privy-client.js";
import { registerWalletsRoutes } from "./api/wallets.js";
import { readPrivyServerConfig } from "./config/privy-server.js";
import { PrivyServerClient } from "./wallet/privy-server-client.js";
import { createPrivyWalletHealthProvider } from "./wallet/privy-user-provider.js";
import type { FastifyRequest } from "fastify";

export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:8083",
  "http://127.0.0.1:8083",
];

export function resolveCorsOrigins(raw = process.env.CORS_ORIGINS): string[] {
  if (!raw?.trim()) return DEFAULT_CORS_ORIGINS;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildServer(options: { privyServer?: PrivyServerClient } = {}) {
  // 25MB matches the upstream Whisper transcription limit (see NAN_API docs).
  const app = Fastify({
    logger: !process.env.VITEST,
    bodyLimit: 25 * 1024 * 1024,
  });

  app.register(cors, {
    origin: resolveCorsOrigins(),
    // If-None-Match/If-Modified-Since back the ETag-based conversation state
    // reads (GET /v1/conversations/:id/state) used by the voice revision flow.
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "If-None-Match",
      "If-Modified-Since",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  // PMU-002/007: identity failures are 401 everywhere, never 500.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PrivyIdentityError) {
      reply.code(401);
      return reply.send({
        status: "error",
        message: "Authentication required.",
        code: "no_autenticado",
      });
    }
    throw error;
  });

  const core = createCoreDependencies();
  const config = readRecipientMemoryConfig();
  const identityProviderMode = readIdentityProviderMode();

  // PMU-001: build the sole identity provider from configuration.
  let identity: RequestIdentityProvider;
  let database: DatabaseClient | undefined;
  if (identityProviderMode === "privy") {
    const { appId, verificationKeyPem } = readPrivyVerificationInputs(
      process.env,
    );
    if (!config.databaseUrl)
      throw new Error("DATABASE_URL is required when IDENTITY_PROVIDER=privy.");
    // PMU-024: identity-only rollout — a funded singleton provider is already
    // rejected at config-read time (readApiProcessConfig).
    database = createConfiguredDatabaseClient();
    identity = new PrivyIdentityProvider({
      appId,
      verificationKeyPem,
      resolvePrivyDid: (did, displayName) =>
        database!
          .query<{ id: string }>(
            "SELECT users_ensure_for_privy_did($1, $2) AS id",
            [did, displayName ?? null],
          )
          .then((result) => {
            const row = result.rows[0];
            if (!row)
              throw new Error("users_ensure_for_privy_did returned no id");
            return row.id;
          }),
    });
  } else {
    identity = new DemoIdentityProvider(config.demoUserId ?? "");
    if (config.databaseUrl) database = createConfiguredDatabaseClient();
  }

  const resolveUserId = async (request: FastifyRequest): Promise<string> =>
    (await identity.resolve(request)).userId;

  const privyServerConfig = database
    ? readPrivyServerConfig(process.env)
    : undefined;
  const privyServer =
    options.privyServer ??
    (privyServerConfig
      ? new PrivyServerClient({
          appId: privyServerConfig.appId,
          appSecret: privyServerConfig.appSecret,
          baseUrl: privyServerConfig.baseUrl,
        })
      : undefined);
  const walletForUser = database
    ? createConfiguredWalletForUser(database, process.env, privyServer)
    : undefined;

  const healthWallet =
    identityProviderMode === "privy"
      ? createPrivyWalletHealthProvider(Boolean(privyServer))
      : core.walletReads;
  app.register(registerHealthRoutes, { wallet: healthWallet });
  // PMU-024: wallet reads authenticate in privy mode (public in demo for compatibility).
  app.register(registerWalletRoutes, {
    wallet: core.walletReads,
    ...(identityProviderMode === "privy" ? { resolveUserId } : {}),
    ...(walletForUser ? { walletForUser } : {}),
  });

  if (database) {
    const conversations = new PostgresConversationRepository(database);
    const financialTasks = new FinancialTaskRegistry();
    const memory =
      identityProviderMode === "demo"
        ? getConfiguredRecipientMemoryRuntime()
        : undefined;
    const service = createWalletConversationService({
      conversations,
      wallet: core.wallet,
      ...(walletForUser ? { walletForUser } : {}),
      financialTasks,
      contextRenewal: core.contextRenewal,
      // PMU-014: memory scoped to the RESOLVED per-request user in every mode;
      // the fixed demo runtime (if configured) is only a fallback.
      ...(memory ? { memory } : {}),
      memoryForUser: (userId) => getMemoryRuntimeForUser(userId),
    });

    // PMU-004: demo-mode startup provisions the sentinel before serving
    // requests, including the seed-before-server flow.
    if (identityProviderMode === "demo" && config.demoUserId) {
      const demoUserId = config.demoUserId;
      app.addHook("onReady", async () => {
        await ensureDemoSentinelUser(database!, demoUserId);
      });
    }

    app.addHook("onClose", async () => {
      await financialTasks.drain({ timeoutMs: 10_000 });
      if (core.walletReads !== core.wallet) await core.walletReads.close();
      await core.wallet.close();
      await database!.close();
    });

    app.register(registerConversationRoutes, {
      conversations,
      service,
      resolveUserId,
      ...(process.env.LIVE_VOICE_BINDING_PRIVATE_KEY
        ? { bindingPrivateKey: process.env.LIVE_VOICE_BINDING_PRIVATE_KEY }
        : {}),
    });

    // PMU-007: identity-only bootstrap.
    app.register(registerMeRoutes, { resolveUserId, database });

    // PMU-008..013: user-scoped contacts CRUD.
    app.register(registerContactsRoutes, {
      resolveUserId,
      contacts: new ContactsRepository(database),
      embedder: createContactsEmbedder(),
    });

    // PEW-001..014: user-scoped embedded wallet surface. The fixture Privy
    // client is the default (and the only mode allowed in privy identity
    // mode); the live wallet client fails closed without PRIVY_* credentials.
    // The server client is constructed ONLY when the server config is present
    // (app id + secret); otherwise sync/enrollment stay fixture-backed.
    const privyClient =
      identityProviderMode === "privy" && !privyServer
        ? unavailablePrivyWalletClient()
        : createPrivyWalletApiClient(process.env, {});
    const enrollment = privyServerConfig?.keyQuorumId
      ? { keyQuorumId: privyServerConfig.keyQuorumId }
      : undefined;
    // WP-008: the balances service shares the same own-binding resolver as
    // the wallet surface but NEVER receives sync/permission/sign methods.
    const embeddedWallet = new EmbeddedWalletService(
      database,
      privyClient,
      privyServer,
      enrollment,
    );
    app.register(registerWalletsRoutes, {
      resolveUserId,
      wallet: embeddedWallet,
      balances: new WalletBalancesService({
        resolveWallet: (userId) => embeddedWallet.getCurrentWallet(userId),
        reader: createBalanceReader(readBalanceReadConfig(process.env)),
      }),
    });
  } else {
    app.addHook("onClose", async () => {
      if (core.walletReads !== core.wallet) await core.walletReads.close();
      await core.wallet.close();
    });
  }

  // PMU-020: room tokens authenticate the caller and authorize the owned
  // conversation in privy mode; demo keeps the compatibility path.
  const voiceOptions: VoiceRoutesOptions = {};
  if (identityProviderMode === "privy") {
    voiceOptions.authorizeRoomToken = async (request, conversationId) => {
      const userId = await resolveUserId(request);
      const owned = database
        ? await new PostgresConversationRepository(database).get(
            userId,
            conversationId,
          )
        : undefined;
      // Missing and foreign conversations are indistinguishable: same 404.
      if (!owned) return { ok: false as const, reason: "not_found" as const };
      return {
        ok: true as const,
        identity: userId,
        roomName: `nani-${conversationId}`,
      };
    };
  }
  voiceOptions.liveKitTokenIssuer = {
    issue: (input: RoomTokenInput) =>
      issueRoomToken(
        {
          ...readLiveKitTokenIssuerConfig(),
          identity: input.identity ?? config.demoUserId ?? "",
        },
        input,
      ),
  };
  app.register(registerVoiceRoutes, voiceOptions);

  return app;
}

function unavailablePrivyWalletClient(): PrivyWalletApiClient {
  const unavailable = (): never => {
    throw new WalletUnavailableError(
      "Privy wallet operations require a configured server client.",
    );
  };
  return {
    mode: "live",
    async listWallets() {
      return unavailable();
    },
    async getWallet() {
      return unavailable();
    },
    async verifyOwnership() {
      return unavailable();
    },
    async createWallet() {
      return unavailable();
    },
    async readEffectivePolicy() {
      return unavailable();
    },
    async createGrantPolicy() {
      return unavailable();
    },
    async revokeGrantPolicy() {
      return unavailable();
    },
    async signTransaction() {
      return unavailable();
    },
  };
}

export function serverHost(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return environment.HOST ?? "127.0.0.1";
}

async function main() {
  const config = readApiProcessConfig();
  const app = buildServer();
  await app.listen({ port: config.port, host: config.host });
}

const isDirectRun = /server\.(ts|js)$/.test(process.argv[1] ?? "");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
