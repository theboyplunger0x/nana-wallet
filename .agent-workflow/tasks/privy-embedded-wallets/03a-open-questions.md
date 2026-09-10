# Decisiones resueltas

Fecha: 2026-09-08. Revisión: r2.

| ID | Decisión del usuario | Alcance |
|---|---|---|
| D1 | Backend con permiso limitado | Wallet propiedad del usuario; firmante backend revocable, acotado y separado del login. Cada pago conserva preview y confirmación explícita. |
| D2 | Flujo de Privy | Recuperación mediante el flujo soportado por Privy para la wallet elegida; conservar la misma dirección. No se agrega contraseña de recuperación propia de Nana. |
| D3 | Arc Testnet | USDC de prueba; una sola red. ZeroDev y mainnet quedan fuera. |
| D7, base login | Conservar canal configurado | El "sí" se interpreta como aceptar la recomendación anterior de conservar el canal telefónico configurado, más email. No identifica SMS o WhatsApp. |

Respuesta registrada literalmente: "Backend con permiso limitado / flujo de privy / Arc Testnet / si".

No quedan elecciones de producto entre las alternativas de r1. El diseño consolidado aplica esas decisiones; no equivale a una autorización de implementación ni de firma live. El outline queda sujeto a revisión y aprobación.

## Comprobaciones de implementación

- El canal telefónico exacto todavía no está verificado. vault-env list no devolvió nombres PRIVY_*; no se consultó el dashboard. Conservar el canal existente cuando sea accesible. Si la app no existe o no tiene canal, presentar ese hecho antes de configurarlo.
- Fijar versión compatible de SDK y comprobar recovery, ownership, signer enrollment/revocation, policy evaluation y firma en chain 5042002.
- Los límites numéricos, destinatarios habilitados y vencimiento son parámetros explícitos de cada permiso que el usuario revisa al concederlo. No se asumen límites ilimitados ni se activa un permiso con campos ausentes.
