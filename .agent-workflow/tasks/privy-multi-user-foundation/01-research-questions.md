# 01 — Research questions

## Research (R)

- **R1 — Privy mechanics**: verificación server-side exacta (`@privy-io/node`,
  `verifyAuthToken`), estructura del access token (claims `sub`/`sid`/`aud`,
  expiración), ciclo de refresh, y qué datos del user trae. ¿Necesitamos el
  app secret server-side solo para verificar, o hace falta `PrivyClient` REST?
- **R2 — Privy en el front Nana**: `@privy-io/react-auth` sobre
  TanStack Start + React 19 + Tailwind 4; ¿funciona en Capacitor (WebView iOS/
  Android)? Métodos de login adecuados para el público (SMS/WhatsApp/email).
  Config de `VITE_PRIVY_APP_ID`.
- **R3 — DID ↔ UUID**: el DID de Privy (`did:privy:<cuid>`) no es UUID. ¿Cómo
  lo mapeamos a los `user_id UUID` existentes (RLS `app.user_id`, repos,
  `withUserTransaction`)? ¿Alterar tipos o tabla `users` con UUID interno?
- **R4 — Upsert en login**: la primera request de un usuario nuevo debe crear
  su fila en `users`, pero el camino actual de transacciones setea
  `app.user_id` *después* de conocer el usuario. ¿SECURITY DEFINER function,
  rol admin adicional, o el endpoint de login usa un cliente aparte?
- **R5 — contacts↔recipients**: el front llama `/v1/contacts` CRUD +
  `/reveal-cbu` pero el backend no lo sirve. ¿Expone `recipients` (memoria del
  agente, ya RLS) como contacts, o tabla nueva `contacts`? ¿Qué es
  `reveal-cbu` (address encriptado / alias argentino)?

## Design decisions (D)

- **D1 — Identity mapping**: tabla `users` (id UUID PK, privy_did UNIQUE) que
  preserva el tipo UUID actual, vs. migrar columnas `user_id` a TEXT y usar el
  DID directo.
- **D2 — Demo/dev mode**: `IDENTITY_PROVIDER=demo|privy` con
  `DemoIdentityProvider` para tests y CI (sin Privy), Privy para deploy. El
  seed de recipient memory queda gated a demo.
- **D3 — RLS approach**: mantener RLS server-mediated (`app.user_id` via
  `withUserTransaction`) — verificar que ningún path quede con RLS sin
  contexto. (Descartado: Supabase Auth + `auth.uid()`.)
- **D4 — Contacts source**: `recipients` como única fuente (provenance
  user/agent) vs tabla `contacts` separada.
- **D5 — Alcance de endpoints multi-user**: solo `/v1/me` + `/v1/contacts` en
  este sprint; bills/agenda/transfers fuera.
- **D6 — Token plumbing en front**: reemplazar el `getApiToken()`
  sessionStorage por `getAccessToken()` de Privy; manejo de 401 → refresh →
  retry; ¿localStorage vs cookies de Privy?
