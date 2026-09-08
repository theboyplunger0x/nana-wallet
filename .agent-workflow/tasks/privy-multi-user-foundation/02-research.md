# 02 — Research

Fecha: 2026-09-06 · Worktree `feat/privy-multi-user-foundation` · Preguntas:
`01-research-questions.md`. Scout: gentle-ai-explore (mapeo repo) + docs Privy.

## 1. Estado actual del repo (auth / DB / contacts / front)

### Identidad: el seam existe pero es un demo user fijo

- `DemoIdentityProvider` ignora el request y devuelve el `userId` configurado
  (`src/auth/identity.ts:10-15`); wire en `src/server.ts:68` y
  `resolveUserId` en `:78-79`. Es el único seam de identidad del backend.
- El header `Authorization: Bearer` que envía el front **nunca se consume**:
  CORS lo whitelista (`src/server.ts:60`) pero ningún route lo lee.
- `DEMO_USER_ID` es UUID requerido con `DATABASE_URL` (`src/config/process.ts:121-123`)
  y en producción el mensaje pide explícitamente reemplazarlo por un
  identity provider real (`:133-134`).
- Voice path: el binding JWT ya trae `sub = userId` con lifetime 1–300s
  (`src/auth/live-binding.ts:37-56`); el worker scoping memory a
  `binding.sub` (`src/livekit/worker.ts:94-100`). Este mecanismo queda igual;
  lo único que cambia es de dónde sale el userId en el API side.

### DB: ya está multi-usuario lista (RLS FORCED)

- Migraciones: `20260901000000_recipient_memory.sql` (`recipients` +
  `user_memories`, embedding vector(384)), `...00100_conversations.sql`
  (conversations, state, messages, transfer_attempts, memory_confirmations),
  `...00200_conversation_live_leases.sql`. Todas con `user_id`, RLS
  `ENABLED + FORCED` y policy `*_user_isolation` sobre
  `current_setting('app.user_id', true)`.
- Mecanismo por transacción: `SET LOCAL ROLE recipient_app` +
  `set_config('app.user_id', $1, true)` en `DatabaseClient.withUserTransaction`
  (`src/db/client.ts:12-21`); cada método del repo scopia por userId
  (`src/conversations/postgres-repository.ts`).
- Rol `recipient_app`: `NOLOGIN NOSUPERUSER NOBYPASSRLS` (`supabase/roles.sql`).
- **No hay tabla `users` ni Supabase Auth**; `user_id` es UUID pelado, sin FK.

### Contacts

- El address book es `public.recipients` (RLS por user, versionado,
  `address_confirmed_at`, provenance, embedding para fuzzy match del agente).
- La memoria es tenant-agnóstica (todo método toma `userId`
  (`src/memory/service.ts`); text path usa un runtime con `demoUserId` fijo
  (`src/memory/runtime.ts:40-42`, `src/runtime/dependencies.ts:94-96`) y el
  seed escribe recipients del demo (`src/memory/seed.ts:34,42`).
- El front ya llama `/v1/contacts` CRUD + `/reveal-cbu`
  (`apps/nana-wallet/src/lib/api.ts`) — **este backend no los implementa**.

### Front

- `api.ts` manda `Authorization: Bearer ${getApiToken()}` en cada request
  (`lib/api.ts:107,151,293,342`); token de sessionStorage
  `nana-wallet-token` (`:31,90`) o fallback `"token-de-desarrollo"` (`:93`).
  Decorativo hoy.
- Sin auth UI: rutas `/` (agente voz), `/mi-plata`, `/perfil`
  (contacts/agenda/bills) (`routeTree.gen.ts:18-48`).
- El front llama más endpoints de los que este backend sirve (`/v1/me`,
  `/v1/wallet/summary|movements`, `/v1/contacts`, `/v1/agenda`, `/v1/bills`,
  `/v1/transfers`, `/v1/payments`); solo conversation/wallet/voice overlap.

### Singleton wallet (colisión futura, no este sprint)

- Una única wallet compartida `WDK_WALLET_NAME='agent-demo'`
  (`src/api/wallet.ts:16`, `src/api/health.ts:17`). Multi-usuario con wallet
  por user es el sprint siguiente (boundary ya preparado en el plan padre).

## 2. Privy (docs oficiales, 2026-09)

- **Access token**: JWT **ES256** firmado por Privy; claims: `sid` (session),
  `sub` (**Privy DID**), `iss = privy.io`, `aud = app ID`, `iat`, `exp`
  (~1 hora). Fuente: docs.privy.io/authentication/user-authentication/access-tokens.
- **Front**: `usePrivy().getAccessToken()` — auto-refresh si está por vencer;
  se manda como `Bearer` en `Authorization` (localStorage mode) o en cookie
  `privy-token` (cookies mode). 401 → `getAccessToken()` con backoff → retry.
- **Back**: verificar contra la **verification key** de la app con
  `@privy-io/node` (`PrivyClient.verifyAuthToken`) o JWT lib propia.
- **DID**: `did:privy:<cuid>` — **no es un UUID**. Identity token (JWT con
  claims del user) vs access token: el access token es lo que viaja en cada
  request; datos extra del user vía PrivyClient REST si hace falta.
- **SDK front**: `@privy-io/react-auth` con `PrivyProvider` (ejemplo oficial
  React + Vite); login methods configurables por dashboard.

### Implicancia directa sobre R3/D1

El DID no calza con los `user_id UUID` ni con la validación de
`DEMO_USER_ID`. Cualquier opción que cambie tipos implica reescribir 6
migraciones + repos + seeds. Tabla `users` con UUID interno preserva todo el
código existente.

## 3. Fuentes

- docs.privy.io/authentication/user-authentication/access-tokens
- docs.privy.io/basics/react/quickstart · /installation
- docs.privy.io/user-management/users/the-user-object · querying-users
- docs.privy.io/recipes/wallets/server-side-user-wallets (wallet por user,
  sprint siguiente)
- Repo: scout report con file:line (sección 1); plan padre D3 en
  `wallet-agnostic-boundary/03-design-discussion.md`.
