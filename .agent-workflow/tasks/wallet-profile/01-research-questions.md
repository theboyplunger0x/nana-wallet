# Preguntas de investigación

1. ¿Dónde vive Privy y cuál es su relación con main? Revisar worktrees, estado, commits y PR abiertos para elegir una base sin alterar trabajo ajeno.
2. ¿Qué datos personales devuelve la API y cómo se almacenan? Revisar /v1/me, users, resolución de identidad y tipos del frontend.
3. ¿De dónde salen hoy saldo y monedas? Seguir /mi-plata, cliente HTTP, mocks y registro real de endpoints.
4. ¿La lectura de saldo usa la wallet de cada usuario? Comparar wallet/balance con wallets/current y sus dependencias.
5. ¿Qué bloquea Perfil y qué validación existe? Revisar consultas dependientes, aislamiento de sesión y harness E2E.

Fuera de investigación: nuevas operaciones de pago, edición de datos, KYC, nuevas redes, cotizaciones y rediseño del agente. Las alternativas de producto se presentan en el diseño.
