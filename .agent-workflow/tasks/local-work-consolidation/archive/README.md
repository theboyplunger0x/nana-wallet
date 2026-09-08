# Archivo de trabajo local

Estas copias conservan variantes anteriores encontradas el 2026-09-08. Sus instrucciones, permisos, listas de pendientes y resultados describen esas sesiones; no cambian la configuración ni el plan vigente.

- `main/`: planes LiveKit anteriores a las enmiendas ya integradas.
- `deploy/`: alternativa de self-host de LiveKit, reemplazada por la implementación actual.
- `observability-port/` y `observability-research/`: reportes y sesiones divergentes. El código original se guarda como `.ts.txt`; la versión revisada está en `src/observability/telemetry-boundary.ts` y sus tests.
- `main-format.patch`: formato original del test, adaptado sobre la versión actual sin perder los tests de Circle.
- `old-demo-recipient.patch`: dirección demo anterior; se conserva la dirección vigente de main.
- `tmp-embed-test.ts.txt`: experimento de embeddings con una ruta local fija. El comando de uso vigente es `npm run memory:prefetch`.

`../inventory.json` registra los worktrees, ramas, commits y estados de origen. Los worktrees originales se preservaron durante la integración.
