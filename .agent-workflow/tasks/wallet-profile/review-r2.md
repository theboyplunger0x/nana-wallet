# Revisión independiente r2 — cierre de hallazgos

- Artefacto revisado: 04-structure-outline.md r2
- SHA256: 9945e035bad67e4e42abb7f9629411d140a472e0ec401ba6f72610d63655fd32
- Revisor: Pi, model nan / glm5.3-flash, razonamiento high
- Alcance: cierre acotado de la disposición de revisión r1. No reabre investigación completa, no implementa, no toca red/secretos, no delega. Única escritura autorizada: este archivo.

## Verificación de hash

Hash confirmado: `9945e035bad67e4e42abb7f9629411d140a472e0ec401ba6f72610d63655fd32` coincide con el documento en disco.

## Disposición de hallazgos r1

### F1 (controlling) — RESUELTO

El contrato de balances ahora fija: única lectura permitida `eth_call` de `balanceOf(address)` en la interfaz ERC-20 de seis decimales, contrato `0x3600000000000000000000000000000000000000`, chainId 5042002. Describe correctamente que Arc expone USDC también como activo nativo (el proveedor legado usa `eth_getBalance` con 18 decimales) y prohíbe reutilizar esa salida interpretándola como seis decimales (error de factor 10^12). Exige un test del adaptador que inspeccione método, contrato, selector y dirección enviados, más unidades contra saldo conocido. Consistente con `ARC_TESTNET_CHAIN_ID = 5042002` y `ARC_USDC_ERC20 = 0x3600…0000` en `src/wallet/privy-client.ts` y con `USDC_DECIMALS = 6n` en `src/wallet/embedded.ts`.

### F2 (major) — RESUELTO

El outline declara explícitamente que la retirada de accesos de agenda/facturas y sus pagos de /perfil es parte de Q3 aprobada, no una regresión a revertir. El código se conserva. Slices 1 y 2 son checkpoints locales que no se publican por separado. El agente principal en /, su preview y sus confirmaciones permanecen accesibles y deben pasar regresión. Cualquier cambio de esta decisión exige volver al diseño. El gap intermedio del WalletLifecycle queda cubierto por el stop condition existente (slice 3 lo restituye).

### F3 (major) — RESUELTO

El harness ahora nombra el mecanismo existente `VITE_E2E_REAL_BACKEND=1` en `client.tsx` para deshabilitar MSW, sin inventar otro bypass.

### F4 (minor) — RESUELTO

El harness nuevo de esta feature debe devolver exit distinto de cero si no corrió el navegador. No se modifica el contrato de salida del harness legado. Un reporte BLOCKED del harness legado no cuenta como aprobación del gate.

### F5–F7 (minor) — OBSERVACIONES CONSISTENTES

La disposición corrige correctamente mi referencia errónea de r1: `src/wallet/session-isolation.ts` no existe. La guardia de generación y cancelación está únicamente en `apps/nana-wallet/src/lib/session-isolation.ts` (`resetSession`, contador de generación, registro AbortController). Verificado contra el listado de `src/wallet/`: el archivo no está presente allí. El outline r2 usa la referencia genérica correcta («guardia existente de generación y cancelación») sin citar una ruta errónea.

## Hallazgos abiertos en r2

### Críticos

Ninguno.

### Controlantes

Ninguno.

### Mayores

Ninguno.

### Menores (no bloquean aprobación; se resuelven en fase spec)

1. **Raíz de queryKey no explícita.** El outline exige que la nueva queryKey incluya userId y chainId, pero no nombra la raíz. Se recomienda una raíz distinta de `["wallet", …]` (p. ej. `["balances", userId, chainId]`) para que las invalidaciones del endpoint legado (`["wallet","summary",userId]` en `refreshMoneyQueries`) no crucen prefijos con la nueva query.
2. **Mostrar userId en /perfil.** El perfil actual renderiza «Usuario {me.userId.slice(0,8)}…». El outline prohíbe mostrar userId como dato personal en slice 3 pero no aclara si ese sufijo desaparece en la vista simple de slice 1. La spec debe definirlo.
3. **Slice 3 invalidación cruzada.** «Invalidar esta query tras operaciones confirmadas» exige añadir la nueva raíz a los puntos de invalidación existentes; el outline lo menciona de forma general y la spec debe fijar los puntos concretos.

## Veredicto

**LISTO — incondicional, para aprobación humana.**

Sin hallazgos críticos, controlantes ni mayores abiertos. Las correcciones F1–F4 resuelven los problemas de r1 de forma exacta y verificable contra el código. Los tres menores restantes son decisiones de redacción de spec, no defectos del plan. El outline r2 es consistente con 03-design-discussion.md r1, con Q1–Q3 aprobadas y con la base Privy snapshot sin atribuirle trabajo heredado.

Siguiente paso según el plan: aprobación humana del outline, luego fases SDD en openspec (proposal → spec → design → tasks) antes de apply.
