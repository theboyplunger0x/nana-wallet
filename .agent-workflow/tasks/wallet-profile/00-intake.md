# Billetera y Mi perfil

Fecha: 2026-09-09. Ruta elegida: RPI; interpretamos «rdi» como investigación y discusión de diseño antes de implementar.

## Pedido
Mostrar en Mi perfil el nombre y los datos disponibles de la persona. Mostrar en Billetera el saldo y las monedas de su wallet. Trabajar en un worktree separado que incluya el cambio de Privy en curso.

## Identidad del trabajo
- Repositorio original: /Users/ramiro/Desktop/projects/personales/aleph-hackathon.
- Base: main, e9fcd84429af92e5b4098f5f92d3aa7a861c6bb5; origin/main coincide luego de fetch.
- Rama nueva: docs/wallet-profile-rpi.
- Worktree: /private/tmp/nana-wallet-profile-rpi-20260909.
- Privy: instantánea del worktree /private/tmp/nana-privy-specs-20260908, rama docs/privy-login-embedded-specs, mismo HEAD que main, con trabajo sin commit.
- privy-snapshot.json registra los archivos heredados y sus hashes. La instantánea no constituye un commit ni una base Privy validada. Los cambios posteriores del origen no se sincronizan automáticamente.
- Creación: Worktrunk, sin hooks. Se conserva el worktree para continuar; no hubo commits, push ni cambios al checkout original.

## Autoridad y alcance
Autorizado: inspección, worktree separado, copia del estado de trabajo Privy y artefactos RPI. Escrituras propias limitadas a este directorio de planificación. No implementar nuevas funcionalidades hasta aprobar diseño y outline. No habilitar WDK live, operar fondos ni copiar archivos de secretos.

## Evidencia de aceptación propuesta
Perfil muestra solo datos disponibles de la sesión actual, con estados de carga, error y dato ausente. Billetera presenta monedas, cantidades y red de la wallet del usuario; distingue cero, wallet inexistente y consulta fallida. Cambiar de cuenta nunca muestra datos de la sesión anterior.

Diseño r1 y Q1-Q3 aprobados por Ramiro con «si». Outline r2 y revisión independiente completados. Outline r2 aprobado por Ramiro con «si». Fase autorizada actual: artefactos SDD y su validación. El outline revisado se conserva byte a byte; sus aprobaciones están en 05-independent-review.md.

Estado actual: fase SDD completada y validada; evidencia en openspec/changes/wallet-profile/validation.md. Antes de apply sigue pendiente reconciliar commit final de Privy y registrar worktree de implementación.
