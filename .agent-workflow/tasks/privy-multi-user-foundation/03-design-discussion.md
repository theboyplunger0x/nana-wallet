# 03 — Design discussion

Estado: APROBADO — decisiones D1, D4, login methods y D5 cerradas por el humano (2026-09-06). Referencias:
`02-research.md` (mapa + Privy), `01-research-questions.md` (D1–D6).

## Principio de diseño

La infraestructura de aislamiento **ya existe** (RLS FORCED + `app.user_id` por
transacción). El sprint no inventa aislamiento: reemplaza **el único seam que
falta** — `DemoIdentityProvider` — por identidad Privy verificada, y termina de
servir los endpoints (`/v1/me`, `/v1/contacts`) que el front ya consume. La
regla: cada request entrante porta un access token Privy verificado; todo lo
demás sigue funcionando con UUID interno.

## D1 — Identity mapping: tabla `users` con UUID interno (decisión propuesta)

```
users (id UUID PK default gen_random_uuid(),
       privy_did TEXT UNIQUE NOT NULL,
       display_name TEXT,
       created_at, last_seen_at)
```

- El DID Privy vive **solo** en `users.privy_did`; todo el resto del sistema
  (RLS, repos, bindings, seeds) sigue hablando UUID. Cero migraciones de
  columnas existentes.
- `PrivyIdentityProvider` verifica el JWT → `sub` (DID) → lookup/upsert en
  `users` → devuelve el UUID interno como `RequestIdentity.userId`.
- `DEMO_USER_ID` desaparece como identidad requerida: pasa a ser el seed del
  modo demo (ver D2).
- Relación con `recipients`/conversations: se agrega FK opcional
  `user_id → users.id` (data existing del demo user: se inserta la fila demo
  en `users` con `privy_did = 'demo'` sentinel en migración).

## D2 — Modo de identidad: `IDENTITY_PROVIDER=demo|privy`

- `demo` (default dev/tests/CI): `DemoIdentityProvider` como hoy — los tests
  y evals no dependen de Privy ni de red.
- `privy` (deploy/local con credenciales): `PrivyIdentityProvider`.
- Config: `PRIVY_APP_ID` público (front `VITE_PRIVY_APP_ID`) + verification
  key / app secret server-side **solo en `.env` nunca commiteado** (Secret
  Vault si hace falta inyectarlo en runtime).
- El seed de recipient memory solo corre en modo demo.

## D3 — RLS: server-mediated, sin cambios de paradigma

- Se mantiene `withUserTransaction` (`app.user_id` = UUID interno resuelto de
  Privy). RLS FORCED sigue siendo la garantía real.
- Nuevo punto RLS: `users` con policy propia (`app.user_id` = row id) para
  `/v1/me`. Las policies existentes no se tocan.
- **Path de upsert en login (R4)**: primer acceso de un DID nuevo requiere
  escribir `users` sin `app.user_id` previo. Propuesta: función
  `SECURITY DEFINER` `users_ensure_for_privy_did(did text, display_name text)`
  owned por el owner de las migraciones, llamada por `PrivyIdentityProvider`
  en la conexión de admin/owner (no por `recipient_app`), que inserta y
  devuelve el UUID. Auditable, sin rol BYPASSRLS extra.
- Text path pierde el `demoUserId` fijo: `memory/runtime.ts` pasa a construir
  el runtime por request con el `userId` de `resolveUserId` (igual que ya hace
  el voice path con `binding.sub`).

## D4 — Contacts: `recipients` como única fuente (decisión propuesta)

- `/v1/contacts` CRUD opera sobre `recipients` (RLS ya activa):
  - `GET /v1/contacts` → recipients activos del usuario.
  - `POST /v1/contacts` → insert con `provenance='user'`,
    `status='confirmed'` (el usuario confirma la dirección al crearla).
  - `PATCH /v1/contacts/:id` → nombre/descripción/address (nueva versión).
  - `DELETE /v1/contacts/:id` → soft delete (`status='archived'`).
  - `POST /v1/contacts/:id/reveal-cbu` → devuelve `address` plano para copiar
    (el front lo muestra con tap-to-reveal; sin encriptación extra en v1 —
    la DB es RLS y el endpoint exige token).
- El agente y la agenda de contactos comparten fuente: lo que confirma el
  usuario en `/perfil` es utilizable por el agente (provenance distingue
  origen). Sin tabla `contacts` duplicada.
- `api-types.ts` (front) espeja `src/contracts/http.ts` en el mismo PR
  (regla dura del repo).

## D5 — Alcance del sprint

- Sí: `/v1/me` (identity bootstrap para el front), `/v1/contacts` CRUD +
  reveal, login Privy end-to-end, token plumbing, `users` + RLS, text path
  per-request.
- No: wallet por usuario (creación vía WDK modular — sprint siguiente,
  Privy es solo auth), bills/agenda/transfers, Supabase Auth, migración de
  datos del demo (queda como seed dev), ZeroDev.

## D6 — Token plumbing en front

- `PrivyProvider` envuelve la app; login screen con SMS/WhatsApp + email
  (público mayor). sesión Privy en default (localStorage).
- `api.ts`: `getApiToken()` → `getAccessToken()` de Privy (async), 401 →
  refresh + retry una vez; logout limpia estado local. El fallback
  `"token-de-desarrollo"` queda solo para dev sin Privy (gated por
  `VITE_IDENTITY_PROVIDER=demo`).
- `sessionStorage nana-wallet-token` se deprecia.

## Flujo de una request (norte)

```
Front (Privy) → Bearer <access token>
  → Fastify: PrivyIdentityProvider.verifyAuthToken
  → DID → users_ensure_for_privy_did (upsert) → UUID interno
  → resolveUserId → withUserTransaction(userId) → SET app.user_id → RLS
```

## Riesgos

- Verificación JWT depende de la verification key: en CI (`demo` mode) no hay
  red Privy — por eso D2. Tests unitarios del provider con tokens firmados
  con una key de test.
- `recipients` con `provenance/status` distintos semánticos (agent vs user):
  definir con el agente que un contacto creado por el usuario no lo pisa la
  memoria del agente (versionado ya existe).
- Capacitor + Privy WebView: riesgo conocido (popup/login en WebView iOS);
  validar en el sprint o dejar mobile para un follow-up explícito.

## Decisiones cerradas (2026-09-06)

1. **D1 — Identity mapping: tabla `users` UUID interno.** Aprobado. El DID
   Privy vive solo en `users.privy_did`; cero migraciones de columnas.
2. **D4 — Contacts sobre `recipients`.** Aprobado. Una sola fuente agente/
   usuario, `provenance` distingue origen, sin tabla `contacts` nueva.
3. **Login: SMS/WhatsApp + email**, sesión localStorage (default Privy).
   Aprobado. Cookies/SSR queda para evaluación futura si se necesita.
4. **D5 — `/v1/me` solo identidad.** Aprobado. Saldo/wallet summary queda
   para el sprint de wallet por usuario.
5. **D2 — Modo de identidad: `IDENTITY_PROVIDER=demo|privy`.** Aprobado.
   Tests/evals/CI corren sin red Privy; deploy usa privy. Seed gated a demo.
6. **R4/D3 — Upsert vía función SECURITY DEFINER.** Aprobado.
   `users_ensure_for_privy_did(did, display_name)` llamada por
   `PrivyIdentityProvider` en la conexión de owner; sin rol BYPASSRLS nuevo.
7. **D6 — Token plumbing: Bearer + retry 401.** Aprobado.
   `getAccessToken()` antes de cada request; 401 → refresh → retry una vez.
   Cookies httpOnly queda como opción futura si aparece SSR.

## Non-goals reafirmados

Wallet por usuario (creación vía WDK modular — sprint siguiente; Privy es
solo auth), bills/agenda/transfers, Supabase Auth, migración de datos del demo.
