# Diseño r1: Billetera y Mi perfil

Estado: aprobado por Ramiro mediante «si», en respuesta a la propuesta completa de alcance.

## Resultado propuesto
Mi perfil presenta nombre y otros datos personales que ya estén disponibles mediante un contrato verificado. En la base actual solo existe el nombre. Un nombre ausente muestra «Tu perfil» y una explicación breve; no se inventan datos. La vista principal no depende de agenda, facturas o saldo.

Billetera usa la wallet embedded del usuario autenticado. Primera versión propuesta: USDC de Arc testnet, con nombre de moneda, símbolo, cantidad, red y estado de actualización. El saldo se expresa en USDC; una conversión a pesos requiere una fuente de precio acordada. No sumar cantidades de monedas diferentes ni mostrar un valor convertido ficticio.

## Alternativas y costo
- Datos actuales frente a ampliar perfil: usar /me permite entregar la lectura sin agregar una fuente de identidad. Incorporar email/teléfono exige comprobar su disponibilidad y definir cómo llegan al backend. Editar nombre agrega persistencia y validación.
- USDC en la red actual frente a varias monedas: el primer alcance coincide con la base Privy. Varias monedas requiere nombres, redes, contratos y decimales explícitos.
- Pantallas simples frente a mantener módulos secundarios visibles: separar la consulta de identidad reduce dependencias; conservar agenda, facturas y movimientos como secciones activas exige resolver sus APIs faltantes. Se propone simplificar estas dos pantallas, preservando la implementación de módulos ajenos para futuras tareas.

## Contratos propuestos
Mantener GET /v1/me como lectura de identidad. Si se incorporan campos opcionales, documentar procedencia y actualizar backend y api-types.ts juntos.

Agregar una lectura personal de activos bajo /v1/wallets/current/balances. El backend deriva userId y dirección propia; el navegador no elige el dueño. Reutilizar resolución de wallet embedded y agregar una dependencia de lectura sustituible por fixture. Propuesta de respuesta: estado de wallet, red, fecha de consulta y activos con identidad estable por red/contrato, símbolo, decimales y cantidad atómica como string. Evitar Number para cantidades atómicas. Un error RPC no equivale a saldo cero.

Una wallet no creada muestra su estado y el acceso al lifecycle existente. Consultar saldo no requiere habilitar permisos de firma. La lectura nunca crea ni activa wallets de forma implícita. Mantener caché separada por usuario/red y vaciarla al cerrar sesión o cambiar de cuenta.

## Aceptación para la implementación futura
- Con nombre conocido se muestra el nombre; con null no aparecen datos ficticios.
- Un error de identidad ofrece reintento, sin spinner perpetuo.
- Perfil carga independientemente de agenda/facturas/billetera.
- Saldo positivo, cero, wallet ausente y fallo RPC tienen resultados distintos.
- Las monedas muestran red y precisión correcta; el testnet se identifica como tal.
- Cambiar entre dos usuarios con saldos distintos no filtra datos.
- Frontend y backend se conectan solo por HTTP; fixtures son el modo de validación inicial.

## Aprobación
Gate ID: wallet-profile-design-r1
Decision / allowed mutation: aprobar el diseño y resolver Q1-Q3 antes de escribir el outline.
Explicit exclusions: implementación, pagos, habilitación live, merge y publicación.
Owning artifact / revision or hash: 03-design-discussion.md r1.
Decision owner: Ramiro.
Approved by / trusted identity: Ramiro, mensaje «si» en esta conversación.
Approved at: registrado 2026-09-09T20:56:29.857002+00:00; aprobación recibida en el turno actual.
Status: approved.
Invalidated by: cambios en alcance, monedas, datos personales o base Privy.

Después: outline completo, revisión independiente Pi nan/glm5.3-flash con razonamiento high, aprobación humana del outline y fases SDD en openspec antes de apply.
