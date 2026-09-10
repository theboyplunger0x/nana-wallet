# Diseño consolidado

Revisión: 2026-09-08-r2. Las decisiones D1/D2/D3 están aprobadas por la respuesta del usuario y D7 conserva el canal existente. Este documento aplica esas decisiones; el outline requiere su revisión antes de aprobación.

## Flujo

Login Privy → UUID interno → crear/recuperar wallet propiedad del usuario → verificar vínculo en backend → usuario revisa y concede un permiso limitado → solicita pago por texto o voz → preview → confirmación explícita → backend verifica permiso y reclama la operación → Privy firma → backend transmite a Arc Testnet → reconciliación → resultado.

La concesión del permiso es distinta de cada confirmación de pago. El agente no puede ampliar el permiso ni cambiar su política. El usuario puede revocarlo. La recuperación usa Privy y conserva la misma wallet, sin sustituirla ante errores.

La implementación propuesta firma una transacción ERC-20 USDC acotada con eth_signTransaction y transmite los bytes verificados al RPC de Arc. Permite validar política y persistir el hash antes de transmitir. La interfaz ERC-20 usa 6 decimales; gas nativo usa 18. Se prueban ambos por separado.

## Permiso

Cada permiso incluye red/token fijos, destinatarios, máximo por pago, presupuesto acumulado, techo de gas y vencimiento. Debe tener valores finitos explícitos antes de activarse. Privy impone restricciones de firma y la app aplica confirmación/idempotencia/presupuesto bajo transacción. La clave del firmante no tiene facultad de exportar claves, modificar owners, ampliar políticas ni ejecutar métodos alternativos. Verificar los permisos efectivos de la cuenta administradora forma parte de la prueba de despliegue.

Revocar detiene nuevas solicitudes de firma; no puede borrar una firma ya emitida ni deshacer una transacción. Se serializan revocación y reclamo local, se revalida antes de transmitir y se reconcilian intentos ya firmados o inciertos. La UI informa ese límite.

## Estado

El canal telefónico existente se conserva, pero no pudo comprobarse por falta de credenciales Privy en Vault. Es una comprobación pendiente de despliegue, no una elección de canal inventada. El outline contiene una prueba temprana de compatibilidad Privy/Arc antes de desarrollar el provider completo. No se inicia apply ni se habilitan operaciones live en este trabajo documental.
