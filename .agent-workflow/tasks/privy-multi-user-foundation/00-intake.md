# 00 — Intake

## Outcome

Habilitar el **sistema multi usuario real** de Nana: login de usuarios con
**Privy** end-to-end (front + back + DB), identidad verificada por token en cada
request, y datos aislados por usuario con **RLS** (`app.user_id`), incluyendo los
**contactos** (`/v1/contacts`). Es el primer sprint que materializa la decisión
D3 de `wallet-agnostic-boundary` (Privy primero en v1).

## Acceptance evidence (provisional)

- Login Privy funcional en el front (TanStack Start) con token propagado a cada
  request y sesión persistente + logout.
- Backend verifica el access token Privy en cada request (`PrivyIdentityProvider`)
  y resuelve el usuario interno; `DemoIdentityProvider` queda solo para dev/tests.
- Tabla `users` con mapeo Privy DID → UUID interno; RLS por `app.user_id`
  cubre también `users` y los endpoints de contactos.
- `/v1/contacts` (CRUD + reveal) servido por el backend, aislado por usuario,
  con contrato espejado en `apps/nana-wallet/src/lib/api-types.ts`.
- Text path y voice path resuelven identidad por request (sin `demoUserId` fijo).
- Suites front + back en verde; tests de RLS cruzado (usuario A no ve datos de B).

## Granted authority

- Read: entire repository (`src/`, `apps/nana-wallet/`, `supabase/`, docs).
- Write (planning artifacts): `.agent-workflow/tasks/privy-multi-user-foundation/`.
- Write (implementation): NOT yet granted — bound a design approval (stage 2
  via openspec).

## Read scope

- `src/auth/` (identity.ts, live-binding.ts), `src/server.ts`, `src/config/process.ts`
- `src/db/client.ts`, `supabase/migrations/*.sql`, `supabase/roles.sql`
- `src/memory/` (service, runtime, seed), `src/livekit/worker.ts`
- `src/runtime/dependencies.ts`, `src/contracts/http.ts`, `src/api/*`
- `apps/nana-wallet/src/lib/api.ts`, `api-types.ts`, `routeTree.gen.ts`, `routes/*`
- Plan padre: `.agent-workflow/tasks/wallet-agnostic-boundary/` (D3, boundary)

## Write scope (implementation, tentative until design approval)

- Migración nueva: `users` + RLS + ruta de upsert en login.
- `src/auth/`: `PrivyIdentityProvider` (verificación JWT Privy → DID → UUID).
- `src/api/me.ts` + `src/api/contacts.ts` (nuevos endpoints `/v1`).
- `src/contracts/http.ts`: `/v1/me` + contacts types.
- Front: Privy SDK, login UI, plumbing de token en `api.ts`, `/v1/me`,
  contactos en `/perfil`, espejo `api-types.ts`.

## Non-goals (provisional)

- No se implementa la wallet por usuario: la creación de wallets va vía WDK
  (la modular) en el sprint siguiente; Privy queda solo para auth. Sigue
  siendo la wallet del agente en este sprint.
- No se tocan bills/agenda/transfers (endpoints que el front llama pero este
  backend no sirve — sprint separado).
- No se migra Supabase Auth (`auth.users`/`auth.uid()`): el RLS queda
  server-mediated como hoy.
- Sin migración de datos existentes del demo user (se mantiene como seed dev).

## Selected route

RPI workflow. Current phase: intake → research questions. Implementación
posterior vía openspec (stage 2).

## Active gate

Research gate: cerrar el mapping DID↔UUID, el upsert en login y la relación
contacts↔recipients antes de diseñar.
