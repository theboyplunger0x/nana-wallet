# Audit vocal Docker (2026-09-09) — lecture seule, aucune mutation

Contexte : user teste le login. Objectif = live voice E2E real Privy sur Docker. Audit uniquement ; aucun fichier modifié.

## 1. Ce qui existe déjà (fondations solides)

- **Chaîne d'identité** : RequestIdentity / RequestIdentityProvider + DemoIdentityProvider (src/auth/identity.ts) ; PrivyIdentityProvider en privy mode (jose ES256, iss/aud/sub/exp). **Le seam d'identité est déjà en place.**
- **Isolation infra** : withUserTransaction + SET LOCAL ROLE recipient_app + app.user_id + FORCE RLS. New users table + SECURITY DEFINER users_ensure_for_privy_did via owner pool — aucun nouveau BYPASSRLS.
- **Voice déjà per-utilisateur** via binding.sub ; **mais l'room-token issuance utilise demoUserId** — PMU-020 doit passer le resolved UUID au token issuer.
- **Front token plumbing** : getApiToken() sync → à remplacer par async Privy getAccessToken() + 401 refresh-retry-once + demo fallback gated par VITE_IDENTITY_PROVIDER=demo.
- **VITE_LIVEKIT_PARTICIPANT_IDENTITY** doit être retiré en privy mode (identité via /v1/me).

## 2. Ce qui manque / à corriger

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.
- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 3. Ce que demande le PMU-020 et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 4. Ce que demande le PMU-020 et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 5. Ce que demande le PMU-020 et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 6. Recommandations et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 7. Ce que demande le PMU-020 et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 8. Recommandations et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 9. Ce que demande le PMU-020 et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.

## 10. Recommandations et les écarts

- Émission de room-token nécessite une vérification du token + récupération de la conversation avec RLS avant d'appeler l'issuer. Missing/invalid/expired auth → 401. Missing ou foreign conversation → même 404 que absent.
