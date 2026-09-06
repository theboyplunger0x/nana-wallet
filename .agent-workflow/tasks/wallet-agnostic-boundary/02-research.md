# 02 — Research

Fecha: 2026-09-06 · Worktree `deploy-test-env` · Preguntas: `01-research-questions.md`

## 1. Mapa del boundary actual (scout: gentle-ai-explore)

### El seam existe y es limpio

`src/wallet/provider.ts:30` — `interface WalletProvider`:

- **Tipos de dominio neutros** (sin imports de WDK): `WalletContext`,
  `WalletNetwork`, `WalletToken`, `WalletAddress`, `WalletBalance`,
  `WalletHistory`, `WalletBalanceQuery`, `WalletHistoryQuery`,
  `TransferRequest` (derivado de `contracts/http.ts`), `BroadcastOutcome`
  (`submitted|uncertain|not_dispatched`), `FinalityOutcome`
  (`confirmed|reverted|receipt_invalid`).
- **Métodos**: `health`, `listNetworks`, `listTokens`, `getAddress`,
  `getBalance`, `getHistory`, `previewTransfer → TransferPreview`,
  `broadcastTransfer → BroadcastOutcome`, `waitForFinality → FinalityOutcome`,
  `close`.
- Implementaciones: `WdkWalletProvider` (`wdk-provider.ts:20`, `id='wdk-mcp'`,
  mode live) y `FixtureWalletProvider` (`fixture-provider.ts:24`).

### Módulos YA agnósticos (no se tocan)

- `src/conversations/service.ts` — solo `WalletProvider`.
- `src/livekit/realtime-tools/create-realtime-tools.ts` — solo `WalletProvider`
  (voz incluida).
- `src/conversations/financial-task-registry.ts` — agnóstico total.
- `src/wdk/*` es la capa adapter de WDK (no reutilizar para otro provider).

### Los 4 leaks WDK a neutralizar

1. **Receipt waiter bypass** — `agent/wallet-agent.ts:637` usa
   `defaultTransactionReceiptWaiter` (`src/wdk/transaction-receipt.ts`,
   EVM/Sepolia RPC directo) en el path de confirmación de texto, en vez de
   `walletProvider.waitForFinality`. Además hay dos shapes divergentes de
   finality (`TransactionReceiptOutcome` vs `FinalityOutcome`).
2. **Raw-shape parsing en la API** — `api/wallet.ts:20-118`
   (`normalizeWalletBalance`/`normalizeWalletHistory`) re-parsea shapes crudos
   de WDK (`history.transfers`, base units) en los endpoints REST, bypassing el
   tipo neutro del provider.
3. **`agent/definition.ts`** — importa `decodeMcpText` de `src/wdk/mcp-client.ts`
   (parsing MCP en la capa de agent) y hardcodea
   `https://sepolia.etherscan.io/tx/...`.
4. **Naming `WDK_*` disperso** — envs y prompt en `instructions.ts` (config +
   texto "powered by WDK"), `definition.ts` (`validateWalletTransferPolicy`),
   `wallet-agent.ts` (`validateLiveTransferPolicy`), `health.ts`,
   `dependencies.ts`. La policy de transferencia está implementada 3 veces
   (duplicación con mismas reglas).

### Otros hallazgos

- Selección de provider: `runtime/dependencies.ts:46-53`
  (`WDK_TOOLS_SOURCE === 'live'` ? Wdk : Fixture). En modo fixture, los reads
  REST igual usan `WdkWalletProvider` (59-62) — inconsistencia a resolver.
- Tipos débiles: `WalletHistory.transactions` es
  `Array<Record<string,string>>` pese a existir `WalletTransaction` tipado en
  `contracts/http.ts`; `FinalityOutcome.network` hardcodea `'sepolia'`.
- `src/wdk/direct-wallet-reads.ts` está huérfano (nadie lo importa).
- `scripts/arc-demo/` ya integra `@circle-fin/developer-controlled-wallets`
  (demo Circle Arc independiente) — prior art de un segundo proveedor en repo.

## 2. Panorama de proveedores (research externo, 2026-09)

### Turnkey — signing primitive, agentic-first

- **Modelo**: infraestructura de key custody en TEEs verificables; es una
  primitiva de firma sobre la que se construye, no un bundle.
- **Agentic wallets**: producto dedicado — wallets no-custodiales operadas por
  agentes con **policies granulares** (qué puede firmar, límites, allowlists,
  revocación) y "delegated agent signing" con autoridad scoped. Signing <100ms.
- **Server-side**: API keys nativas para backend (`@turnkey/sdk-server`), EVM
  vía `@turnkey/viem` (`createAccount`) o `@turnkey/ethers` (`TurnkeySigner`).
- **Pricing**: free start (hasta 1k wallets, 25 firmas/mes gratis, $0.10/firma
  luego); Growth $99/mo ($0.05/firma); enterprise a $0.0015/firma.
- **Encaje Nana**: el más directo para wallet operada por agente. Sus Policies
  pueden replicar server-side lo que hoy hacemos app-level
  (max amount, allowed recipients) — defensa en profundidad.

### Privy — bundle de onboarding (auth + wallets + onramps)

- **Modelo**: producto integrado (Stripe-owned): login de usuarios, embedded
  wallets, fiat onramps. Fuerte en UX de usuario final.
- **Server wallets**: wallets de servidor vía API/`PrivyClient`; wallets de
  usuarios operables server-side vía **Signers** con permisos scoped y policies.
  Enforcea user-in-the-loop para wallets de usuario (access token).
- **Pricing**: free con 50K firmas y $1M volumen/mes; luego por MAU
  (Core $299/mo a 500–2499 MAU...).
- **Encaje Nana**: brilla cuando exista login de usuarios reales (hoy hay
  `DEMO_USER_ID`). Para la wallet del agente puro, es más producto del
  necesario.

### Circle Programmable Wallets — MPC, USDC-native

- **Modelo**: wallets MPC via REST API, gas sponsorship, fuerte en stablecoins.
- **Prior art en repo**: `scripts/arc-demo` ya usa
  `@circle-fin/developer-controlled-wallets` (demo independiente del producto
  WDK) — existen credenciales/flujo conocidos por el equipo.
- **Encaje Nana**: candidato natural, con el beneficio del prior art.

### Otros (mención)

- **Dynamic/Crossmint/Openfort/Thirdweb** — variantes embedded-wallet para
  stablecoin payments (smart accounts, gas sponsorship). **Fireblocks** —
  enterprise agentic infrastructure, costo/escala fuera de hackathon.

### Comparativa aplicada a Nana

| Criterio | Turnkey | Privy | Circle |
| --- | --- | --- | --- |
| Wallet operada por agente | Nativo (agentic wallets + policies) | Server wallets + signers | Developer-controlled wallets |
| Policies server-side (límites/allowlist) | Sí, granular | Via signers/policies | Sí |
| API server (backend firma) | API keys nativas | PrivyClient/REST | REST |
| Prior art en repo | — | — | Sí (arc-demo) |
| Útil con login de usuarios reales | Menos directo | El mejor | Medio |
| Costo para test env | Free tier amplio | Free tier amplio (50K firmas) | Freemium |

**Lectura**: el boundary agnóstico es lo urgente; la elección de proveedor es
una decisión de producto posterior. Turnkey encaja mejor con el modelo actual
(agente opera una wallet dedicada); Privy se vuelve relevante si el producto
agrega auth de usuarios; Circle tiene prior art.

### ZeroDev + Kernel (ERC-4337) — capa de smart account (next step decidido)

- **Kernel v4** (`zerodevapp/kernel`): smart account modular ERC-4337/ERC-7702,
  compatible ERC-7579 — módulos pluggeables en runtime: **Validator**
  (valida UserOps, owns nonce namespace), Executor, Fallback, Hook, etc.
- **Multisig**: `WeightedValidator` — múltiples signers (ECDSA y
  passkeys/WebAuthn) cada uno con **weight**, y la firma vale cuando la suma
  alcanza el **threshold**. Exactamente el modelo "multisig + multi validación
  de distintas keys" definido como objetivo.
- **Session keys / permissions**: keys con permisos scoped (qué contratos,
  qué funciones, límite de valor, expiración) — caso de uso directo: delegar
  al agente sin darle la key raíz.
- **Integración Privy**: soportada nativamente — Privy gestiona login + EOA
  embebida y esa EOA funciona de signer para el Kernel de ZeroDev (gas
  sponsorship, bundling, recovery, session keys vía la integración nativa de
  Privy, o integración custom con el EOA de Privy como signer).
- **Ruta elegida (decisión de producto)**: v1 con **Privy** (login + wallets)
  y **ZeroDev/Kernel como next step documentado** para multisig/multi-key.

## 3. Fuentes

- openfort.io/blog/privy-vs-turnkey · turnkey.com/vs/privy · turnkey.com/pricing
- docs.turnkey.com (agentic wallets, company wallets quickstart, EVM)
- privy.io/pricing · docs.privy.io (server-side wallets, signers)
- alchemy.com/overviews/best-infrastructure-for-agentic-payments
- agentwallet.md (Circle Programmable Wallets review)