# 03 — Design discussion

Estado: PROPUESTA — pendiente de aprobación humana. Referencias: `02-research.md` (mapa + proveedores), `01-research-questions.md` (D1–D4).

## Principio de diseño

La app ya habla con `WalletProvider`; el trabajo no es inventar una abstracción,
es **cerrar los 4 leaks WDK** para que el contrato existente sea el único punto
de verdad y cualquier proveedor (WDK, Turnkey, Privy, Circle) sea un adapter
drop-in. Regla de oro: `src/wdk/` no se importa fuera de su adapter
(`src/wallet/wdk-provider.ts` + `src/agent/wdk-tools*`).

## El contrato de provider agnóstico (spec)

### Selección y configuración

```
WALLET_PROVIDER = fixture | wdk | turnkey | privy | circle   (default: fixture)
WALLET_NETWORK  = sepolia | ...                              (default: sepolia)
WALLET_TOKEN    = USDT                                       (alias de producto)
WALLET_NAME     = agent-demo                                 (wallet operada)
TRANSFER_MAX_AMOUNT / ALLOWED_RECIPIENTS                     (policy neutral)
```

- Renombrado directo (D1, sin alias): `WDK_TOOLS_SOURCE=live` pasa a ser
  `WALLET_PROVIDER=wdk`. Un único lugar de lectura: `src/wallet/selection.ts`.
  Runbooks, tests, README y docs actualizados en el mismo cambio.
- Los reads REST usan el **provider seleccionado** (corrige la inconsistencia
  de `dependencies.ts:59-62`).

### Tipos generalizados (cambios quirúrgicos en `provider.ts`)

1. `FinalityOutcome.network: string` (hoy `'sepolia'` literal) — la red la
   aporta el provider.
2. `WalletHistory.transactions` tipada con `WalletTransaction` de
   `contracts/http.ts` (ya existe; elimina el `Record<string,string>`).
3. `previewTransfer`/`broadcastTransfer` ya son neutros — sin `dryRun` en el
   contrato: el concepto preview/broadcast es del dominio, no del provider.
4. Un solo shape de finality: se deprecia `TransactionReceiptOutcome` de
   `src/wdk/transaction-receipt.ts` como tipo público; el provider WDK adapta
   su waiter interno a `FinalityOutcome`.

### Policy neutral (una sola implementación)

- `validateWalletTransferPolicy` queda única en `src/wallet/policy.ts`,
  leyendo envs neutros (`TRANSFER_MAX_AMOUNT`, `ALLOWED_RECIPIENTS`), con
  alias de los `WDK_*` actuales. Las 3 duplicaciones actuales
  (`definition.ts`, `wallet-agent.ts`, `wallet/agent-tools.ts`) convergen ahí.
- Provider-level policies (Turnkey Policies, etc.) quedan como capa extra del
  adapter cuando exista — no reemplazan la app-level (D2).

### Qué implementa un provider nuevo (checklist drop-in)

1. `src/wallet/<name>-provider.ts` con los 10 métodos + `id` + `mode`,
   devolviendo tipos neutros; fee estimation en `previewTransfer`; manejo de
   incertidumbre en `broadcastTransfer` (`uncertain` cuando no se sabe si se
   ejecutó — invariant del producto).
2. Registro en `src/wallet/selection.ts` (una línea) + envs documentadas.
3. Nada más: service, realtime tools, registry, guards y API no se tocan.

## Plan de refactor (archivos)

| Archivo | Cambio |
| --- | --- |
| `src/wallet/provider.ts` | network genérico, history tipado |
| `src/wallet/selection.ts` (nuevo) | resolución `WALLET_PROVIDER` + alias `WDK_TOOLS_SOURCE` |
| `src/wallet/policy.ts` (nuevo) | policy única, envs neutros + alias |
| `src/runtime/dependencies.ts` | usa selection; reads vía provider activo |
| `src/agent/wallet-agent.ts` | confirm path → `walletProvider.waitForFinality`; drop fallback `getWdkTools` |
| `src/agent/definition.ts` | out `decodeMcpText` + explorer URL → al provider |
| `src/api/wallet.ts` | out normalizers WDK-crudos → tipos del provider |
| `src/agent/instructions.ts` | prompt sin "WDK", config neutra |
| `src/api/health.ts` | envs neutros |

**No se tocan**: `conversations/service.ts`, `create-realtime-tools.ts`,
`financial-task-registry.ts`, contrato `/v1`, tests de guardas (solo adaptar
envs).

## Relación con deploy-test-env

El refactor es **independiente** del deploy (la imagen Docker no le importa qué
provider hay). Orden recomendado: primero este refactor (o en paralelo con WU1
Docker), **antes de definir las envs finales en Render (WU3)** — así Render
recibe envs neutros y evitamos renombrar en el host dos veces.

## Decisiones cerradas (2026-09-06)

1. **D1 — Envs: renombrado directo.** `WDK_*` → `WALLET_*` sin alias de
   compatibilidad: runbooks, tests y docs se actualizan en el mismo cambio.
   Consecuencia: se rompen setups `.env` existentes de una vez (aceptado);
   y el deploy-test-env (WU3) define envs en Render directamente con los
   nombres nuevos.
2. **D3 — Dirección de proveedores: Privy primero + ZeroDev después.**
   - **v1: Privy** para login de usuarios y wallets de la primera versión
     (server wallets / embedded).
   - **Next step documentado: ZeroDev Kernel (ERC-4337/ERC-7579)** sobre la
     EOA de Privy como signer, para agregar **multisig y multi validación de
     keys** vía `WeightedValidator` (weights + threshold, soporta ECDSA y
     passkeys) y session keys con permisos scoped para el agente.
   - El spec del contrato debe valer para ambos escenarios: wallet operada
     por la app (hoy) y wallet por-usuario con login (Privy). WDK/Turnkey/
     Circle quedan como adapters posibles del mismo contrato.
3. **D2 — Policy:** app-level única y neutral (`src/wallet/policy.ts`); las
   policies del proveedor (Turnkey Policies, Kernel modules) son capa extra,
   nunca reemplazo.
4. **D4 — Reads por provider seleccionado:** sí, corregido en el diseño.

## Next step documentado (fuera de esta etapa): ZeroDev Kernel

Ruta de producto decidida: Privy (login + wallets) en v1; sobre esa base,
**ZeroDev Kernel v4 (ERC-4337/ERC-7579)** con la EOA de Privy como signer:

- **Multisig / multi validación de keys**: módulo `WeightedValidator`
  (signers ECDSA y passkeys con weights + threshold).
- **Delegación al agente**: session keys / permissions con permisos scoped
  (contratos, funciones, límites, expiración) — el agente nunca maneja la key
  raíz.
- Referencias: `docs.zerodev.app/advanced/multisig`,
  `docs.zerodev.app/onboarding/privy`, `github.com/zerodevapp/kernel`.

## Riesgo aceptado

Tocar `wallet-agent.ts`/`definition.ts` (guardas financieras críticas) —
requiere suite de tests de guardas en verde y revisión cuidadosa; no es un
refactor de nombres solamente. El renombrado directo rompe `.env` existentes:
actualizar runbooks/docs en el mismo cambio.

## Non-goals reafirmados

Sin adapter nuevo implementado, sin cambio de wallet real, sin tocar el flujo
preview→confirm ni el contrato HTTP.