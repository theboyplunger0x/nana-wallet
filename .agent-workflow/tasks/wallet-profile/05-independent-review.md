# Revisión independiente del plan

Estado: completada. Plan revisado: 04-structure-outline.md r2, SHA-256 9945e035bad67e4e42abb7f9629411d140a472e0ec401ba6f72610d63655fd32.
Revisor: Pi, proveedor nan, modelo glm5.3-flash, razonamiento high.
Herdr workspace w1C, tab w1C:t1N, pane w1C:p3F, agente wallet-profile-review-20260909.
Sesión: /Users/ramiro/.pi/agent/sessions/--private-tmp-nana-wallet-profile-rpi-20260909--/2026-09-09T20-57-04-799Z_01a087f5-c01f-709d-9a8a-225efe5b3e61.jsonl (kind path, source herdr:pi).

## Alcance y evidencia
Diseño r1 y Q1-Q3 aprobados por Ramiro. Se revisó el outline contra el código de la instantánea Privy; sin implementar. Informes originales: review-r1.md y review-r2.md.

R1: hash 56ef74e46627e730a6110f3d4bd7453fd951f993bd2465d3d188fa9d02b7f806. Detectó un hallazgo controlante (precisar interfaz USDC de seis decimales), dos mayores (accesos retirados y flag MSW) y observaciones menores. El veredicto condicional r1 no se trató como aprobación.

R2: hash 9945e035bad67e4e42abb7f9629411d140a472e0ec401ba6f72610d63655fd32. Veredicto «LISTO — incondicional, para aprobación humana». Cero hallazgos críticos, controlantes o mayores abiertos. F1–F4 cerrados. Referencia incorrecta a src/wallet/session-isolation.ts corregida por el propio revisor en r2: la guardia está en el frontend.

## Menores trasladados a spec
- Definir queryKeys.balances(userId, chainId) con raíz balances y su invalidación explícita.
- Eliminar la etiqueta de userId del perfil simple: no es un dato personal para mostrar. El plan ya excluye IDs internos.
- Enumerar los puntos de confirmación existentes que deben invalidar balances; conservar los flujos de pago sin alterar preview/confirmación.

Estas precisiones se resuelven en SDD y no modifican el alcance aprobado ni el hash revisado. Si introducen cambio controlante, revisar nuevamente el plan.

## Aprobación humana del outline
Gate ID: wallet-profile-outline-r2.
Decision / allowed mutation: aprobar plan r2 y avanzar a SDD antes de apply.
Explicit exclusions: cambios de alcance, pagos reales, merge, publicación y descarte de trabajo ajeno.
Owning artifact / revision or hash: 04-structure-outline.md r2, 9945e035bad67e4e42abb7f9629411d140a472e0ec401ba6f72610d63655fd32.
Decision owner: Ramiro.
Approved by / trusted identity: Ramiro, mensaje «si» en respuesta a la solicitud de aprobar el plan y avanzar a SDD.
Approved at: registrado 2026-09-09T21:09:13.775544+00:00.
Status: approved.
Invalidated by: cambios controlantes en diseño, outline o base Privy.

## Limpieza
Revisiones y sesión persistidas antes del cierre. Cierre pendiente únicamente de w1C:t1N; no tocar tabs preexistentes.

Limpieza verificada: herdr tab close w1C:t1N devolvió ok. Listado posterior: w1C:t1E, w1C:t1K y w1C:t1M presentes; w1C:t1N ausente. Resultado y sesión persistidos antes del cierre. Worktree conservado. Para retomar Pi: nueva tab en workspace w1C, mismo cwd y --session con la referencia registrada, nan/glm5.3-flash thinking high.
