# 00 — Intake

## Outcome

Dejar la arquitectura de Nana preparada para **cambiar de proveedor de wallet
sin rehacer el producto**: la app queda agnóstica a la wallet (WDK hoy;
Privy, Turnkey, Circle u otra mañana) documentando el boundary, neutralizando
los puntos de acoplamiento WDK y dejando las specs del contrato de provider.

## Acceptance evidence (provisional)

- Mapa del boundary actual con los puntos exactos de acoplamiento WDK.
- Research comparativo de proveedores (Turnkey, Privy, Circle + panorama).
- Specs del contrato de provider agnóstico: interfaz `WalletProvider`
  generalizada, selección por env (`WALLET_PROVIDER`), policy neutral, y qué
  implementa un segundo provider.
- Plan de refactor con archivos a tocar y archivos que NO se tocan (seam limpio).

## Granted authority

- Read: entire repository (`src/`, docs, contracts).
- Write (planning artifacts): `.agent-workflow/tasks/wallet-agnostic-boundary/`.
- Write (implementation): NOT yet granted — bound a design approval (stage 2
  via openspec).

## Read scope

- `src/wallet/` (provider.ts, wdk-provider.ts, fixture-provider.ts, agent-tools.ts)
- `src/wdk/` (mcp-client.ts, transaction-receipt.ts, direct-wallet-reads.ts)
- `src/agent/` (wallet-agent.ts, definition.ts, instructions.ts, wdk-tools.ts)
- `src/conversations/service.ts`, `src/runtime/dependencies.ts`,
  `src/api/wallet.ts`, `src/api/health.ts`, `src/livekit/realtime-tools/`
- `src/contracts/http.ts`, `docs/architecture.md`
- `scripts/arc-demo/` (prior art Circle), `package.json` (@circle-fin dep)

## Write scope (implementation, tentative until design approval)

- Neutralización de los 4 leaks WDK identificados (receipt waiter, normalizers
  de `api/wallet.ts`, `agent/definition.ts`, naming de envs `WDK_*` → `WALLET_*`)
- `src/wallet/provider.ts`: generalización de tipos (network, history typing)
- Selección de provider por env en `src/runtime/dependencies.ts`
- Specs/contrato documentado del provider boundary

## Non-goals (provisional)

- No se implementa Privy/Turnkey/Circle en esta etapa (solo el boundary que los
  hace drop-in).
- No se toca el contrato HTTP `/v1` salvo tipar `WalletHistory`.
- No se migra la wallet del demo (WDK fixture sigue default).
- Sin migraciones de DB.

## Selected route

RPI workflow. Current phase: intake → research questions. Implementación
posterior vía openspec (stage 2).

## Active gate

Research gate: mapear el acoplamiento real (scout completado) y comparar
proveedores antes de diseñar el boundary neutral.