# Inventario de decisiones

Q1-Q3 resueltas por Ramiro con «si» a la propuesta completa del turno anterior. Se aceptan las tres recomendaciones.

| ID | Pregunta | Recomendación | Alternativa y costo | Estado |
| --- | --- | --- | --- | --- |
| Q1 | ¿Qué monedas y redes incluye esta versión? | USDC en Arc testnet, que es lo configurado en Privy. | Varias monedas: definir lista y redes; requiere lecturas y metadatos adicionales. | Aprobada la recomendación |
| Q2 | ¿Qué hacer con los datos de perfil que todavía no tenemos? | Mostrar solo lo existente; nombre ausente con estado claro. Sin edición. | Agregar captura de nombre y/o email/teléfono: amplía contrato, persistencia y validación de procedencia. | Aprobada la recomendación |
| Q3 | ¿Cómo quedan agenda, facturas y movimientos en estas pantallas? | Pantallas simples centradas en datos personales y monedas, conservando el código de módulos ajenos. | Mantener secciones visibles: separar cargas y definir qué hacer con APIs todavía inexistentes. | Aprobada la recomendación |

Aprobado: USDC en Arc testnet; perfil de solo lectura con datos existentes; pantallas simples con preservación del código ajeno. Razón registrada: coincide con el alcance simple solicitado y con la base Privy actual. Sin preguntas controlantes abiertas. Se autoriza preparar el outline y su revisión independiente; esto no autoriza apply.

Dependencia técnica: reconciliar la instantánea con el commit final de Privy antes de implementar; reabrir decisiones afectadas si cambia el contrato.
