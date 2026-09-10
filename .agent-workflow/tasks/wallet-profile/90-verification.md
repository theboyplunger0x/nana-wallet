# Evidencia y continuación

Fase: investigación y propuesta de diseño. Diseño r1 aprobado por Ramiro con «si». Gate activo: aprobación humana del outline r2; revisión independiente completada.

Ejecutado: inspección de estado, ramas y worktrees; fetch de origin; consulta de PR abiertos; creación del worktree con Worktrunk; copia de la base Privy con manifiesto SHA-256; lectura de contratos, rutas, migraciones y harness E2E.

La copia heredada de Privy no se considera implementación propia ni funcionalmente validada por esta tarea. Los cambios propios son documentos del RPI. No se ejecutaron unitarios, integración, lint, typecheck, build, evals ni E2E: todavía no se implementó esta funcionalidad. No hay un bloqueo externo de E2E comprobado, porque no se intentó ejecutarlo en esta fase.

Para cada slice posterior: levantar Postgres con pgvector, migrar, mantener fixtures, iniciar servidores con Portless, ejecutar backend lint/typecheck/test/eval/build si cambia contrato, frontend lint/typecheck/test/build y E2E en navegador contra backend real. Cubrir dos usuarios, nombre null, errores, estados de wallet y saldos con decimales. Registrar fallos externos concretos, sin contar suites omitidas como aprobadas.

Outline r1 redactado tras aprobar Q1-Q3. Revisión Pi iniciada en Herdr w1C:t1N / w1C:p3F con nan/glm5.3-flash, thinking high. Validación visual y manual: pendiente de implementación. Se abrió únicamente la pestaña de revisión registrada en herdr-session.md. No se iniciaron servidores de aplicación. Worktree conservado para continuar.

Verificación de esta fase: 123 archivos heredados cotejados contra SHA-256 del manifiesto, sin diferencias; formato de documentos verificado. Implementación propia aún no iniciada.

Revisión independiente: r1 y r2 persistidas, hash r2 cotejado, cero críticos/controlantes/mayores abiertos. Tres menores trasladados a spec en 05-independent-review.md. No hubo implementación ni ejecución de suites de aplicación en este turno.

Cierre verificado de la única tab creada; las tres preexistentes siguen presentes. Checkout original main limpio y alineado con origin/main.

## Fase SDD completada

Ramiro aprobó outline r2 y avanzar a SDD con «si». Se crearon proposal, spec (16 requisitos/31 escenarios), design y tasks (26 pendientes) en openspec/changes/wallet-profile, junto con metadata, estado y validation.md. OpenSpec 1.13.0 strict pasó sin issues; status confirma planificación completa. Trazabilidad y hashes de base/outline verificados. Sigue pendiente apply y reconciliación de la base final Privy; no se ejecutaron suites de aplicación.

## Fase apply+verify completada (wallet-profile, 2026-09-10)

### Base y reconciliación (0.1/0.2)

- No existe commit final de Privy (branch `feat/privy-multi-user-foundation` @ b0e85ad ≠ base de esta tarea; el trabajo Privy vigente sigue sin commitear). Dependencia registrada: `final_privy_commit_and_contract_reconciliation`. Con autorización explícita de Ramiro, apply avanzó solo sobre la snapshot ya copiada.
- Snapshot verificada por ejecución: los 123 archivos coinciden con los SHA-256 de privy-snapshot.json (0 missing, 0 mismatch). El worktree fuente (/private/tmp/nana-privy-specs-20260908) tiene versiones más nuevas de 24 archivos: NO se sobrescribieron ni importaron; se preservaron.
- Worktree de implementación ya registrado: /private/tmp/nana-wallet-profile-rpi-20260909, rama docs/wallet-profile-rpi, HEAD e9fcd84. Se respetó la regla de no tocar main ni otros worktrees.

### Entorno (0.3)

- Dependencias instaladas (npm ci raíz y apps/nana-wallet). Compose propio `compose.wallet-profile-test.yaml`: proyecto `nana-wallet-profile-test`, volumen `wallet_profile_postgres`, puerto 127.0.0.1:55432; sin tocar el stack nana-privy-impl. Rol recipient_app recreado manualmente (la inicialización del volumen preexistente lo había omitido); migraciones 001..006 aplicadas.
- Modo fixture verificado: WDK_TOOLS_SOURCE=fixture intacto; identidad demo sin bypass público (DemoIdentityProvider resuelve DEMO_USER_ID; ruta privy 401 cubierta en tests de integración). BALANCE_READ_SOURCE=fixture por defecto; rpc exige BALANCE_RPC_URL (documentado en .env.example y docs/api.md sin secretos).

### Baseline (0.4)

- Backend `npm test` con DB sobre la base Privy aislada ANTES de mis cambios: 524 passed / 10 failed / 10 skipped. Los 10 fallos son pre-existentes y quedaron idénticos tras los slices: api-contacts (2, timeouts), api-conversation-resolution, api-conversation-service, api-conversations, contacts-cross-user, conversation-preview-claim-race, users-db (2, falta DEMO_USER_ID en el entorno de test), voice-touch-decision-race. Suite usada como línea de base; no se atribuyeron a wallet-profile.

### Slices implementados

1. Contratos backend (`src/contracts/http.ts`): schemas zod ready/no-ready (catálogo cerrado chainId 5042002, USDC 0x3600…0000, decimals 6, balanceAtomic canónico), códigos WALLET_DATOS_INVALIDOS/BALANCE_NO_DISPONIBLE. Tipos duplicados a mano en `apps/nana-wallet/src/lib/api-types.ts` + ErrCode ampliados.
2. Servicio y lectores (`src/wallet/balances.ts`): WalletBalancesService (binding propio via EmbeddedWalletService.getCurrentWallet bajo RLS; reloj inyectable; observedAt solo tras lectura exitosa), FixtureBalanceReader por dirección con error explícito para desconocido, RpcBalanceReader (eth_chainId + eth_call decimals 0x313ce567 / balanceOf 0x70a08231, validación jsonrpc 2.0/ID/ABI 32 bytes, BigInt, deadline compartido 8 s, sin retries, sin eth_getBalance). Sin dependencia de firma/permisos; sin core.walletReads.
3. Ruta GET /v1/wallets/current/balances en `src/api/wallets.ts`: auth, rechazo query/body → 400 INVALID_QUERY sin leer, Cache-Control: private, no-store en éxito y error, 409/503 mapeados, mensajes sanitizados. Wiring en `src/server.ts` (misma resolución de binding, cero métodos de sync/sign). docs/api.md actualizado; .env.example con BALANCE_* de ejemplo sin secretos.
4. Perfil (`apps/nana-wallet/src/routes/perfil.tsx`): solo /me; nombre o ausencia (null/vacío/espacios); sin userId/DID ni datos ficticios; Salir con resetSession+queryClient.clear; error/carga/reintento propios. Legados preservados no montados en `features/profile/LegacyProfileSections.tsx` (contactos/agenda/facturas + ConfirmarPlata + WalletLifecycle, con invalidación de balances añadida a sus refreshMoneyQueries).
5. Billetera (`apps/nana-wallet/src/routes/mi-plata.tsx`): identidad + balances (staleTime 30 s, refetchOnMount always, retry false, sin polling, botón «Actualizar saldo», error oculta monto previo), formato exacto string/BigInt es-AR (`src/lib/usdc-format.ts`), indicador «Arc testnet», «Monto de demostración» en fixture, observedAt, variantes no-ready sin monto. «Administrar billetera» monta WalletLifecycle lazy solo tras clic explícito; no consulta contactos/permisos al leer saldo. Legados preservados no montados en `features/wallet/LegacyMoneySections.tsx`; endpoints MSW legados sin uso en la pantalla.
6. Invalidación (WP-014) en `apps/nana-wallet/src/routes/index.tsx`: refreshMoneyQueries incluye queryKeys.balances(userId, 5042002) (raíz "balances" distinta del resumen legado); efecto deduplicado por transactionHash del estado autoritativo de conversación cubre texto, decisión por botón y refresco por voz, sin dispatch extra ni cambios a preview/confirmación/idempotencia. Cero invalidación de otros usuarios.
7. MSW dev handler de balances (`mocks/handlers.ts`) solo para dev con mock; el navegador E2E usa VITE_E2E_REAL_BACKEND=1 y no intercepta balances.

### Evidencia de suites (WP-016)

- Backend lint (`npm run lint`): PASS. typecheck: PASS. test con DB (55432): 548 passed / 10 failed (los mismos 10 del baseline preexistente; +24 tests nuevos: 10 adaptador RPC JSON-RPC local controlado, 8 servicio/fixture/config, 6 integración HTTP+Postgres dos usuarios/estados/409/503/RLS/side-effects) / 10 skipped. eval: 100% (16 evals, 7 archivos). build: PASS.
- Frontend (`apps/nana-wallet`): lint PASS, typecheck PASS, tests 73 passed (incluye formatter exacto 1/9007199254740993 → «9.007.199.254,740993», mínimo «0,000001», cliente balances, errores estables, queryKey por usuario), build PASS.
- E2E propio (`scripts/run-wallet-profile-e2e.mjs`, backend real + VITE_E2E_REAL_BACKEND=1, Chromium obligatorio, viewport 390 px): 17 PASS / 0 FAIL / exit 0. Cubre: balances HTTP pre/post sync (unprovisioned sin lector y ready 1,25 USDC no-store), query ajena 400, lecturas sin mutaciones (WP-008), /perfil nombre conocido/ausente y cero requests legados, 390 px sin overflow con nombre largo, /mi-plata monto exacto + red + demostración + observedAt, lifecycle solo tras clic, fallo de lector (backend secundario BALANCE_READ_SOURCE=rpc muerto) oculta monto previo y el refresh manual mantiene error sin polling. El harness legado PMU-025 no fue modificado.
- DB/volumen/puertos usados por esta tarea: compose wallet-profile-test, puerto 55432, backend 3124, frontend 5199; ninguna infraestructura de otros worktrees fue tocada.

### Blockers y limitaciones (no contados como PASS)

- Blocker externo: sin commit final de Privy, el E2E de cambio de sesión A→B en navegador (WP-013) requiere login Privy real y no es ejecutable en modo demo. Cubierto a nivel unitario/integración: resetSession/generación + caché por userId + abort de peticiones; el retardo de respuesta A y descarte de callbacks quedan en la capa existente (api.ts/session-isolation.ts) sin segundo contador.
- 401 de balances en navegador no ejercitable en modo demo (identidad demo no emite 401); cubierto en tests de integración privy (401 real).
- E2E HTTP legado (PMU-025) no ejecutado en esta fase (apunta a la DB del otro worktree); el E2E requerido por WP-016 es el harness propio, ejecutado y en verde.
- Fallos pre-existentes del baseline (10) permanecen sin cambios y se documentan como pre-existentes de la snapshot Privy.
