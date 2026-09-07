# 01 — Research questions

## Current-state questions

### Answered by repo scan (2026-09-06, scout gentle-ai-explore — map completo en `02-research.md` §1)

- **R1 — ¿Existe ya un seam de provider?**
  Sí: `src/wallet/provider.ts:30` define `WalletProvider` con 10 métodos
  (`health`, `listNetworks`, `listTokens`, `getAddress`, `getBalance`,
  `getHistory`, `previewTransfer`, `broadcastTransfer`, `waitForFinality`,
  `close`) sobre tipos de dominio neutros. `WdkWalletProvider` y
  `FixtureWalletProvider` lo implementan. El seam es estructuralmente limpio.
- **R2 — ¿Dónde está acoplado WDK fuera de su adapter?**
  Cuatro leaks concretos: (a) `wallet-agent.ts:637` usa el receipt waiter de
  `src/wdk/transaction-receipt.ts` directo, bypassing `waitForFinality`;
  (b) `api/wallet.ts:20-118` re-parsea shapes crudos de WDK en los endpoints
  REST; (c) `agent/definition.ts` importa `decodeMcpText` de `src/wdk/` y
  hardcodea el explorer de Sepolia; (d) naming `WDK_*` en envs y prompt
  (`instructions.ts`, `definition.ts`, `wallet-agent.ts`, `health.ts`,
  `dependencies.ts`).
- **R3 — ¿Los guardas financieros son agnósticos?**
  La lógica sí (`runFinancialTransfer` depende solo de `WalletProvider`;
  `FinancialTaskRegistry` es agnóstico), pero la policy lee envs `WDK_*`
  (max amount, allowed recipients) y está implementada 3 veces (duplicación).
- **R4 — ¿Qué consume el worker de voz?**
  `create-realtime-tools.ts` importa solo `WalletProvider` — limpio. El texto y
  la voz comparten el mismo provider instance vía service.
- **R5 — ¿Qué implementaría un segundo provider?**
  Los 10 métodos + `id` + `mode` con tipos neutros, más tocar
  `runtime/dependencies.ts` (selección), `instructions.ts`, y los 4 leaks de R2
  si no se neutralizan antes.

### Open — decisiones de producto/infra (para design)

- **D1 — ¿Renombramos los envs `WDK_*` a neutros (`WALLET_*`) con alias
  backward-compatible, o los dejamos?** Afecta deploy-test-env (WU3 define
  envs) y documentación. Recomendación: alias doble durante la transición.
- **D2 — ¿Un provider o una policy por provider?** Turnkey puede enforcear
  max-amount/allowlist server-side con sus Policies (defensa en profundidad);
  la policy a nivel app queda igual. Recomendación: policy app-level neutral
  + provider-level como capa extra cuando exista.
- **D3 — ¿Priority de providers a spec-ificar?** Turnkey (agentic-first,
  policies, API keys server-side) vs Privy (bundle con auth/onboarding; útil
  cuando exista login de usuarios reales) vs Circle (prior art en repo,
  MPC, USDC-native). Spec del boundary agnóstico primero; adapters después.
- **D4 — ¿Balance reads vía provider seleccionado?** Hoy los endpoints REST
  usan `WdkWalletProvider` incluso en fixture (`dependencies.ts:59-62`). Con
  selección neutral, reads deberían ir por el provider activo.

## Scope exclusions

- No se implementa ningún adapter nuevo en esta etapa.
- No se cambia el flujo preview→confirm ni el contrato `/v1`.
- La migración real de proveedor es una decisión de producto posterior.