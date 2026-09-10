# Investigación: estado comprobado

Fecha: 2026-09-08. Base local: e9fcd84. No se ejecutaron SDKs ni se accedió a cuentas Privy.

## Código del repositorio

- `src/server.ts` crea dependencias de wallet una vez y usa DemoIdentityProvider; el token de voz recibe demoUserId. La base Privy debe corregirlo antes de incorporar wallets.
- `src/wallet/provider.ts` expone lecturas, preview, broadcast y finality; `WalletContext` no representa una identidad autenticada. El parámetro wallet no es evidencia de propiedad.
- `src/conversations/service.ts` reclama previews y sigue broadcast/finality en backend. La firma interactiva desde navegador requiere un estado durable para esa espera y reconciliación; no basta con reemplazar el SDK del provider.
- `src/wallet/agent-tools.ts` exige un preview confirmado. Debe conservarse ese control independientemente del firmante.
- `apps/nana-wallet/src/lib/api.ts` tiene claves globales de caché; la base corregida exige aislamiento por UUID y limpieza completa al cambiar de cuenta.
- El frontend y el backend compilan por separado. No hay script de E2E de navegador en sus package.json actuales.

## Fuentes primarias consultadas

[Creación de wallets](https://docs.privy.io/wallets/wallets/create/create-a-wallet): Privy distingue owner de usuario, organización y authorization key. Los SDK cliente crean wallets del usuario; la configuración admite creación automática. La selección de owner debe verificarse en servidor.

[Firma por usuario o servidor](https://docs.privy.io/wallets/using-wallets/signers/quickstart): el usuario puede operar desde el SDK cliente; el servidor requiere un firmante autorizado. Un login por sí solo no define los permisos del agente.

[Recuperación en un nuevo dispositivo](https://docs.privy.io/wallets/advanced-topics/new-devices/provision-new-devices) y [ejecución en dispositivo](https://docs.privy.io/security/wallet-infrastructure/advanced/user-device): existen modalidades de recuperación gestionadas por Privy y por el usuario. La modalidad exacta debe verificarse para el tipo de wallet y SDK elegidos; no se asume que una guía de arquitectura anterior describa cualquier wallet actual.

[SMS y WhatsApp](https://docs.privy.io/authentication/user-authentication/login-methods/sms-whatsapp): la configuración y entrega de OTP necesitan prueba con la app Privy del proyecto.

[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): FORCE RLS también alcanza a owners ordinarios. La base de identidad agrega una policy exclusiva del owner y prueba NOBYPASSRLS.

## Inferencias de diseño historicas (r1, sustituidas por r2)

Una tabla local de vínculos debe resolver UUID interno a wallet verificada; el DID permanece en users. El cliente no puede registrar como propia una dirección arbitraria. La misma resolución debe usarse en texto, voz y lecturas de saldo. La creación externa y el insert local no forman una transacción atómica: ante un timeout se consulta/reconcilia antes de crear otra wallet.

La opción recomendada para discusión es firma interactiva del usuario. Mantiene al usuario presente en cada pago, pero requiere diseñar el paso entre confirmación de Nana y firma de Privy. No se afirma que esté aprobada.

## Actualización r2

Decisiones del usuario: backend con permiso limitado, recuperación Privy, Arc Testnet. Arc documenta chain 5042002, USDC ERC-20 6 decimales y gas nativo 18. Privy documenta políticas sobre calldata y agregaciones para eth_signTransaction; se elige firma backend más broadcast RPC propio para persistir/verificar hash antes de transmitir. La capacidad exacta de caps/fees/owner restrictions debe probarse con la app configurada. vault-env list no presentó nombres PRIVY_*; no se inspeccionaron valores ni dashboard.

Fuentes: https://docs.arc.io/arc/references/connect-to-arc ; https://docs.arc.io/arc/references/contract-addresses ; https://docs.privy.io/controls/policies/stateful-policies ; https://docs.privy.io/api-reference/wallets/ethereum/eth-sign-transaction
