# 02 — Research

Fecha: 2026-02 · Worktree `deploy-test-env` · Preguntas de referencia: `01-research-questions.md`

## 1. Frontend en Vercel — factibilidad confirmada

**Cómo deploya TanStack Start hoy.** El web build sale por Nitro (`nitro/vite`)
con preset default `cloudflare-module` (lo inyecta `@lovable.dev/vite-tanstack-config`).
El propio paquete documenta el override:

```ts
// apps/nana-wallet/vite.config.ts
export default defineConfig({
  nitro: { preset: "vercel" },
  // ...
});
```

Notas:

- `src/server.ts` (entry SSR con wrapper de errores) compila a la función
  serverless del preset `vercel` sin cambios; la firma `fetch(request, env, ctx)`
  es la misma.
- `NANA_MOBILE_BUILD=1` apaga nitro y produce la SPA de Capacitor — sin
  interferencia con el deploy web.
- El front usa MSW solo en dev; en producción todas las llamadas van a
  `VITE_API_URL` (`src/lib/api.ts:88`). Esa variable se hornea en build → se
  configura como env de build en Vercel.
- **Pendiente de validar en implementación:** que el output del preset `vercel`
  no requiera `vercel.json` extra (routes/functions). Probable que el preset
  solo alcance; se verifica con un build + `vercel deploy` local antes de
  conectar el repo.

## 2. Backend como imagen Docker — diseño propuesto (a validar en design gate)

**No existe Dockerfile hoy** (solo `docker/init/001-recipient-app.sql` para el
compose). La imagen propuesta:

- Build stage: `node:22.18-bookworm` → `npm ci` (respeta `allowScripts` del
  `wdk-cli`, compila `better-sqlite3`) → `npm run build` (tsc).
- Runtime stage: imagen slim con `dist/` + `node_modules` productivos + (opcional)
  cache del modelo de embeddings via `npm run memory:prefetch` o volumen.
- Dos procesos en la imagen: `node dist/server.js` y `node dist/livekit/worker.js`.
  El worker solo arranca si sus env completos existen (fail-closed en
  `readWorkerProcessConfig`), lo que permite correr la API sola en modo texto.
- Env requerido por la API en prod: `DATABASE_URL`, `DEMO_USER_ID`,
  `LIVE_VOICE_BINDING_PRIVATE_KEY` (o dejar `NODE_ENV` fuera de `production` en
  test — decisión del design gate), `CORS_ORIGINS`, `HOST=0.0.0.0`, `PORT`.
- Para desarrollo local: la imagen corre contra el Postgres del `compose.yaml`
  existente — reemplaza el flujo "npm ci + tsx watch" por `docker compose up`.

## 3. Base de datos hosteada

Supabase cloud (Postgres 17 + pgvector) es el camino natural: el repo ya usa
Supabase local con el mismo esquema (`supabase/migrations/`). Tareas: crear
proyecto, correr `db:migrate` + `db:seed` contra el hosted, definir `DEMO_USER_ID`
fijo como tenant de prueba, y connection strings (pooler para serverless-side
API, directo para migraciones).

## 4. Voice live — costos y precondiciones

Si entra al alcance: LiveKit Cloud project (URL + key/secret), `OPENAI_API_KEY`
(Realtime), par Ed25519 binding (`LIVE_VOICE_BINDING_PRIVATE_KEY` en la API,
`PUBLIC_KEY` en el worker — runbook: `docs/livekit-development-runbook.md`). La
app soporta arrancar sin worker: la voz queda ausente y el texto completo
funciona. Recomendación provisional: fase 2, después de texto en verde.

## 5. Mobile — brechas concretas

| Gap | Detalle |
| --- | --- |
| Firma Android | Generar keystore, config de signing en `android/app/build.gradle` |
| Íconos/splash | `@capacitor/assets` o assets manuales |
| Permisos mic | Verificar `AndroidManifest.xml` (RECORD_AUDIO) e `Info.plist` (NSMicrophoneUsageDescription) |
| Pipeline APK | GitHub Actions: `npm run mobile:sync` + gradle assembleDebug/Release con keystore en secret |
| Token storage | `sessionStorage` hoy; para binario instalable conviene Capacitor Preferences (queda como deuda si es hackathon-test) |
| Backend URL | `VITE_API_URL` HTTPS del backend desplegado al momento del build |
| iOS | Xcode + cuenta Apple; TestFlight requiere revisión — se deja fuera salvo decisión D4 |

## 6. Research de hosting para el backend Docker (D1) — 2026-02

Workload a hostear: dos procesos Node 22 siempre encendidos — API HTTP y
worker LiveKit con WebSocket persistente (no puede dormirse ni tener cold
starts, si no las rooms de voz se cortan). DB externa (Supabase), así que no
importa el Postgres del host.

| Plataforma | Modelo de precio | Sleep/cold start | Ajuste al workload |
| --- | --- | --- | --- |
| **Render** | Planes fijos: Starter ~$7/mo por servicio siempre-on; tipo "Background Worker" dedicado para procesos no-HTTP | Free tier duerme por inactividad; planes pagos siempre-on | El mejor encaje directo: Web Service (API) + Background Worker (LiveKit worker), cero ops, precio predecible (~$14/mo). Lowest-thought default según comparativas 2026 para "always-on agent API + worker" |
| **Railway** | Uso real (RAM $10/GB-mo, CPU $20/vCPU-mo) + mínimo plan Hobby $5/mo; sleep serverless es **opcional** (apagable en settings) | Sin cold starts si se desactiva app sleeping; misma imagen dos servicios con distinto comando | Muy buena DX y deploy rápido; riesgo conocido: outage platform-wide de 8h en mayo 2026 (cuenta suspendida por GCP). Costo ~$5–10/mo para tráfico bajo |
| **Fly.io** | Por máquina: shared-1x 256MB ~$2/mo; full control Docker | Sin sleep si la máquina corre siempre; scale-to-zero opcional (NO usar para el worker) | La más barata siempre-on (~$4–6/mo las dos máquinas); requiere gestionar machines (fly.toml, deploy CLI). Solo opción con scale-to-zero real para worker no-HTTP, pero no lo queremos para voz |
| **VPS** | Fijo desde ~$5/mo | Nada duerme | Control total pero toda la ops es manual (TLS, restart, monitoreo); se descarta para hackathon |

Hallazgos de seguridad/estabilidad: Railway tuvo un outage de 8 horas en
mayo 2026 (suspensión de cuenta en GCP); Render cerró Serie C ($1.5B) con
infraestructura sobre AWS/GCP madura; Fly.io opera machines propias con buen
track record para apps realtime (su origen es full-text apps con WebSockets).

**Recomendación provisional: Render** (Web Service + Background Worker,
siempre-on, cero sleep, mínima ops) con **Fly.io** como alternativa económica.
Railway queda tercera por el outage reciente.

## 7. Riesgos identificados

- `VITE_API_URL` se hornea en build: cambiar de backend re-deploya front. Mitigar con dominio estable del backend.
- Ambigüedad de errores de red frente a backend desplegado: el contrato
  (rechazo definitivo vs error ambiguo) ya está en el front; no tocarlo.
- Secretos: nada de `VITE_*`; backend envs solo en el host (Vault/vars del
  proveedor). Nunca commitear `.env`.
- Costo/latencia: elegir región del host cercana (eeuu/us-east suele bastar para
  LiveKit Cloud + Supabase).