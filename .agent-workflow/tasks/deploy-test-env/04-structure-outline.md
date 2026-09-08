# 04 — Structure outline

Estado: draft para aprobación antes de implementación. Design: `03-design-discussion.md` (APROBADO). Decisiones: Render, Supabase cloud, voz live fase aparte, APK Android.

## Work units (orden de dependencias)

### WU1 — Imagen Docker del backend + compose (F0)
- `Dockerfile` multi-stage en raíz:
  - Build: `node:22.18-bookworm`, `npm ci` (respeta `allowScripts` del wdk-cli),
    `npm run build` (tsc), `npm run memory:prefetch` (bakea cache del modelo).
  - Runtime: slim, copia `dist/` + `node_modules` productivos + cache modelo,
    `HOST=0.0.0.0` default, `NODE_ENV` configurable.
  - Entrypoints por argumento: `api` → `node dist/server.js`; `worker` →
    `node dist/livekit/worker.js` (misma imagen, dos comandos).
- `.dockerignore` (node_modules, .cache, tests, apps/).
- `compose.yaml`: servicio `backend` (perfil dev) contra el `db` existente,
  smoke manual del flujo fixture de texto.
- Verificación: `docker compose up` local + tests del repo en verde.

### WU2 — Supabase cloud + migraciones (F1a)
- Crear proyecto Supabase (acción del humano: cuenta/organización).
- Documentar/automatizar: `DATABASE_URL`/`DATABASE_ADMIN_URL` apuntando al
  hosted, `npm run db:migrate`, `npm run db:seed`, `DEMO_USER_ID` UUID fijo.
- Guardar envs fuera del repo (Render env groups / .env local ignorado).

### WU3 — Deploy del backend en Render (F1b)
- 2 servicios desde la misma imagen: `api` (Web Service) y `voice-worker`
  (Background Worker, solo cuando WU5 entregue las envs de LiveKit).
- API con `CORS_ORIGINS=https://<vercel-app>.vercel.app`.
- Decisión `NODE_ENV`: ir con `NODE_ENV=production` + generar par Ed25519 de
  binding ya en WU3 (más honesto que desactivar el gate).
- Verificación: `/v1/health` público, chat de texto E2E desde el front local
  apuntando al backend desplegado.

### WU4 — Front en Vercel (F2)
- `apps/nana-wallet/vite.config.ts`: `nitro: { preset: "vercel" }` (solo build
  web; el mobile build ya apaga nitro).
- Proyecto Vercel conectado al repo, root `apps/nana-wallet`, env de build
  `VITE_API_URL=https://<api>.onrender.com`.
- Validar output del preset (¿requiere `vercel.json`?) con deploy de prueba.
- Verificación: flujo preview→confirm completo desde el vercel.app.

### WU5 — Voz live en el desplegado (F3)
- LiveKit Cloud project + `OPENAI_API_KEY` + par Ed25519 en Render envs.
- Habilitar servicio `voice-worker` (env completa → arranca fail-closed).
- Verificación: sesión de voz desde el front desplegado; confirmaciones por voz
  respetando las guardas existentes.

### WU6 — APK Android (F4)
- Íconos/splash (`@capacitor/assets`), revisar `RECORD_AUDIO` en
  `AndroidManifest.xml` y descripción de mic en `Info.plist` (iOS igual se toca
  mínimamente para no romper `cap sync`).
- Keystore + signing config en `android/app/build.gradle` (keystore fuera del
  repo, secret de CI).
- Workflow GitHub Actions: build SPA (`mobile:sync`) + `assembleRelease` +
  artifact APK descargable.
- Build con `VITE_API_URL` productivo.

### WU7 — Runbook de deploy + docs (F5)
- `docs/deploy-runbook.md`: cómo redeployar cada pieza, envs de cada servicio,
  rotación de claves Ed25519, límites y costos.
- README: sección de entorno de prueba enlazando el runbook.

## Orden sugerido

WU1 → WU2 → WU3 → WU4 → WU5 → WU6 → WU7 (WU6 y WU7 pueden paralelizar con WU5).

## Fuera de alcance

- Modo live WDK / wallet real; stores; iOS binario; auth real (`DEMO_USER_ID`
  queda documentado como deuda).
- Autocalificación de uptime: Render free tier no entra en juego (servicios pagos).

## Skills a cargar en implementación

- `.agents/skills/worktree-first-development/SKILL.md` (worktree ya creado: `deploy-test-env`)
- `.agents/skills/nana-wallet-flow/SKILL.md` equivalente: `.pi/skills/nana-wallet-flow/SKILL.md`
- Implementación vía SDD en `openspec/` (etapa 2 del flujo del repo).