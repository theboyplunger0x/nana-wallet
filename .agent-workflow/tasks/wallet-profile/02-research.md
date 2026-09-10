# Investigación del estado actual

Evidencia: código de la instantánea registrada en privy-snapshot.json. Inspección estática; no prueba funcional.

## Base
main y origin/main apuntan a e9fcd84 tras git fetch origin. gh pr list --state open devolvió una lista vacía. Las ramas feat/privy-multi-user-foundation y fix/privy-plan-before-merge están limpias; la implementación en curso está sin commit en /private/tmp/nana-privy-specs-20260908. Se copiaron 123 archivos modificados o nuevos al worktree separado. El número incluye archivos dentro de directorios nuevos.

## Perfil
src/api/me.ts registra GET /v1/me con autenticación y lectura de la fila propia mediante withUserTransaction. Devuelve userId y displayName nullable. La migración src/db/migrations/004_users.sql almacena display_name, privy_did y timestamps; no almacena email, teléfono, DNI o ciudad. El tipo MeResponse en apps/nana-wallet/src/lib/api-types.ts refleja ese contrato.

src/auth/privy-identity.ts pasa el claim opcional name al aprovisionamiento. users_ensure_for_privy_did actualiza last_seen_at, pero no rellena un nombre ausente en logins posteriores. No hay evidencia de que todo usuario tenga nombre. Que el SDK pueda conocer otros datos no demuestra que el contrato actual los exponga.

apps/nana-wallet/src/routes/perfil.tsx ya muestra displayName o «Tu perfil». También consulta contactos, agenda, facturas y resumen de wallet. El estado de carga agrupa esas consultas; la vista de identidad sigue dependiendo de módulos que no necesita. Con /me fallido y consultas dependientes deshabilitadas, debe verificarse que no permanezca en carga indefinidamente.

## Billetera
BottomNav.tsx ya enlaza Billetera a /mi-plata. La ruta pide /v1/wallet/summary y movimientos mediante api.ts, muestra «Total en pesos» y cuentas. Esas pantallas corresponden a datos de MSW, sin rutas backend equivalentes observadas en src/api ni en el registro de src/server.ts.

GET /v1/wallets/current en src/api/wallets.ts resuelve userId y la wallet embedded propia. CurrentWalletResponse expone estado, dirección, chainFamily y proveedor; no contiene monedas ni saldo.

GET /v1/wallet/balance en src/api/wallet.ts autentica, pero llama a dependencies.wallet con la constante WALLET. src/server.ts le entrega core.walletReads. Autenticar al usuario no selecciona su wallet embedded: este endpoint no sirve como lectura personal sin cambiar ese contrato.

src/wallet/privy-client.ts fija Arc testnet (5042002) y USDC. No se encontró una lectura de balances personales en el servicio embedded. Mostrar varias monedas requiere definir un catálogo y una lectura por activo; no está resuelto por la lista de wallets de Privy.

## Verificación disponible
Hay tests de identidad, /me, aislamiento entre usuarios y lifecycle de wallets. npm run test:e2e:browser llama scripts/run-browser-e2e.mjs, que contiene puertos fijos y nombre de contenedor concreto. Debe adaptarse o parametrizarse para el worktree y Portless, y comprobar que sus escenarios cubran Perfil y saldos con backend real, sin aceptar un skip de Chromium como prueba E2E.

Pendiente de prueba funcional: login, datos reales disponibles en Privy, lecturas RPC, latencia, render y aislamiento efectivo de caché. No se consultaron cuentas ni credenciales.
