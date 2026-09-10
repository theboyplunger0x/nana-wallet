# Plan de implementación r2

Diseño: 03-design-discussion.md r1, aprobado por Ramiro. Q1-Q3 resueltas. Estado del plan: pendiente de revisión independiente y aprobación humana. Este documento no autoriza implementación.

## Alcance acordado
Perfil de solo lectura: nombre existente o estado de dato ausente. Billetera: USDC de Arc testnet en la wallet personal de Privy. Sin conversión a pesos, otras monedas, edición de datos ni cambios de pagos. Pantallas simples; preservar el código de módulos secundarios.

## Base y paso a SDD
Antes de apply, identificar el commit final de Privy y comparar con privy-snapshot.json. No copiar trabajo nuevo silenciosamente ni descartar cambios locales. Si aún no existe un commit de Privy, registrar esa dependencia como pendiente y no presentar la instantánea como base final. No hace falta bloquear la revisión documental.

Después de aprobar este outline: preparar openspec/changes/wallet-profile/{proposal.md,design.md,tasks.md,specs/wallet-profile/spec.md}, siguiendo proposal → spec → design → tasks. Reflejar los escenarios de este plan y ajustar solo el contexto obsoleto que contradiga el alcance front/back ya autorizado. Validar esos artefactos antes de apply. Crear el worktree de implementación desde la base Privy reconciliada y registrar rama, commit y artefactos trasladados. No cambiar main ni publicar automáticamente.

## Contrato que deben fijar las specs
GET /v1/me conserva userId y displayName nullable. No agregar campos que no existen. Normalizar null, vacío y espacios como nombre ausente en UI; preservar el nombre almacenado sin editarlo.

GET /v1/wallets/current/balances requiere identidad validada. Sin parámetros de dueño, dirección, red o token elegibles por el navegador. Resuelve la wallet con EmbeddedWalletService.getCurrentWallet(userId), que lee bajo RLS. Para esta versión la red y el contrato salen de un catálogo server-side cerrado: Arc testnet 5042002, USDC, seis decimales, contrato de la base Privy. Verificar esos metadatos contra fuentes oficiales al implementar el adaptador RPC.

Respuesta en ApiEnvelope, unión discriminada:
- walletState ready: address, chainId, networkName, testnet true, source fixture|rpc, observedAt ISO UTC y assets con tokenId (chainId:contract), contract, symbol USDC, name USD Coin, decimals 6 y balanceAtomic string decimal no negativa. Un activo USDC, incluso cuando balanceAtomic es 0.
- walletState unprovisioned|provisioning|recovery_required|conflict|unavailable: chainId, networkName, testnet true, assets vacíos y observedAt null. No hacer RPC ni mostrar saldo cero en estos estados.
- Identidad ausente/expirada: 401. Wallet no soportada o datos inconsistentes: error tipado, nunca usar la wallet global como fallback. Fallo RPC/timeout/respuesta inválida: 503 con código BALANCE_NO_DISPONIBLE y mensaje seguro; no devolver activos cero ni datos crudos del proveedor.

El adaptador de solo lectura recibe una dirección propia validada; nunca una seed, permiso de firma o clave de transacción. La única lectura permitida es eth_call de balanceOf(address) en la interfaz ERC-20 de seis decimales, contrato 0x3600000000000000000000000000000000000000 y chainId 5042002. Arc expone USDC también como activo nativo: el proveedor legado usa eth_getBalance con 18 decimales. No reutilizar esa salida interpretándola como seis decimales: produciría un error de factor 10^12. No consultar ni sumar la representación nativa. Un test del adaptador inspecciona el método, contrato, selector y dirección enviados, además de comprobar unidades con un saldo esperado conocido. Validar chainId del RPC, uint256 y forma de respuesta; timeout acotado de 8 s por consulta, sin retries internos automáticos. En fixture, usar fixtures por dirección propia para que dos usuarios puedan tener cantidades distintas. Configuración de lectura separada, fixture por defecto; no cambiar WDK_TOOLS_SOURCE ni habilitar firma live. Documentar el modo RPC sin activarlo como parte de la validación local.

No cachear HTTP compartido: Cache-Control private, no-store. observedAt representa consulta exitosa, no hora del render. Respuesta tardía de otra sesión se descarta con la guardia existente de generación y cancelación. La nueva queryKey incluye userId y chainId. Tras error de refresco, ocultar el monto anterior y mostrar error/reintento; no presentarlo como actualizado.

## Slice 1: Mi perfil independiente
Resultado observable: /perfil muestra el nombre real o «Tu perfil» con «Todavía no tenemos tu nombre», y permite Salir con la limpieza de sesión existente. Un fallo de /me ofrece reintento; no queda en carga por queries deshabilitadas.

Archivos previstos: apps/nana-wallet/src/routes/perfil.tsx, componente de perfil y tests colocalizados. Extraer el bloque actual de contactos/agenda/facturas a un componente secundario preservado, sin renderizarlo en la vista simple; no borrar lógica de transferencias o confirmación al hacer la extracción. Mantener logout y su aislamiento. Guardar referencia al componente preservado en documentación para que no quede trabajo perdido.

Secuencia: estabilizar render de identidad; extraer módulos secundarios sin cambiar sus reglas; aislar error/carga de /me antes de cualquier estado dependiente. WalletLifecycle deja de bloquear o formar parte de la tarjeta de datos personales; su acceso se conserva en Billetera en el slice 3.

Checks: tests de nombre/null/vacío, carga, 401, error y reintento; garantizar ausencia de llamadas a agenda/bills/wallet-summary desde /perfil simple. Frontend lint, typecheck, test, build. E2E con backend real y usuarios de prueba con nombre y sin nombre. Comprobación manual en viewport móvil, lector de nombres y foco de Salir.

Stop: no avanzar si Perfil depende de APIs simuladas, pierde Salir o altera confirmaciones. No considerar la función completa hasta restituir el acceso al lifecycle en slice 3. Slices 1 y 2 son checkpoints locales y no se publican por separado. La retirada de accesos de agenda/facturas y sus pagos de estas pantallas es parte de Q3 aprobada, no una regresión que deba revertirse al cerrar: se conserva su código, pero no se promete restaurar esos accesos en esta feature. El agente principal en /, su preview y sus confirmaciones permanecen accesibles y deben pasar regresión. Cualquier cambio de esta decisión exige volver al diseño.

## Slice 2: saldo personal desde backend
Resultado observable: dos usuarios autenticados reciben USDC de sus respectivas wallets, incluido cero, sin permisos de firma y sin tocar wallet global.

Archivos previstos: src/contracts/http.ts, src/api/wallets.ts, src/wallet/balances.ts (nuevo servicio/adaptadores), configuración y wiring en src/server.ts; apps/nana-wallet/src/lib/api-types.ts y api.ts; docs/api.md y configuración de ejemplo si hace falta. Mantener contratos duplicados entre front/back y sin imports cruzados.

Secuencia: formalizar unión discriminada; inyectar lector fixture/RPC de solo lectura; resolver wallet propia y readiness antes de consultar; validar dirección, red y formato; serializar balanceAtomic sin Number; endpoint personal con errores seguros y no-store. No modificar el endpoint legado ni su política.

Checks unitarios: precisión hasta límites uint256, cero, respuesta inválida, red equivocada y timeout. Integración con Postgres/RLS: dos identidades y direcciones, ausencia de wallet, todos los readiness states, intento de dirección ajena, token inválido, 503 y ausencia de llamadas al lector en estados no listos. Verificar que /balances no llama syncWallet ni firma y que los permisos pending/revoked no impiden leer.

Backend lint, typecheck, test con DB, eval y build; frontend lint/typecheck/test/build por contrato. E2E del endpoint con servidor real y tokens de fixture firmados para pruebas, nunca aceptación pública de un userId arbitrario. Comprobar HTTP y bodies frente a la spec; no depender de login Privy real para validar el aislamiento.

Stop: cualquier respuesta de otra wallet, red inconsistente, pérdida de precisión, write financiero o error convertido a cero.

## Slice 3: Billetera conectada
Resultado observable: /mi-plata muestra USDC, saldo legible exacto, «Arc testnet» y momento de actualización. Fixture queda identificado como demostración; un fallo muestra reintento. No se presenta total en pesos ni resumen/movimientos simulados.

Archivos previstos: apps/nana-wallet/src/routes/mi-plata.tsx, features/wallet para formato/presentación, api.ts, api-types.ts, mocks/handlers.ts y pruebas. Mantener URL /mi-plata y etiqueta Billetera existente.

Secuencia: usar /me y la nueva query; evaluar error de identidad antes de carga dependiente; tratar cada estado del contrato; formatear cantidades con strings/BigInt y separadores es-AR sin redondear saldos pequeños a cero. Mostrar solo USDC, sin sumar nativo. Actualizar al entrar y al pulsar «Actualizar saldo», con staleTime 30 s y reintento explícito tras fallo; sin polling continuo. Invalidar esta query tras operaciones confirmadas existentes donde sea necesario, sin cambiar sus flujos.

Acceso al lifecycle: acción «Administrar billetera» abre la sección existente WalletLifecycle de manera explícita, con carga/error independientes. No montar esa sección al leer saldo; sus llamadas de contactos y permisos no bloquean el saldo. En wallet ausente, ofrecer el mismo acceso sin provisionar automáticamente. La lectura funciona con permiso pendiente, revocado o no disponible.

Preservar código de cuentas/movimientos anterior en componente secundario identificado, fuera del render simple. Actualizar metadatos de página para no prometer pesos, plazos fijos o movimientos. Nunca mostrar DID, userId ni credenciales como datos personales.

Checks: componentes con estado listo, todos los readiness states, cero, seis decimales, valores grandes, error inicial/refresh, login expirado y reintento. Frontend lint/typecheck/test/build. E2E contra backend real fixture, verificando que /wallet/summary y /movements no se consulten; un fallo de permisos o contactos no afecta al saldo. Verificación móvil de nombres largos, cifras grandes, focus, aria-live de estados y botón Actualizar saldo.

Stop: si solo funciona con MSW, requiere activar permisos para leer, expone datos previos o muestra cero ante fallo.

## Slice 4: aislamiento y cierre funcional
Resultado observable: salir como A y entrar como B no muestra ni por un frame nombre o saldo de A, incluso con una respuesta A demorada. Navegar entre Perfil/Billetera no mezcla queries ni vuelve a consultar módulos ajenos.

Archivos previstos: tests/e2e/browser para escenarios nuevos; scripts/run-browser-e2e.mjs o harness dedicado parametrizable; session-isolation.ts y puntos de reset solo si las pruebas demuestran un faltante; documentación de verificación.

Preparar entorno: instalar dependencias en el worktree; levantar servicio Postgres/pgvector aislado con nombre Compose propio y puerto disponible; migraciones con usuarios fixture; arrancar backend y frontend usando Portless con nombres únicos nana-wallet-profile-api.localhost y nana-wallet-profile.localhost. Adaptar CORS/base URL al entorno. Si Postgres necesita puerto fijo para el cliente, documentar ese motivo sin saltar Portless para los servidores web. No reutilizar contenedores ni secretos de otro worktree.

Harness: usar el mecanismo existente VITE_E2E_REAL_BACKEND=1 en client.tsx para deshabilitar MSW, sin inventar otro bypass. Chromium requerido, prueba real del HTTP de backend; fixtures solo en proveedor de identidad de test y lector RPC, sin interceptar saldos del navegador. Un Chromium ausente se provisiona cuando sea posible; si no, falla/bloquea explícitamente la evidencia E2E. El harness nuevo de esta feature debe devolver exit distinto de cero si no corrió el navegador; no modificar el contrato de salida del harness legado solo por esta tarea. Un reporte BLOCKED del harness legado no cuenta como aprobación de este gate. Tokens de test aceptados solo en proceso fixture de pruebas, sin introducir bypass en producción. Probar además el adaptador RPC con servidor JSON-RPC controlado para respuestas malas, red y timeout.

Matriz: dos usuarios; perfil con/sin nombre; saldo positivo/cero; todos los readiness states; 401; RPC timeout/red incorrecta; errores de refresco; logout y login B con fetch A pendiente; permisos revoked y contacts fallido; precisión 0.000001 USDC y cantidad mayor a Number.MAX_SAFE_INTEGER en atómicos; viewport 390 px y teclado; ausencia de escrituras de wallet y de llamadas a endpoints legacy desde pantallas simples. Invalidación tras una operación confirmada se prueba mediante fixture, manteniendo preview + confirmación e idempotencia existentes.

Checks finales: backend lint/typecheck/test/eval/build con DB; frontend lint/typecheck/test/build; E2E navegador completo; smoke de regresión del agente/confirmación según suites existentes. Distinguir fallos heredados del snapshot de regresiones propias mediante ejecución de la misma prueba sobre base aislada si hace falta. Registrar resultados, comandos, timestamps y blockers concretos; no contar suites salteadas.

Stop: no completar con E2E pendiente, leaks de sesión, regresión de confirmación o base Privy sin reconciliar. Conservar cambios y contexto si existe un bloqueo externo.

## Cierre y rollback
Actualizar 90-verification.md y verify de OpenSpec con evidencia de cada aceptación; archivar solo después de verificar. Cerrar únicamente servidores/panes creados por esta tarea tras guardar referencias. Mantener worktree para revisión humana. Sin merge, push o PR automático.

Rollback de una implementación futura: restaurar solamente el slice propio por un cambio revisable, conservando Privy y módulos secundarios; desactivar la lectura RPC propia y volver a fixture si el adaptador falla. No revertir trabajo de otros ni reiniciar bases compartidas. Esta feature no exige migraciones de identidad ni pagos.

## Disposición de revisión r1

- F1 controlling: especificado método ERC-20, dirección, red, seis decimales y test contra el error 18-vs-6. Revisión r2 requerida.
- F2 major: retiro de accesos agenda/facturas explícitamente intencional según Q3, conservando código. Slices 1–2 no se publican aislados. Agente principal y confirmaciones sí deben seguir operables. No reintroducir módulos fuera del alcance aprobado.
- F3 major: nombrado VITE_E2E_REAL_BACKEND=1, ya presente en client.tsx.
- F4 minor: harness propio falla cuando falta Chromium; no cambiar contrato legado ni confundir BLOCKED con PASS.
- F5–F7: observaciones de consistencia. Corregir en el reporte de segunda revisión la referencia a src/wallet/session-isolation.ts: ese archivo no existe; la guardia está en apps/nana-wallet/src/lib/session-isolation.ts.
