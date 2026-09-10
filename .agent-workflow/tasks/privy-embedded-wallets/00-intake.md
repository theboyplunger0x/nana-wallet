# Privy embedded wallets: intake

Fecha: 2026-09-08. Estado: decisiones de producto resueltas; outline r2 en revision.

## Objetivo y autoridad

El usuario pidió corregir la spec de login y preparar una spec dependiente para wallet embebida. Se autoriza escribir artefactos de planificación. No se habilitan wallets live, no se crean wallets externas, no se envían transacciones y no se registra aprobación de implementación.

Resultado esperado: cada persona inicia sesión con Privy y accede a su propia wallet; la app y el agente muestran y operan esa misma wallet, con preview y confirmación explícita. La identidad proviene de `privy-multi-user-foundation`.

## Límites

Web primero, una wallet EVM por usuario y una red de prueba para validar la primera entrega. ZeroDev, mainnet, automatismos offline y mobile Capacitor requieren alcance posterior. Se conserva fixture como configuración predeterminada. Decisiones aprobadas: backend con permiso limitado, recuperacion Privy y Arc Testnet; registro en `03a-open-questions.md`.

## Worktree

Repositorio origen: /Users/ramiro/Desktop/projects/personales/aleph-hackathon
Rama origen: main
Commit origen: e9fcd84
Rama documental: docs/privy-login-embedded-specs
Worktree: /private/tmp/nana-privy-specs-20260908
Limpieza: conservar para revisión y continuación; no se modificó main ni se creó un commit.
