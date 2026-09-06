# 00 — Intake

## Outcome

Dejar Nana Wallet corriendo en un entorno de prueba completo y accesible, sin
dependencias del setup local de nadie:

- Frontend web en Vercel (SSR).
- Backend (API Fastify + LiveKit worker) empaquetado en una **imagen Docker**
  reutilizable: sirve para deploy en un host de procesos largos y también para
  correr local sin problemas de setup.
- Postgres con pgvector hosteado (Supabase).
- App mobile (Capacitor) con build instalable para prueba.

Objetivo final: una URL pública del front que hable con un backend desplegado,
mismo flujo fixture (`WDK_TOOLS_SOURCE=fixture`), y un binario mobile instalable.

## Acceptance evidence (provisional)

- `docker build` y `docker run` del backend funcionan local contra el compose de
  Postgres, y la misma imagen corre en el host elegido.
- Front desplegado en Vercel consume el backend desplegado (flujo de texto
  completo: chat, preview, confirmación).
- Worker de voz conectado a LiveKit Cloud con voz live funcionando desde el front
  desplegado (o decisión explícita de dejar voz fuera del alcance de esta etapa).
- APK Android instalable que apunta al backend desplegado.
- Suite de tests del repo en verde; CI sigue pasando.

## Granted authority

- Read: entire repository, docs, runbooks, CI config.
- Write (planning artifacts): `.agent-workflow/tasks/deploy-test-env/`.
- Write (implementation): NOT yet granted — bound to design approval.

## Read scope

- `src/server.ts`, `src/config/process.ts`, `src/livekit/worker.ts` (env, hosts, CORS)
- `apps/nana-wallet/vite.config.ts`, `capacitor.config.ts`, `src/lib/api.ts`
- `docs/local-live-runbook.md`, `docs/livekit-development-runbook.md`, `docs/demo-runbook.md`
- `.github/workflows/ci.yml`, `compose.yaml`, `supabase/`

## Write scope (implementation, tentative until design approval)

- `Dockerfile` (raíz) + ajustes mínimos en `compose.yaml` si corresponde
- `apps/nana-wallet/vite.config.ts` (preset nitro vercel), `vercel.json` si hace falta
- `.github/workflows/` (build/deploy pipelines, mobile build)
- Configs Capacitor / Android manifest (permisos micrófono, icons)
- Docs: runbook de deploy

## Non-goals (provisional)

- Modo live WDK real en el entorno de prueba (fixture only).
- Publicación en Play Store / App Store (solo binarios de prueba).
- Cambios al contrato HTTP `/v1`.
- Reemplazar `DEMO_USER_ID` por autenticación real (queda marcado como deuda).

## Selected route

RPI workflow (convención del repo). Current phase: intake → research questions.

## Active gate

Research gate: validar factibilidad de Vercel (preset nitro), imagen Docker del
backend, y el estado real del mobile antes de diseñar.