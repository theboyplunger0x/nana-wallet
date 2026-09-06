# 04 — Structure outline

Estado: draft para aprobación antes de implementación. Design: `03-design-discussion.md` (decisiones cerradas: renombrado directo, Privy v1 + ZeroDev next step).

## Work units (orden de dependencias)

### WU1 — Contrato provider neutral (`src/wallet/provider.ts`)
- `FinalityOutcome.network: string` (fuera el literal `'sepolia'`).
- `WalletHistory.transactions` tipada con `WalletTransaction`
  (`contracts/http.ts`).
- Doc del contrato: cada método, semántica de `uncertain` y `not_dispatched`,
  y el invariant "preview ≠ broadcast ≠ confirmación".

### WU2 — Selección + policy únicas
- `src/wallet/selection.ts` (nuevo): `WALLET_PROVIDER` → instancia del
  provider; renombrado directo de envs (`WDK_TOOLS_SOURCE` → `WALLET_PROVIDER`,
  `WDK_NETWORK` → `WALLET_NETWORK`, `WDK_TOKEN` → `WALLET_TOKEN`,
  `WDK_WALLET_NAME` → `WALLET_NAME`, `WDK_MAX_TRANSFER_AMOUNT` →
  `TRANSFER_MAX_AMOUNT`, `WDK_ALLOWED_RECIPIENTS` → `ALLOWED_RECIPIENTS`).
- `src/wallet/policy.ts` (nuevo): la única implementación de
  `validateWalletTransferPolicy`; las 3 duplicaciones convergen ahí.
- Reads REST vía el provider seleccionado (corrige `dependencies.ts:59-62`).

### WU3 — Neutralizar los 4 leaks
- `agent/wallet-agent.ts`: confirm path → `walletProvider.waitForFinality`;
  out fallback `getWdkTools`; `validateLiveTransferPolicy` → `policy.ts`.
- `agent/definition.ts`: out `decodeMcpText` y explorer URL (→ adapter WDK);
  policy → `policy.ts`.
- `api/wallet.ts`: normalizers WDK-crudos → tipos del provider.
- `agent/instructions.ts` + `api/health.ts`: envs neutros, prompt sin "WDK".
- `src/wdk/transaction-receipt.ts`: waiter queda interno del adapter WDK;
  tipo público deprecado a favor de `FinalityOutcome`.

### WU4 — Spec del boundary Privy-first (documento, no código)
- `docs/wallet-boundary.md`: contrato de provider, checklist drop-in para un
  adapter nuevo, y la hoja de ruta decidida:
  - **v1**: Privy — login de usuarios + wallets (server/embedded).
  - **Next step (documentado, no implementado)**: ZeroDev Kernel v4
    (ERC-4337/ERC-7579) con EOA Privy como signer → multisig/multi-key vía
    `WeightedValidator` + session keys scoped para el agente.
- Actualización de README/runbooks con los envs nuevos.

### WU5 — Verificación
- Suite completa backend verde (tests, typecheck, lint).
- Tests de guardas financieras: misma cobertura con envs renombrados.
- Smoke: fixture mode E2E de texto con el provider seleccionado por
  `WALLET_PROVIDER=fixture` (paridad con el comportamiento actual).

## Orden sugerido

WU1 → WU2 → WU3 → WU4 → WU5. Refactor puro de boundary: sin cambios de
comportamiento externo salvo los envs nuevos.

## Coordinación con deploy-test-env

- Este refactor **antes** de WU3 (Render envs) del deploy-test-env: el host
  recibe los envs nuevos de una vez, sin renombrar dos veces.
- La imagen Docker (WU1 deploy-test-env) no depende de este refactor y puede
  avanzar en paralelo.

## Fuera de alcance

- Implementar el adapter Privy o ZeroDev (solo spec/roadmap).
- Login real de usuarios (Privy auth) — v1 futura.
- Multisig/Kernel — next step documentado únicamente.