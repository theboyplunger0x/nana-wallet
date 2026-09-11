# Nana Wallet

## Quick demo: Circle on Arc Testnet

For Rama or their agent: follow [the demo README](scripts/arc-demo/README.md).
It includes installation, private credential loading, local startup, commands,
onchain verification, and troubleshooting. It requires no OpenAI, LiveKit, or Docker.
This written demo is independent from the WDK product documented below.

```sh
npm ci --ignore-scripts
npm run demo:arc:configure
npm run demo:arc
```

Open `http://127.0.0.1:8787`. Credentials are loaded locally and are not committed
to Git. Do not run provisioning or register another entity secret to use the
existing wallets.

An Argentine agentic wallet designed for older adults and people with disabilities. Nana reduces the complexity of a traditional wallet: the user can ask for an action in everyday language, clearly review what is about to happen, and confirm before moving money.

> **Status:** Aleph Hackathon 2026 delivery for Track 1 — Build with the WDK CLI. The repository contains a working frontend and an HTTP WDK backend with a safe fixture mode by default and an explicit live mode for a test wallet on Sepolia.

## Aleph Hackathon 2026 — WDK Track

Official track: [WDK Track](https://hacki.crecimiento.build/h/aleph-hackathon-2026/tracks/wdk-track).

Nana is an agentic wallet for older adults and people with disabilities. The user can ask for a transfer in everyday language, review the network, token, recipient, amount, and fee, and explicitly confirm before the agent attempts to execute it. The backend connects the agent to the `wdk-mcp` tools; fixture mode reproduces the flow without funds or keys, while `WDK_TOOLS_SOURCE=live` enables integration with a local test WDK wallet.

### WDK used

The WDK packages declared in [`package.json`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/package.json#L30-L32) are:

- `@tetherto/wdk@1.0.0-beta.14` — WDK runtime.
- `@tetherto/wdk-cli@1.0.0-beta.2` — CLI and MCP process (`wdk-mcp`).
- `@tetherto/wdk-wallet-evm@1.0.0-beta.11` — EVM wallet.

Permalinks to the WDK integration at public commit [`71509cc`](https://github.com/theboyplunger0x/nana-wallet/commit/71509cc1957d90fedd95255f0a1241fddbf0ff0b):

- [`src/wdk/mcp-client.ts#L117-L118`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/wdk/mcp-client.ts#L117-L118) — resolves the bundled WDK MCP process.
- [`src/wdk/mcp-client.ts#L213-L220`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/wdk/mcp-client.ts#L213-L220) — configures the spawn of the bundled `wdk-mcp` process over stdio.
- [`src/agent/wdk-tools.ts#L39-L49`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/agent/wdk-tools.ts#L39-L49) — propagates `WDK_INDEXER_API_KEY` to the WDK process without exposing it.
- [`src/agent/wdk-tools.ts#L72-L103`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/agent/wdk-tools.ts#L72-L103) — exposes the WDK tools to the agent, including `send_token`.
- [`src/api/wallet.ts#L17-L50`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/api/wallet.ts#L17-L50) and [`#L52-L100`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/api/wallet.ts#L52-L100) — adapts the official WDK balance and history responses to the HTTP contract.
- [`src/agent/wallet-agent.ts#L147-L211`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/agent/wallet-agent.ts#L147-L211) and [`#L394-L455`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/agent/wallet-agent.ts#L394-L455) — applies the live policy and the preview/confirmation guards to `send_token`.
- [`src/wdk/transaction-receipt.ts#L164-L212`](https://github.com/theboyplunger0x/nana-wallet/blob/71509cc1957d90fedd95255f0a1241fddbf0ff0b/src/wdk/transaction-receipt.ts#L164-L212) — verifies the Sepolia chain ID, hash, receipt, and confirmed/reverted status after broadcast.

### Demo

- **DELIVERY BLOCKER — demo video:** TODO — add the public video URL here before submitting the application. No link is invented while no real one exists.
- **Reference network:** Ethereum Sepolia.
- **Demo token:** WDK alias `USDT` (test USD₮).
- **Token contract:** `0xc4DCC311c028e341fd8602D8eB89c5de94625927`.
- **Reproducible safe mode:** `WDK_TOOLS_SOURCE=fixture` (default value; requires no wallet, unlock, or broadcast).

The live demo requires a dedicated wallet, unlocked by the person running the test and funded with limited amounts. This README contains no seeds, private keys, or credentials.

## Experience

The application is organized into three simple spaces:

- **My profile:** family and saved contacts, address book, invoices, and personal data.
- **Nana:** text or voice agent that interprets requests and prepares actions to confirm.
- **My money:** available balance, accounts, and movements.

The payment flow always shows the recipient, amount, source account, and warnings before enabling confirmation. Confirmations use an idempotency key and distinguish a definitive rejection from an ambiguous network error to avoid incorrectly reporting that an operation failed.

## Stack

- React 19 and TypeScript
- TanStack Start, Router, and Query
- Tailwind CSS 4 and shadcn/ui
- Capacitor 8 for Android and iOS
- MSW for the local simulated API
- Vitest and Testing Library
- WDK backend with Node.js, Fastify, and Tether WDK/MCP

## Structure

There are two clearly separated parts: the backend lives at the root (`src/`) and the frontend in `apps/nana-wallet/`. The backend defines the HTTP contract (zod) and the frontend replicates it by hand; the boundary is never crossed.

```text
.
├── src/                        # Backend — Node 22, Fastify, LiveKit Agents, WDK/MCP, Supabase
│   ├── agent/                  # Agent definition, tools, instructions (LLM/deterministic)
│   ├── api/                    # HTTP routes (health, wallet, conversations, voice)
│   ├── wdk/                    # WDK MCP client, transaction receipt, and direct reads
│   ├── wallet/                 # Wallet providers (fixture by default / live through WDK)
│   ├── conversations/          # Session state, language, intents, financial task register
│   ├── livekit/                # Voice worker (native AgentSession, adapters, revision publisher)
│   ├── memory/                 # Recipient memory (embeddings, repository, runtime, tools)
│   ├── auth/                   # Identity and Ed25519 bindings for live voice
│   ├── observability/          # Implemented observability (metrics, redacted traces)
│   ├── config/                 # env/process/livekit/privacy reading
│   ├── contracts/              # HTTP contracts (zod) — API source of truth
│   ├── db/                     # Database client and migrations (Supabase Postgres)
│   └── runtime/                # Shared runtime dependencies
├── apps/
│   └── nana-wallet/           # Web frontend and Capacitor projects
│       ├── android/           # Native Android project
│       ├── ios/               # Native iOS project
│       └── src/               # Routes, components, API, and mocks (replicates api-types.ts)
├── tests/                      # Backend suites: unit, integration, simulation, and e2e
├── evals/                      # Evalite: evaluates agent turns and voice
├── supabase/                   # Local config (major_version 17, port 54322) and migrations
├── examples/                   # Demo seeds (recipient-memory.seed.json)
└── docs/                       # Architecture, API, and runbooks
```

## Running locally

Requirements:

- Node.js `>=22.18.0` (per `package.json` -> `engines`)
- npm

From the repository root:

```sh
cd apps/nana-wallet
npm ci
npm run dev -- --host 0.0.0.0 --port 8083
```

Open [http://localhost:8083](http://localhost:8083). In development, MSW starts automatically and lets you walk through the demo without running a backend.

### Testing from a phone

The phone and the computer must be connected to the same Wi-Fi network. On macOS, check the local IP with:

```sh
ipconfig getifaddr en0
```

Then open `http://YOUR_IP:8083` from the phone's browser, for example `http://192.168.1.20:8083`.

## Mobile app with Capacitor

The mobile build produces a SPA in `dist/client` and copies it into the native projects. The web build stays separate and keeps the TanStack Start/Nitro output.

```sh
cd apps/nana-wallet

# Build the mobile bundle and sync Android and iOS
npm run mobile:sync

# Open the corresponding project
npm run mobile:android
npm run mobile:ios
```

Additional requirements:

- **Android:** Android Studio, Java, and the Android SDK.
- **iOS:** macOS and Xcode. The project uses Swift Package Manager.

To make a native app load the development server from the local network:

```sh
# Terminal 1
npm run dev -- --host 0.0.0.0 --port 8083

# Terminal 2
CAPACITOR_DEV_SERVER_URL=http://YOUR_IP:8083 npm run mobile:android
```

To produce a packaged app against a real backend, do not set `CAPACITOR_DEV_SERVER_URL` and configure an HTTPS URL:

```sh
VITE_API_URL=https://api.example.com npm run mobile:sync
```

Nana Wallet's native identifier is `com.nanawallet.app`.

## Environment variables

Copy the example file if you want to point the frontend at another server:

```sh
cd apps/nana-wallet
cp .env.example .env.local
```

```env
VITE_API_URL=http://localhost:3000
```

Never store seeds, private keys, or backend secrets in `VITE_*` variables: they end up inside the bundle the user receives.

## Useful commands

Run them from `apps/nana-wallet`:

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the development server. |
| `npm run build` | Produces the production web build. |
| `npm run build:mobile` | Produces the SPA used by Capacitor. |
| `npm run mobile:sync` | Builds and syncs the native projects. |
| `npm run mobile:doctor` | Checks the Capacitor installation. |
| `npm run lint` | Runs ESLint. |
| `npm run typecheck` | Validates TypeScript without emitting files. |
| `npm test` | Runs the tests with Vitest. |

## API and WDK integration

The frontend consumes a typed `/v1` contract for the agent, contacts, address book, invoices, balance, movements, and payment intents. During development, MSW answers those routes.

The WDK backend queries the wallet, prepares a transfer with `dryRun`, requests a separate confirmation, and only then can attempt to broadcast it in live mode. The technical reference is in [docs/architecture.md](docs/architecture.md).

Conversational confirmation is part of the demo experience, not a sufficient authorization boundary for production. A production version must keep the keys outside the agent and apply secure storage, local authentication, limits, and risk policies.

## Verification before pushing changes

```sh
cd apps/nana-wallet
npm run lint
npm run typecheck
npm test
npm run build
npm run mobile:sync
```

## Current scope

- The web interface and the Capacitor projects are implemented.
- Local flows work with simulated data.
- No real funds or private keys are included.
- The repository does not yet produce an APK or IPA automatically; those binaries are built with Android Studio or Xcode.
- By default, the frontend uses MSW for its local endpoints. The [live runbook](docs/local-live-runbook.md) connects the Nana chat to the WDK backend for the Sepolia integration test.

## WDK Transaction Agent backend

On top of the frontend, this repository includes an HTTP backend for WDK Track 1, which interprets natural-language instructions and operates with `wdk-mcp` through a `ToolLoopAgent`.

See the details in `docs/architecture.md`, `docs/api.md`, and `docs/demo-runbook.md`.

To run the full integration against the local Sepolia wallet, follow
the [local live runbook](docs/local-live-runbook.md). That is the only flow that
can broadcast a transaction; the default demo stays in fixture.

### Backend setup from a clean clone

```bash
git clone https://github.com/theboyplunger0x/nana-wallet.git
cd nana-wallet
cp .env.example .env
npm ci
```

The minimal evaluation flow uses the fixture and needs no Docker, wallet, or credentials. To also use the deterministic parser and avoid contacting a model provider:

```bash
AGENT_RUNTIME=deterministic WDK_TOOLS_SOURCE=fixture npm run dev
```

In another terminal, run the clean-clone verifications:

```bash
npm run typecheck
npm test
npm run build
```

With `AGENT_RUNTIME=deterministic WDK_TOOLS_SOURCE=fixture`, responses are local and deterministic: no credentials are requested, no wallet is required, and there is no broadcast.

To enable the local live integration from that same clone, follow the [live runbook](docs/local-live-runbook.md). If the `agent-dev` wallet does not exist yet, create it once (the full guide with steps and cautions is in [docs/create-wallet.md](docs/create-wallet.md)); then add the test token and unlock the wallet for 30 minutes:

```bash
npx wdk wallet create --name agent-dev
npx wdk token add '{"network":"sepolia","token":"USDT","symbol":"USD₮","decimals":6,"isNative":false,"address":"0xc4DCC311c028e341fd8602D8eB89c5de94625927"}'
npx wdk wallet unlock --name agent-dev --ttl 30
```

Do not run `wallet create` if `agent-dev` already exists. Fund that wallet with minimal amounts of Sepolia ETH for gas and of the test token; never copy a seed or secret into the repository. Configure `WDK_TOOLS_SOURCE=live`, `WDK_WALLET_NAME=agent-dev`, `WDK_NETWORK=sepolia`, `WDK_TOKEN=USDT`, `WDK_MAX_TRANSFER_AMOUNT=0.05`, and `WDK_ALLOWED_RECIPIENTS=<comma-separated approved EVM addresses>` in `.env`. The limit and the allowlist are mandatory and fail-closed: replace the example with the real approved Sepolia recipient before starting the backend. `WDK_INDEXER_API_KEY` is optional for transfers but required to query indexed history. Configure the frontend's backend URL according to the runbook. A live run can broadcast a real testnet transaction. The `npm run test:e2e:wdk-mcp` tests are read/metadata only and do not call `send_token`.

## Local backend with Docker

To start the backend and Postgres without `npm ci` or `tsx watch`, follow the
[Docker runbook](docs/local-docker-runbook.md). A single command starts the database
(pgvector) and the API:

```sh
docker compose --profile dev up -d --build
```

The API is available at `http://localhost:3000`. The database schema is applied with the
same steps as CI (roles + migrations via psql); the runbook details them. The voice
worker uses the same image behind the `worker` profile. This flow is
local: the Render/Supabase cloud deploy and the Android APK are separate work units.

For the RAG demo, set the following values in `.env` (the supplied UUID and
seed are demo data and contain no credential):

```dotenv
RECIPIENT_MEMORY_ENABLED=true
DATABASE_URL=postgresql://recipient_app@127.0.0.1:5432/wdk_agent
DATABASE_ADMIN_URL=postgresql://postgres@127.0.0.1:5432/wdk_agent
DEMO_USER_ID=11111111-1111-4111-8111-111111111111
RECIPIENT_MEMORY_SEED_FILE=examples/recipient-memory.seed.json
```

```bash
npm run db:migrate
npm run memory:prefetch
npm run db:seed
npm run dev
```

The first prefetch downloads the pinned embedding model into
`.cache/recipient-memory-model`; later starts reuse it. With the default
`WDK_TOOLS_SOURCE=fixture`, no wallet, unlock, or broadcast is required.

## What happens to a recipient reference

| User request | Safe result |
| --- | --- |
| `Mandale plata a Lucas` | Searches this demo user's recipient name and description. One exact Lucas may be selected. |
| `Mandale plata a Lucas el electricista` | Uses hybrid lexical + vector retrieval over the current user's names and descriptions; the response contains candidates, never addresses. |
| `Send money to my grandson` | Reads confirmed relationship facts, then still resolves one recipient record before address lookup. |
| Two plausible Lucas records | Asks a description-based question such as “Lucas (mi nieto) or Lucas (el electricista)?” No preview is created. |
| No match, stale record, DB/model failure | Stops before address lookup and before any WDK preview. |

Once there is one stable `recipientId` and `version`, `get_selected_recipient_address`
(takes no arguments) may obtain the current address internally. That exact string
is passed unchanged as `send_token.to`. The record is checked once before `dryRun: true` and again
before the matching approved `dryRun: false`; a changed, deleted, inactive, or
foreign record clears the selection and approval.

## RAG memory model

PostgreSQL 16 + pgvector holds the durable data. The local multilingual model
is `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` through
`@huggingface/transformers@4.2.0`, with 384-dimensional normalized embeddings.
No embedding API key is needed.

| Table | Purpose | Retrieval / privacy boundary |
| --- | --- | --- |
| `recipients` | `id`, `user_id`, name, normalized name, description, exact address, version, status, provenance, confirmation time, and a 384D embedding | Embeds only normalized name + description. Search returns id, version, name, description, evidence, and score — never address. |
| `user_memories` | User-relative facts such as `Lucas is my grandson`, kind, version, status, provenance, confirmation time, and a 384D embedding | Embeds the fact, returns minimal evidence, and is only a lead for recipient search. It is not identity proof. |

Both tables have tenant filters in each query plus PostgreSQL row-level security
under the restricted `recipient_app` role. This demo injects one UUID from
`DEMO_USER_ID`; there is deliberately no login surface yet. A production
deployment must replace that fixed demo identity with the authenticated
principal before enabling the feature.

### Memory tools

| Tool | Input | Result and boundary |
| --- | --- | --- |
| `search_recipients` | `{ query }` | Finds current-user candidates and may bind one ID/version to the session. Addresses are omitted. |
| `search_user_memory` | `{ query }` | Returns current-user relationship evidence only. |
| `get_selected_recipient_address` | *(no arguments)* | Returns the exact address for the recipient already selected and version-bound in this session. |
| `stage_user_memory` | Recipient draft or relationship fact | Stages exact user-provided content for five minutes; no data is yet written. |
| `write_user_memory` | `{ confirmationId }` | Consumes a single-use, unexpired confirmation and writes atomically. |

The session inspection endpoint never exposes a staged address or confirmation
ID. The tool may show an exact staged address to the user for confirmation, but
search output, embeddings, session inspection, and release evidence must not
contain it.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENCODE_GO_API_KEY` | — | API key for OpenCode Go (`opencode.ai/auth`), used as the model provider. |
| `OPENCODE_GO_BASE_URL` | `https://opencode.ai/zen/go/v1` | OpenCode Go-compatible API base URL. |
| `OPENCODE_GO_MODEL` | `deepseek-v4-flash` | Default conversational agent model. |
| `WDK_WALLET_NAME` | `agent-demo` | WDK wallet used by wallet tools. |
| `WDK_NETWORK` | `sepolia` | Default WDK network. |
| `WDK_TOKEN` | `USDT` | Default token alias. |
| `WDK_TOOLS_SOURCE` | `fixture` | `fixture` requires no WDK process; `live` starts the real `wdk-mcp` process. |
| `AGENT_RUNTIME` | `llm` | `llm` uses the conversational `ToolLoopAgent`; `deterministic` uses the parser-only path. |
| `PORT` | `3000` | Fastify HTTP port. |
| `RECIPIENT_MEMORY_ENABLED` | `false` | Feature flag. When false, no DB/model/memory tools are initialized and explicit-address transfers remain available. |
| `DATABASE_URL` | — | Application connection as `recipient_app`; required when memory is enabled. |
| `DATABASE_ADMIN_URL` | — | Migration-only admin connection. Do not use it for the application runtime. |
| `DEMO_USER_ID` | — | UUID tenant injected server-side for this demo; required when memory is enabled. |
| `RECIPIENT_MEMORY_MODEL_CACHE` | `.cache/recipient-memory-model` | Reusable local Transformers.js cache. |
| `RECIPIENT_MEMORY_SCORE_THRESHOLD` | `0.78` | Minimum semantic score for a non-exact candidate. |
| `RECIPIENT_MEMORY_SCORE_MARGIN` | `0.08` | Required lead over the runner-up; otherwise clarification is required. |
| `RECIPIENT_MEMORY_SEED_FILE` | — | Confirmed-only JSON seed consumed by `npm run db:seed`. |

`compose.yaml` starts PostgreSQL/pgvector and persists its data in the
`recipient_memory_postgres` volume. With the `dev` profile it also starts the backend API
(`docker compose --profile dev up -d --build`); see the
[Docker runbook](docs/local-docker-runbook.md). A pgvector-compatible Postgres
requires changing only the URLs above.

> **Two local database setups.** There are two ways to start Postgres:
>
> 1. `docker compose up -d db` — `pgvector/pgvector:0.8.1-pg16` on `127.0.0.1:5432`. It is the quick start for CI and the backend integration tests.
> 2. `npx supabase start` — the full local Supabase stack (Postgres 17 on `127.0.0.1:54322` + Studio, Inbucket). It is the one used by the demo/live runbooks.
> Both are valid depending on what you need; do not confuse them or assume one replaces the other.

The local fixture keeps `WDK_TOKEN=USDT` for deterministic responses.
To reproduce the track's live configuration, explicitly set
`WDK_NETWORK=sepolia` and `WDK_TOKEN=USDT`; that alias corresponds to the test
token whose contract is documented in the demo section.

## Approval and WDK

Recipient-memory enablement does not authorize a transfer. Every transfer
still follows:

1. Resolve one recipient safely, or ask for clarification.
2. Revalidate it and call WDK `send_token` with `dryRun: true`.
3. Return the network, token, recipient, amount, and estimated fee.
4. Require a separate `confirm` / `confirmar` in the same session.
5. Revalidate again and make one matching `dryRun: false` call.

`WDK_TOOLS_SOURCE=fixture` is the safe default. `live` starts the bundled MCP
server through `WdkMcpClient`; use only a human-unlocked, dedicated, limited-
funds test wallet. The read-only MCP smoke below never broadcasts.

## Verification and scripts

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e:wdk-mcp
```

`npm run test:e2e:wdk-mcp` starts the bundled MCP server, discovers the Track 1
tools, and reads Sepolia/USD₮ metadata only. It does not call `send_token`.
For the full recipient-memory rehearsal, follow
[the demo runbook](docs/demo-runbook.md); HTTP details are in
[the API reference](docs/api.md) and the architecture rationale is in
[the architecture document](docs/architecture.md).

Other useful commands:

- `npm run db:migrate` — applies each migration exactly once.
- `npm run db:seed` — embeds and inserts only explicitly confirmed seed data.
- `npm run memory:prefetch` — downloads/validates the local embedding model.
- `npm run test:wdk-manual` — opt-in manual live read/preview harness; broadcast
  remains separately gated and is not a CI command.
