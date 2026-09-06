# 01 — Research questions

## Current-state questions

### Answered by repo scan (2026-02, review de deploy en session deploy-test-env)

- **R1 — ¿El front puede deployar a Vercel sin pelear con el config de Lovable?**
  Sí. `@lovable.dev/vite-tanstack-config` soporta explícitamente
  `nitro: { preset: "vercel" }` (documentado en sus `.d.ts`: "Set `preset`
  (e.g. `{ preset: \"vercel\" }`) to hard-pin a target"). Default hoy es
  `cloudflare-module`. El `src/server.ts` del front usa firma
  `fetch(request, env, ctx)` — compatible con la función de Vercel que genera el
  preset. El build mobile (`NANA_MOBILE_BUILD=1`) ya desactiva nitro, así que no
  se cruza con esta vía.
- **R2 — ¿Cómo se configura CORS hoy?**
  `resolveCorsOrigins` en `src/server.ts:20` lee `CORS_ORIGINS` (coma-separado);
  default `localhost:8083`. En deploy: `CORS_ORIGINS=https://<app>.vercel.app`.
  Allowed headers ya cubren `Authorization`, `Idempotency-Key`, `If-None-Match`.
- **R3 — ¿Qué exige el backend en producción?**
  `src/config/process.ts`: con `NODE_ENV=production`, la API exige
  `DATABASE_URL`, `DEMO_USER_ID` (UUID) y `LIVE_VOICE_BINDING_PRIVATE_KEY`. El
  worker exige además `LIVEKIT_URL/API_KEY/API_SECRET`,
  `LIVE_VOICE_BINDING_PUBLIC_KEY` y `OPENAI_API_KEY`. `HOST` default `127.0.0.1`
  — en contenedor hay que pasar `HOST=0.0.0.0`. Son dos procesos: `dist/server.js`
  y `dist/livekit/worker.js`.
- **R4 — ¿La imagen Docker puede correr en modo fixture sin wallet?**
  Sí: `WDK_TOOLS_SOURCE=fixture` no arranca el proceso `wdk-mcp` ni requiere
  wallet/unlock/broadcast (README + architecture.md). El deploy de prueba puede
  ir fixture-only; el postinstall del `wdk-cli` (allowScripts en package.json)
  sigue siendo necesario en la fase de build de la imagen.
- **R5 — ¿Dependencias nativas que compliquen la imagen?**
  Override `better-sqlite3@^13` (compila nativo — necesita toolchain en build
  stage), `@huggingface/transformers` (cache de modelo en
  `.cache/recipient-memory-model` — descarga al primer prefetch; en la imagen se
  puede correr `npm run memory:prefetch` en build o montar volumen). Node
  `>=22.18.0`.
- **R6 — ¿Estado del mobile?**
  Proyectos `android/` e `ios/` ya generados, `mobile:sync` produce SPA en
  `dist/client` + `cap sync`. `capacitor.config.ts` soporta
  `CAPACITOR_DEV_SERVER_URL`. `VITE_API_URL` se hornea en el bundle. Falta:
  firma (keystore), íconos/splash, permisos de micrófono verificados en
  AndroidManifest/Info.plist, pipeline que emita APK, almacenamiento seguro del
  token (hoy `sessionStorage`).
- **R7 — ¿Qué pide CI hoy?**
  Backend job: lint/typecheck/test/eval contra Postgres del compose. Frontend
  job: lint/typecheck/test. No hay build de producción del front ni jobs de
  deploy — el pipeline de deploy es nuevo.

### Open — decisiones de producto/infra (para design)

- **D1 — Host del backend (imagen Docker):** Railway vs Render vs Fly.io vs VPS.
  Tradeoffs: costo, soporte de dos procesos/contenedores, deploy desde GH,
  latencia desde Argentina, tier free.
- **D2 — Postgres hosteado:** Supabase cloud (proyecto dedicado) vs otro pgvector
  provider. Implica correr `db:migrate` + seed contra el hosted y mover
  `DEMO_USER_ID` a un UUID del hosted.
- **D3 — ¿Voz live en el entorno de prueba?** LiveKit Cloud project + OpenAI key
  en el worker desplegado, vs front desplegado sin voz para la primera vuelta.
  Implica claves en el host y llave Ed25519 de binding gestionada ahí.
- **D4 — Binario mobile objetivo:** APK Android sideload (más rápido) vs
  TestFlight iOS (requiere cuenta + revisión). Para hackathon-test, Android APK
  primero.
- **D5 — Dominio:** subdominio vercel.app vs dominio propio; afecta
  `CORS_ORIGINS` y `VITE_API_URL`.

## Scope exclusions

- No hay modo live WDK ni wallet real en este entorno de prueba.
- No se publica en stores.
- No se toca el contrato `/v1` ni el flujo de preview/confirm.
- Autenticación real queda como deuda explícita (se deploya con `DEMO_USER_ID`).