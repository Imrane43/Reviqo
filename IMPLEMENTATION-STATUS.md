# REVIQO — État d'implémentation du cahier des charges

Ce fichier suit l'avancement réel, étape par étape. Il distingue
**implémenté**, **testé**, **non testé** et **bloqué par une configuration externe**.

Dernière mise à jour : étapes 1–10 terminées (+ Équipes de révision).

---

## ✅ Étape 1 — Audit, diagnostic, stratégie de migration

- Stack : Node.js (ESM) + Express + `node:sqlite`, front-end ES modules sans build.
- Audit documenté : voir la section « Ce qui existe / ce qui manque » du compte rendu de session.
- Migrations **versionnées et non destructives** ajoutées dans `src/db.js`
  (`runMigrations()` : `ALTER TABLE ADD COLUMN` + index `IF NOT EXISTS`, backfill email canonique).
- Environnements séparés : `NODE_ENV`, `.env.example`, `run-tests.js` (DB temporaire, clés vides).

## ✅ Étape 2 — Authentification, vérification e-mail, unicité

| Élément | Statut | Preuve |
|---|---|---|
| Code 6 chiffres, zéros initiaux conservés | Implémenté + testé | `verification.js` ; test « demo mode exposes a 6-digit code » |
| Code protégé par HMAC (jamais en clair) | Implémenté | `hmacCode()` |
| Expiration 10 min configurable | Implémenté | `VERIFY_CODE_TTL_MINUTES` |
| Usage unique, consommation atomique | Implémenté + testé | test « a verification code cannot be reused » |
| 5 tentatives max | Implémenté + testé | test « wrong code is rejected » |
| Renvoi après 60 s | Implémenté + testé | test « resend is rate-limited or accepted » |
| Limitation par e-mail et par IP | Implémenté | `rateLimit` + `rateLimitEmail` |
| Codes jamais journalisés | Implémenté | `mailer.js` ne journalise jamais le corps |
| Envoi e-mail réel (Resend/SendGrid/SMTP) | Implémenté | `mailer.js` |
| Restriction des comptes non vérifiés | Implémenté | middleware `requireVerified` |
| Unicité e-mail (contrainte DB) | Implémenté + testé | index unique `email_canon` |
| Unicité pseudo (contrainte DB) + message exact | Implémenté + testé | « ce pseudo est déjà pris » |
| Pseudos réservés | Implémenté + testé | test « reserved pseudo (admin) rejected » |
| Conversion invité → inscrit (progression conservée) | Implémenté + testé | test « conversion preserves progress (xp) » |
| Réinitialisation mot de passe sécurisée | Implémenté + testé | HMAC, 1 h, usage unique |

**Bloqué par configuration externe** : l'envoi réel d'e-mails nécessite `RESEND_API_KEY`,
`SENDGRID_API_KEY` ou `SMTP_URL`. Tant qu'aucun n'est configuré, aucun e-mail n'est délivré
(le code est renvoyé en mode démo hors production). Aucun e-mail n'a été « envoyé » par un
fournisseur réel pendant les tests : les tests couvrent la mécanique, pas la livraison SMTP.

## ✅ Étape 3 — Permissions, bannissement, révocation de sessions

- `token_version` dans le JWT : bannir/débannir ou changer le mot de passe **révoque les sessions**.
- Compte banni refusé à chaque requête authentifiée.
- Actions sensibles protégées (`requireAdmin`), ban auto-protégé (impossible de se bannir soi-même).
- **Testé** : « password reset revokes existing sessions (401) », « banned user is blocked ».

**Limite connue** : il n'existe pas de canaux temps réel (WebSocket/SSE) dans l'application,
donc « fermer les connexions temps réel » au bannissement ne s'applique pas encore
(le classement est en REST). À traiter si le temps réel est ajouté (étape 9).

---

## ✅ Étape 4 — Profil scolaire, référentiel des programmes, niveaux

- **Référentiel** `src/programs.js` + table `curricula` (61 programmes) : par pays/système,
  avec niveaux, classes, voies, séries et domaines. Seed **idempotent** (upsert), migrations
  `ALTER TABLE ADD COLUMN` pour `system`, `system_level`, `grade`, `track`, `domain`,
  `domain_detail`, `specialties`, `learning_language`, `exam_session`, `school_year`,
  `exam_date`, `curriculum_id` (+ `quiz_attempts.curriculum_id`).
- **Pays** : France (complet : Collège 6e–3e, Lycée 2nde/1ère/Terminale avec voies générale
  et technologique + séries, Étudiant avec 9 domaines), plus Belgique, Suisse, Canada, Maroc,
  Algérie, Tunisie, Sénégal (structures réelles, contenu marqué indisponible).
- **Onglets d'examen calculés** : « Révisions Brevet » uniquement en **3ème**,
  « Révisions Bac de Français » uniquement en **Première**, « Révisions Bac »
  (+ Philosophie / Grand oral) uniquement en **Terminale**. La voie technologique ne reçoit
  jamais le choix libre de deux spécialités de la voie générale.
- **Programme indisponible** → message exact **« Contenu non encore disponible pour ce programme »**,
  jamais le contenu d'un autre pays. La France est marquée `partial` (référentiel + matières prêts,
  contenu par classe à l'étape 5) avec une note explicite.
- **Endpoints** : `GET /api/programs`, `GET /api/curriculum` ; `scope=program` sur
  `/api/subjects`, `/api/quizzes`, `/api/flashcards` (aucun contenu hors programme servi).
- **Profil** : onboarding et `PATCH /api/me` enregistrent pays/système/classe/voie/domaine et
  recalculent `curriculum_id`. Changer de profil **actualise le programme et les onglets**
  sans perdre l'historique de progression (rattaché au programme d'origine via
  `quiz_attempts.curriculum_id`).
- **Clarification** demandée au lieu d'inventer : Première/Terminale sans voie, étudiant sans
  domaine, parcours « Autre » sans précision.
- **Testé** : 29 assertions dédiées (catalogue, résolution, onglets, distinctions 6e/3e et
  Droit/Informatique, indisponibilité, persistance, filtrage, migration non destructive).

**Limite assumée** : le contenu est encore **générique** (partagé par matière) ; le contenu
propre à chaque classe arrive à l'étape 5. L'application l'annonce explicitement.

---

## ✅ Étape 5 — Contenus par classe & bibliothèque pédagogique

- **Métadonnées** ajoutées (migrations `ALTER TABLE`, défauts compatibles) sur `quizzes` et
  `flashcards` : `curriculum_id`, `status`, `language`, `chapter`, `objectives`, `prerequisites`,
  `version`, `sources`, `country_code`, `level`, `grade`, `content_type`, `updated_at`
  (+ `reports.content_version`). Index `(curriculum_id, status)`.
- **Statuts** : `draft` → `to_validate` → `published` → `archived` (contrôlés côté serveur).
  Seuls les contenus `published` sont servis publiquement.
- **Contenus réellement différents 6ème ≠ 3ème** : 9 quiz + 4 paquets de flashcards dédiés
  (maths, français) avec chapitre, objectifs, prérequis, difficulté et vocabulaire adaptés.
  Aucun titre 6ème n'est identique à un titre 3ème. La même notion « fractions » revient en 6ème
  (facile) et en 3ème (difficile, avec prérequis « fractions simples (6ème) ») : progression
  explicite, pas duplication.
- **Sources** officielles conservées (Éduscol, Ministère) ; `checkedAt: null` tant que la
  vérification n'a pas été faite. `contentType: 'original'` distingue les exercices originaux des
  sujets officiels.
- **Endpoints** : métadonnées dans `/api/quizzes` et `/api/quizzes/:id`, priorité au contenu de
  classe avec `scope=program` (+ `only=class`), `/api/library` (quiz + flashcards métadonnées),
  admin `/api/admin/library` (GET/POST/PATCH), `/api/reports` conserve `contentVersion`.
- **Publication validée** : refus 422 si objectif manquant, question sans énoncé/options/correction,
  ou chapitre d'examen sans source officielle. La version est incrémentée à chaque modification.
- **Testé** : 26 assertions dédiées (différenciation 6ème/3ème, métadonnées, sources, statuts,
  brouillon invisible, validation de publication, version du signalement).

**Limite assumée** : les contenus par classe couvrent pour l'instant **maths et français** en 6ème
et 3ème (socle de démonstration réel). Les autres classes/matières restent en contenu générique
( étiquette « partial » de l'étape 4) et seront complétées progressivement.

---

## ✅ Étape 6 — Paiement Stripe, abonnement & cycle de vie

- **Liens `buy.stripe.com`** mensuel (`aFa4grauo6UnduBh1D8N202`) et annuel (`8x28wH5a4baDeyFbHj8N204`).
  Le serveur ajoute **`clientreferenceid`** = identifiant interne de l'utilisateur **authentifié**
  (alias `client_reference_id` pour Stripe). Un identifiant envoyé par le navigateur est ignoré ;
  l'e-mail n'est jamais utilisé.
- **Aucune activation depuis la page de succès** : seuls les webhooks vérifiés accordent Premium.
- **Webhook** : vérification de **signature HMAC-SHA256 sur le corps brut** (`t=…,v1=…`),
  tolérance temporelle 5 min, refus 400 si signature invalide/absente ou secret manquant en production.
- **Idempotence** : table `stripe_events` (un `event.id` traité une seule fois) + index unique sur
  `payments.stripe_invoice_id` (une facture enregistrée une seule fois).
- **Ordre** : `users.stripe_last_event_at` ignore un événement plus ancien que le dernier état appliqué.
- **Contrôle avant droits** : prix Stripe vérifié parmi les offres connues ; un prix inconnu
  n'accorde rien. Le client Stripe est rattaché sans jamais voler un client déjà lié à un autre compte.
- **Cycle de vie** : renouvellement (`invoice.paid`), échec (`invoice.payment_failed` → `past_due`),
  authentification requise (`invoice.payment_action_required`), résiliation en fin de période
  (accès conservé jusqu'à l'échéance), fin d'abonnement, **remboursement/contestation → retrait
  immédiat** (politique explicite `POLICY`).
- **Paiements différés** : `checkout.session.completed` non payé n'active rien.
- **Réconciliation** : `POST /api/billing/sync` relit l'état réel chez Stripe si un webhook est manqué.
- **Séparation test/production** : `STRIPE_MODE=live|test` filtre les événements du mauvais environnement.
- **Écran « Mon abonnement »** : offre, statut, prochaine échéance, résiliation programmée,
  problème de paiement, portail Stripe, bouton de synchronisation.
- **Testé** : 26 assertions dédiées (liens exacts, clientreferenceid serveur, signature, idempotence,
  ordre, renouvellement, échec + grâce, résiliation, remboursement, prix inconnu, mode live/test).

**Bloqué par configuration externe** : la création réelle de clients/abonnements et le portail
Stripe nécessitent `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET` créé dans le dashboard Stripe).
Sans clé, le mode démo reproduit le cycle (essai 7 jours → actif) et **n'ouvre jamais** un vrai
lien de paiement : aucun paiement réel n'est déclenché et aucun droit n'est accordé.

---

## ✅ Étape 7 — Coach IA connecté à la bibliothèque (RAG)

- **Récupération** (`src/retrieval.js`) sur la bibliothèque publiée, avec **filtres stricts** :
  uniquement le contenu de la classe (`curriculum_id`) ou le contenu générique rattaché à une
  matière du programme ; **jamais** un autre programme. Le contenu premium est exclu pour un
  compte gratuit (double contrôle SQL + code).
- **Citations** : chaque source renvoyée porte `type/id/title/subject/chapter/target/difficulty`
  + un **lien interne**. Aucune clé de réponses n'est transmise.
- **Réponses sourcées vs générales** : `grounded: true/false`. Avec des sources, le coach cite les
  titres exacts ; sans source pertinente, il le dit explicitement au lieu d'inventer.
  Une question hors sujet ne renvoie aucune source (bug corrigé : le bonus « contenu de classe »
  ne s'applique plus sans correspondance).
- **Anti-injection** : le contenu récupéré est **nettoyé** (`sanitizeRetrieved`) — motifs
  « ignore les instructions », `system:`, changement de rôle, demande de secrets, balises de script…
  remplacés par `[contenu neutralisé]`. Le prompt système rappelle que ces blocs sont des
  **DONNÉES**, jamais des instructions, et interdit de modifier permissions/rôles ou de révéler
  des secrets. Testé : une instruction injectée dans un document publié n'est ni exécutée ni répétée,
  et le rôle/plan de l'utilisateur reste inchangé.
- **Aucune donnée d'un autre utilisateur** : la base interrogée est la bibliothèque partagée ;
  les citations ne contiennent jamais d'e-mail (testé).
- **Quotas / coûts** : quota quotidien par utilisateur (`COACH_DAILY_LIMIT`, défaut 200) → 429
  `COACH_QUOTA` ; rate limit 40/min ; messages tronqués à 12 tours / 4000 caractères.
- **Indisponibilité du fournisseur** : repli explicite sur le moteur local avec avertissement.
- **Testé** : 14 assertions dédiées (filtre 6ème/3ème, absence de fuite, citations + liens,
  insuffisance de sources, injection, quota, refus des comptes gratuits).

**Non testé en conditions réelles** : les fournisseurs IA externes (OpenAI/Anthropic/Gemini) ne sont
pas appelés pendant les tests (aucune clé). La construction du prompt, la récupération et le repli
local sont en revanche entièrement testés.

---

## ✅ Étape 8 — Vidéo IA premium (analyse sémantique + YouTube réel)

- **Accès premium vérifié côté serveur** : `/api/video/search` renvoie `402` pour un compte gratuit.
- **Analyse de la demande** (`src/video.js`) : statut explicite parmi `ok`, `needs_clarification`,
  `out_of_program`, `not_pedagogical` ; cours identifié + objectifs + justification courte.
  - Bruit (« azertyuiop qsdlfkj ») → **aucun cours, aucune vidéo**.
  - Demande vague (« aide-moi ») → **question de clarification**.
  - Demande claire → cours identifié dans **le programme de l'élève** (RAG).
  - Sujet réel hors programme → **message explicite**, jamais le cours d'un autre programme.
  - Ne rejette pas automatiquement : formule mathématique courte (`2x+3=7`), abréviation
    (`brevet`), requête courte/mal orthographiée (`conjugaison`).
  - Avec `VIDEO_AI_API_KEY` : décision structurée demandée au modèle (sans exposer son raisonnement) ;
    sans clé : analyse déterministe locale fondée sur la bibliothèque.
- **Recherche YouTube réelle** : API Data v3 (`YOUTUBE_API_KEY`), `safeSearch=strict`,
  `relevanceLanguage`; récupère titre, chaîne, **durée** (ISO 8601 → lisible), miniatures, vues.
  **Sans clé : aucune vidéo inventée** — message honnête (testé).
- **Évaluation** des résultats (thème, niveau, langue, qualité) + **courte explication de pertinence**.
- **Cache contextualisé** (`video_cache`, clé = langue + requête normalisée, TTL `VIDEO_CACHE_TTL_HOURS`).
- **Quotas / coûts** : `VIDEO_DAILY_LIMIT` (défaut 60) → `429 VIDEO_QUOTA`, rate limit 20/min.
- **Honnêteté** : la réponse inclut un avertissement rappelant que seules les **métadonnées**
  YouTube sont disponibles — on ne prétend jamais avoir analysé la vidéo entière.
- **Testé** : 17 assertions dédiées (durée lisible, premium 402, bruit, ambiguïté, cours 6ème,
  math/abréviation/faute, hors programme, cache, pertinence, disclaimer, quota).

**Bloqué par configuration externe** : la recherche YouTube réelle nécessite `YOUTUBE_API_KEY` et
l'analyse sémantique par modèle nécessite `VIDEO_AI_API_KEY`. Aucun appel réseau YouTube/IA n'a été
fait pendant les tests (clés absentes) ; la mécanique, le cache et le repli local sont testés.

---

## ✅ Étape 9 — Amis, XP idempotent, classements temps réel

- **XP idempotent** : `xp_transactions.ref` (index unique partiel) ; `addXp(userId, amount, reason, ref)`
  n'accorde l'XP qu'une seule fois par événement. Utilisé par quiz, jeux, étude, vidéo, badges,
  défis et séries. Testé : rejouer une tentative (`attemptId` client) ne crédite pas deux fois.
- **Anti-farming** : répéter le même quiz le même jour → XP à 20 % dès la 2ᵉ tentative, 0 au-delà
  de 3. Testé.
- **Classements** (`/api/leaderboard`) : vues `global`, `weekly`, `monthly`, `friends`, **paginées**
  (`page`, `limit` ≤ 50, `pages`, `total`) et **départage déterministe** `xp DESC, id ASC`.
  Inclut le **rang personnel** calculé dans la même portée. Les invités et bannis sont exclus.
- **Amis** : demandes/acceptation/refus/blocage déjà en place ; la vue `friends` n'inclut que soi
  + amis **acceptés** (une demande en attente n'apparaît pas — testé).
- **Temps réel** : flux **SSE** `/api/leaderboard/stream` (text/event-stream) ; le serveur pousse un
  signal à chaque attribution d'XP. Côté client, `EventSource` avec **repli sur rafraîchissement
  périodique** en cas d'indisponibilité, et **resynchronisation** à la reconnexion.
- **Testé** : 16 assertions dédiées (idempotence, anti-farming, pagination, ordre, weekly/monthly,
  amis, SSE + push temps réel, limite de débit).

Note : le harnais de test hermétique partage une seule IP ; les limites de débit y sont désactivées
(`RATE_LIMIT_DISABLED=1`) et **testées explicitement** via un cas dédié.

---

## ✅ Étape 10 — Équipes de révision

- **Création** : nom unique (normalisé), description, avatar, objectif hebdo, créateur = admin d'équipe.
  Un utilisateur appartient à **une seule** équipe (index unique).
- **Invitations** (`team_invites`) : code **cryptographiquement aléatoire** (12+ caractères),
  **révocable**, avec **expiration** et **limite d'utilisations**. Tentatives d'adhésion limitées
  par utilisateur (anti-énumération). Testé : code à usage unique épuisé (410), révoqué (404),
  expiré (410).
- **Rôles & permissions serveur** : `admin` / `member`. Un membre ne peut ni exclure ni promouvoir
  (403) ; **dernier administrateur** protégé (départ/rétrogradation bloqués) ; un **admin de
  plateforme hors équipe** ne gère pas l'équipe (rôles strictement distincts) ; un non-membre ne
  lit pas les données privées (403).
- **XP collectif** : table `team_xp_events` alimentée par un **hook sur les gains d'XP** (via
  `ref` unique → idempotent). La progression **n'est jamais** un compteur client. Testé : une
  tentative rejouée ne double pas la progression.
- **Objectif hebdomadaire** : cible configurable + **barre de progression** + **historique**
  (`team_goals` par semaine, semaine calculée côté serveur en **UTC**).
- **Fil d'activité** : création, arrivée/départ de membre, promotion, objectif atteint, défis.
  **Aucune note ni donnée personnelle** n'y est publiée (testé).
- **Classements & ligue** : classement **des membres** (dans l'équipe) et **inter-équipes** avec
  **ligue par taille** (`small` ≤ 5, `medium` 6–15, `large` 16+) et **score normalisé par membre**
  pour éviter l'avantage mécanique des grandes équipes. Départage déterministe
  (XP hebdo, puis XP/membre, puis id). Jamais d'e-mail exposé (testé).
- **Défis entre équipes** : proposition / acceptation / refus (réservés aux admins des équipes
  concernées), échéance, **score calculé côté serveur** sur les événements d'XP produits **après
  l'acceptation** (frontière monotone `accepted_seq`, pas d'ambiguïté à la seconde), **égalité =
  match nul déterministe**, finalisation **idempotente**, historique.
- **Migrations** : `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` (`accepted_at`,
  `accepted_seq`) — non destructif, les données existantes sont conservées.
- **Testé** : 31 assertions dédiées.

Note : un utilisateur = une équipe (choix documenté, évite les ambiguïtés de classement).

---

## ⏳ Étapes restantes (non commencées)

- **11** Publicités ciblées + répétition espacée, carnet d'erreurs, planning, recherche globale, notifications.
- **12** Tests complets, sécurité, accessibilité, documentation finale.

## Tests

- `npm test` → **271/271** assertions (95 d'origine + étapes 2 à 10).
- `npm run check` → garde-fou anti-régression de déploiement (modules front-end jamais dans `src/`).
