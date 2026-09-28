# Services externes à configurer — REVIQO

L'application fonctionne **sans aucun service externe** (mode local/démo). Chaque intégration
s'active par variable d'environnement. Rien n'est jamais simulé en silence : en l'absence de
configuration, l'API l'indique explicitement.

## 1. Envoi d'e-mails (vérification + réinitialisation)

Choisir **un** fournisseur :

| Fournisseur | Variables |
|---|---|
| Resend | `RESEND_API_KEY` |
| SendGrid | `SENDGRID_API_KEY` |
| SMTP | `SMTP_URL` (nécessite `nodemailer`) |

Compléments : `MAIL_FROM_NAME`, `MAIL_FROM_EMAIL`, `VERIFY_CODE_TTL_MINUTES`,
`VERIFY_MAX_ATTEMPTS`, `VERIFY_RESEND_SECONDS`, `REQUIRE_EMAIL_VERIFICATION`.

**Sans configuration** : en développement, le code de vérification / lien de réinitialisation est
renvoyé dans la réponse (mode démo). En production, l'application reste utilisable et la
vérification n'est pas imposée (sauf `REQUIRE_EMAIL_VERIFICATION=true`).

## 2. Stripe (abonnements)

| Variable | Rôle |
|---|---|
| `STRIPE_SECRET_KEY` | clé secrète (active le mode réel) |
| `STRIPE_WEBHOOK_SECRET` | secret de signature du webhook (obligatoire en production) |
| `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` | identifiants de prix attendus |
| `STRIPE_LINK_MONTHLY` / `STRIPE_LINK_YEARLY` | liens `buy.stripe.com` |
| `STRIPE_MODE` | `live` ou `test` (filtre les événements du mauvais environnement) |
| `BILLING_GRACE_DAYS` | jours de grâce après impayé (défaut 3) |

**Webhook à créer dans Stripe** : `POST {APP_ORIGIN}/api/stripe/webhook`, événements
`checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`,
`invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`, `charge.dispute.created`.

**Sans `STRIPE_SECRET_KEY`** : mode démo (essai local), **aucun lien de paiement réel n'est ouvert**
et aucun droit n'est accordé sans webhook.

## 3. Google Sign-In (optionnel)

`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, **ou** `GOOGLE_OAUTH_CLIENT_JSON`.
URI de redirection : `{APP_ORIGIN}/api/auth/google/callback`.

## 4. IA serveur — Étude, Coach et génération de cours (optionnel)

Variables (l'une suffit pour la clé) :

| Variable | Rôle |
|---|---|
| `OPENAI_API_KEY` | clé OpenAI (prioritaire) |
| `LLM_API_KEY` | alias de la clé |
| `OPENAI_BASE_URL` / `LLM_API_URL` | **base d'API** (ex. `https://api.openai.com/v1`) |
| `LLM_MODEL` | modèle (défaut `gpt-4o-mini`) |
| `LLM_PROVIDER` | libellé du fournisseur |

⚠️ `LLM_API_URL` doit être une **base d'API**. Une **page de gestion**
(`platform.openai.com/api-keys`) est **ignorée** (base par défaut `api.openai.com/v1` utilisée).

Sans clé : générateur local déterministe (Étude) et moteur local sourcé (Coach) ; la génération de
cours répond `503 AI_NOT_CONFIGURED`.

Erreurs renvoyées : `KEY_MISSING`, `INVALID_KEY`, `QUOTA`, `BAD_MODEL`, `UNAVAILABLE`,
`BAD_RESPONSE`, `PROVIDER_ERROR`.

Endpoints : `POST /api/ai/coach` (contexte complet : niveau, classe, voie, spécialités, matière,
chapitre, progression, historique), `GET /api/courses`, `POST /api/ai/courses`.

## 5. Vidéo IA premium

| Variable | Rôle |
|---|---|
| `YOUTUBE_API_KEY` | recherche YouTube réelle (API Data v3) |
| `VIDEO_AI_API_KEY` | analyse sémantique par modèle (sinon analyse locale) |
| `VIDEO_DAILY_LIMIT` | quota quotidien par utilisateur (défaut 60) |
| `VIDEO_CACHE_TTL_HOURS` | durée de vie du cache (défaut 168) |

**Sans `YOUTUBE_API_KEY`** : aucune vidéo inventée ; l'API renvoie un message honnête.

## 6. Coach IA

Le Coach fonctionne **sans clé** (moteur local **fondé sur la bibliothèque**). Chaque utilisateur
peut brancher sa propre clé (OpenAI, Anthropic, Gemini, endpoint compatible) via l'interface ; elle
est stockée côté serveur et n'est jamais renvoyée au navigateur.
Quota : `COACH_DAILY_LIMIT` (défaut 200).

## 7. Publicités (comptes gratuits)

`ADS_ENABLED=true|false` (désactivation globale) ; gestion par emplacement dans l'admin
(`ad_settings`). Aucune publicité pour les comptes premium ; aucune donnée du Coach ni résultat
scolaire transmise aux annonceurs.

## Récapitulatif « sans configuration »

| Fonctionnalité | Sans clé |
|---|---|
| Inscription / connexion | fonctionne (vérification e-mail en mode démo) |
| Quiz, flashcards, jeux, classements, équipes | fonctionnels (contenus de démonstration) |
| Coach IA | fonctionnel (moteur local sourcé) |
| Vidéo IA | analyse + cache fonctionnels, **aucune vidéo** |
| Étude IA | générateur local |
| Paiement | mode démo, **aucun paiement réel** |
