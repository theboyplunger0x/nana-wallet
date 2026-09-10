# Decisiones de login: revisión 2026-09-08

D1-D6 históricos permanecen en 03-design-discussion.md. D7 se resuelve como conservar el canal telefónico configurado, más email: el usuario respondió "si" a la recomendación anterior. Esa respuesta no identifica SMS o WhatsApp ni autoriza cambiar el dashboard.

No quedan elecciones abiertas entre alternativas. Verificación de despliegue pendiente: vault-env list no contiene nombres PRIVY_* y no se leyó el dashboard. Al acceder a la app, registrar su canal y probarlo. Si no existe app/canal configurado, reportar ese hecho antes de elegir uno. No afirmar que ambos canales funcionan simultáneamente.

Fuente: https://docs.privy.io/authentication/user-authentication/login-methods/sms-whatsapp

Las decisiones de wallet están resueltas en ../privy-embedded-wallets/03a-open-questions.md. No se inició apply.
