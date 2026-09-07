# 04 — Structure outline

Estado: draft aprobado — decisiones D1/D4/login/D5 cerradas (ver `03-design-discussion.md`).
Implementación via stage 2 (openspec).

## Work units (orden de dependencias)

### WU1 — DB: `users` + RLS + upsert path
- Migración `20260901000300_users.sql`: tabla `users` (UUID PK, privy_did
  UNIQUE, display_name, timestamps), RLS ENABLED + FORCED, policy
  `user_self_isolation` sobre `app.user_id`, FK opcionales desde
  `recipients/conversations`.user_id.
- Fila demo: `users` con sentinel `privy_did='demo'` + `DEMO_USER_ID` seed.
- SECURITY DEFINER `users_ensure_for_privy_did(did, display_name)` (R4/D3).
- Seed recipient memory gated a modo demo.

### WU2 — Backend: identidad Privy + `/v1/me`
- `src/auth/privy-identity.ts`: verificación JWT (ES256, `iss=privy.io`,
  `aud=PRIVY_APP_ID`) con key de test para CI; DID → upsert → UUID.
- `IDENTITY_PROVIDER=demo|privy` en `src/config/process.ts` (outs el requerido
  `DEMO_USER_ID` salvo demo); wiring en `server.ts`.
- `GET /v1/me` + contratos en `src/contracts/http.ts`.
- Tests: token válido/expirado/firmado por otra key; upsert idempotente.

### WU3 — Backend: `/v1/contacts`
- CRUD sobre `recipients` con `provenance='user'`, soft delete, reveal-cbu
  (D4); scoping vía `withUserTransaction` (RLS existente).
- Tipos en `src/contracts/http.ts`.
- Tests de aislamiento cruzado (usuario A no ve/modifica recipients de B) y
  de guardas (contacto sin address confirmada no es transferible).

### WU4 — Front: Privy + token plumbing
- `@privy-io/react-auth` + `PrivyProvider` (`VITE_PRIVY_APP_ID`), login UI
  (SMS/WhatsApp/email), ruta de login + logout.
- `api.ts`: `getAccessToken()` async en cada request, 401 → refresh → retry;
  fallback dev solo con `VITE_IDENTITY_PROVIDER=demo`.
- `/v1/me` al boot (session bootstrap), contactos en `/perfil` contra el
  backend real.
- Espejo `api-types.ts` (misma PR, regla dura).

### WU5 — Backend: text path per-request identity
- `memory/runtime.ts` + `runtime/dependencies.ts`: runtime por request con
  `resolveUserId` (paridad con voice path `binding.sub`).
- Live-bindings: `sub` sigue siendo el UUID interno (sin cambios en worker).

### WU6 — Verificación
- Backend: `npm run lint && npm run typecheck && npm test` (con
  `docker compose up -d db`) + evals si el agent tocó rutas de guardas.
- Front: lint + typecheck + test en `apps/nana-wallet/`.
- RLS e2e: dos usuarios A/B en la misma DB, zero filtración por cada endpoint.
- Smoke: login → contacto creado en `/perfil` → agente lo usa (fixture mode).

## Orden sugerido

WU1 → WU2 → WU3 (back en verde) ∥ WU4 (front) → WU5 → WU6.

## Coordinación

- Independiente del refactor `wallet-agnostic-boundary` (envs `WALLET_*`):
  ninguno toca los mismos archivos críticos; mergeable en cualquier orden.
- No tocar el flujo preview→confirm ni la wallet singleton (sprint siguiente:
  wallet por usuario con WDK modular vía el adapter del boundary; Privy es
  solo auth).
