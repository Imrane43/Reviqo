# REVIQO — Learn. Play. Master.

Plateforme d'apprentissage gamifiée : étude assistée par IA, quiz (46 quiz /
11 matières), flashcards, vidéo IA, Coach IA, 7 mini-jeux, défis du jour,
XP/niveaux/badges, progression, classements, amis, abonnement Premium (Stripe)
et panneau d'administration.

Full-stack Node.js + `node:sqlite` + front-end ES modules (sans build).

## Démarrage rapide

```bash
cd /home/user/reviqo-run      # node_modules doit vivre ici (disque local)
npm install
cp .env.example .env          # puis remplis les clés
npm run seed
npm start                     # http://localhost:3000
```

`node_modules` ne doit **jamais** être installé sur le montage S3 du workspace.

## Comptes

- **Admin** : `ADMIN_EMAIL` / `ADMIN_PASSWORD` (par défaut `imraneanbar39@gmail.com`).
  Accès admin sur `/admin.html`.
- **Démo** : `lea@reviqo.app`, `emma@reviqo.app`, … mot de passe `demo1234`.
- **Invité** : bouton « Continuer en tant qu'invité ». Chaque invité reçoit un
  e-mail unique `guest_<uuid>@guest.reviqo.app` — aucun compte partagé.
- **Google** : activé dès que `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` sont
  définis, ou en collant le JSON client OAuth complet dans
  `GOOGLE_OAUTH_CLIENT_JSON`. Rediriger l'URI
  `$APP_ORIGIN/api/auth/google/callback` dans Google Cloud Console.

## Abonnement & essai gratuit

- Prix Stripe : mensuel `price_1UK1fI135y6qw8XWu5M2rbpY`,
  annuel `price_1UK1gE135y6qw8XWjySyztec`.
- Essai gratuit de **7 jours** (`trial_period_days: 7`), puis prélèvement
  automatique par Stripe.
- Sans `STRIPE_SECRET_KEY`, un **mode démo** reproduit le même cycle
  (essai 7 jours → passage en `active` + écriture d'un paiement) afin de tester
  le produit hors ligne. Les webhooks `/api/stripe/webhook` pilotent le cycle
  réel en production.

## Vérification e-mail, identité & sessions

**Inscription vérifiée par code**
- Le compte est créé en attente de vérification, puis validé par un **code à 6 chiffres**
  (zéro initial conservé) envoyé par e-mail.
- Le code n'est **jamais stocké en clair** : seul un HMAC-SHA256 côté serveur est conservé.
- Expiration **10 min** (`VERIFY_CODE_TTL_MINUTES`), **5 tentatives max**
  (`VERIFY_MAX_ATTEMPTS`), **renvoi possible après 60 s** (`VERIFY_RESEND_SECONDS`).
- À usage unique, consommation **atomique** (deux validations simultanées ne peuvent pas gagner).
- Envoi d'un nouveau code = l'ancien est invalidé. Limitation par **e-mail** et par **IP**.
- Les codes ne sont **jamais journalisés**.

**Fournisseur d'e-mail** (un seul suffit, sinon mode démo) :
- `RESEND_API_KEY` (Resend), `SENDGRID_API_KEY` (SendGrid) ou `SMTP_URL` (SMTP via `nodemailer`).
- **Aucun fournisseur configuré** : en développement, le code est renvoyé dans la réponse
  (`devVerificationCode`) — jamais présenté comme un e-mail envoyé. En production, l'application
  reste utilisable et la restriction n'est pas activée tant qu'aucun fournisseur n'est configuré.
- `REQUIRE_EMAIL_VERIFICATION=true` force la vérification partout ; `false` la désactive.
  Vide (défaut) = activée en production **uniquement** si un fournisseur est configuré.

**Unicité garantie par la base de données**
- E-mail canonique (`email_canon`, minuscules + trim) avec **index unique**.
- Pseudo normalisé (`username_norm`, NFKC + minuscules) avec **index unique**, partagé entre
  invités et comptes classiques. Message exact : **« ce pseudo est déjà pris »**.
- Pseudos réservés (admin, support, reviqo…) refusés. Longueur 3–30, lettres/chiffres `. _ -`.
- Les inscriptions non vérifiées expirées sont **nettoyées** (`UNVERIFIED_TTL_HOURS`, défaut 48 h).

**Conversion invité → compte inscrit**
- `POST /api/auth/convert` conserve le **même identifiant interne** : progression, XP, favoris,
  équipes et pseudo sont préservés. Aucune fusion de comptes sur la seule connaissance d'un e-mail.

**Réinitialisation de mot de passe & révocation**
- Lien temporaire (1 h) à **usage unique**, stocké sous forme de HMAC.
- Chaque token JWT embarque une `token_version` : changer le mot de passe, bannir un compte
  ou le débannir **révoque immédiatement toutes les sessions existantes** (401).
- Un compte banni est refusé sur chaque requête authentifiée (et non pas seulement au moment du login).

**Migration** : `src/db.js` applique des migrations idempotentes et non destructives
(`ALTER TABLE ... ADD COLUMN` + index `IF NOT EXISTS`) ; les données existantes sont conservées.

## Profil scolaire & programmes (par pays)

Le contenu s'adapte au **pays**, au **système scolaire**, au **niveau**, à la **classe** et à la **voie**.

- **Référentiel** `src/programs.js` → table `curricula` (seed idempotent), exposé par
  `GET /api/programs`. Résolution via `GET /api/curriculum`.
- **France** : Collège (6ème, 5ème, 4ème, 3ème), Lycée (Seconde, Première, Terminale — voies
  générale et technologique, séries STMG/STI2D/ST2S/STL/STD2A/S2TMD/STHR), Étudiant (9 domaines :
  Droit, Médecine et santé, Informatique, Économie, Gestion et commerce, Sciences, Lettres et
  langues, Sciences humaines, Autre parcours).
- **Autres pays** : Belgique, Suisse, Canada, Maroc, Algérie, Tunisie, Sénégal — structures réelles,
  contenu marqué « indisponible » tant qu'il n'est pas produit.
- **Onglets d'examen** calculés automatiquement : Brevet (3ème seulement), Bac de Français
  (Première seulement), Bac + Philosophie + Grand oral (Terminale générale).
- **Programme indisponible** → « Contenu non encore disponible pour ce programme » : l'app ne sert
  **jamais** le contenu d'un autre pays.
- **Filtrage par programme** : `GET /api/subjects?scope=program`, `GET /api/quizzes?scope=program`,
  `GET /api/flashcards?scope=program`.
- **Changer de profil** actualise programme et onglets ; l'historique de progression reste rattaché au
  programme d'origine (`quiz_attempts.curriculum_id`).

> État honnête : le référentiel et le filtrage par matière sont opérationnels ; le contenu
> **propre à chaque classe** arrive à l'étape suivante. La France est marquée `partial` et
> l'interface l'indique (`Contenu générique : les fiches propres à ta classe arrivent…`).

## Équipes de révision

- **Création / adhésion** : nom unique, création → créateur administrateur ; adhésion par **code
  d'invitation aléatoire, révocable, expirable et limité en usages**. Un utilisateur = une équipe.
- **Rôles/permissions serveur** : `admin` / `member` ; un membre ne peut ni exclure ni promouvoir ;
  le dernier administrateur est protégé ; un admin de plateforme hors équipe n'a aucun droit d'équipe.
- **XP collectif** : alimenté par les **gains d'XP réels** (idempotents, via `ref`), jamais par un
  compteur client.
- **Objectif hebdomadaire** : cible configurable, barre de progression, historique par semaine (UTC).
- **Classements** : membres de l'équipe + **inter-équipes par ligue de taille** (`small`/`medium`/
  `large`) avec score **normalisé par membre** ; départage déterministe.
- **Fil d'activité** : événements utiles, **sans note ni donnée personnelle**.
- **Défis entre équipes** : proposition / acceptation / refus, échéance, score serveur, **match nul
  déterministe**, finalisation **idempotente**.

## Amis, XP & classements temps réel

- **XP calculé côté serveur** et **idempotent** (`xp_transactions.ref` unique) : rejouer une tentative
  ne crédite pas deux fois. Aucun gain n'est accepté directement depuis le navigateur.
- **Anti-farming** : répéter le même quiz le même jour réduit l'XP (puis 0 au-delà de 3).
- **Classements** : vues `global`, `weekly`, `monthly`, `friends`, **paginées** et **départage
  déterministe** (`xp DESC, id ASC`), avec rang personnel. Invités et bannis exclus.
- **Temps réel** : flux **SSE** `/api/leaderboard/stream` — le serveur pousse un signal à chaque
  attribution d'XP ; repli sur rafraîchissement périodique si l'`EventSource` est indisponible, et
  resynchronisation automatique à la reconnexion.
- **Vue entre amis** : soi-même + amis acceptés uniquement.

## Vidéo IA premium (analyse sémantique + YouTube réel)

- **Réservé aux membres Premium** (`402` côté serveur pour un compte gratuit).
- **Analyse de la demande** : sens, sujet pédagogique, cours correspondant dans le programme,
  précision. Statuts : `ok`, `needs_clarification`, `out_of_program`, `not_pedagogical`.
  - texte aléatoire → aucune vidéo ; demande vague → question de clarification ; sujet hors
    programme → message explicite ; demande claire → cours identifié puis recherche vidéo.
  - ne rejette pas une formule mathématique courte, une abréviation scolaire ou une faute d'orthographe.
- **Recherche YouTube réelle** via l'API Data v3 (`YOUTUBE_API_KEY`), `safeSearch=strict` : titre,
  chaîne, **durée lisible**, miniatures, vues. **Sans clé : aucune vidéo inventée.**
- **Évaluation** des résultats (thème, niveau, langue, qualité) + courte explication de pertinence,
  et un **bouton** vers la vidéo (pas de redirection imprévisible).
- **Cache contextualisé** (`VIDEO_CACHE_TTL_HOURS`) et **quota** `VIDEO_DAILY_LIMIT`.
- **Honnêteté** : seules les métadonnées sont analysées ; l'application le dit explicitement.
- `VIDEO_AI_API_KEY` (optionnel) branche une analyse sémantique par modèle ; sinon analyse locale.

## Coach IA connecté aux contenus (RAG)

Le Coach IA s'appuie sur la **bibliothèque pédagogique** (`src/retrieval.js`) :

- **Filtres stricts** : uniquement le contenu de la classe de l'élève (`curriculum_id`) ou le
  contenu générique d'une matière de son programme. Jamais un autre programme.
- **Droits d'accès** : le contenu premium n'est jamais récupéré pour un compte gratuit.
- **Citations** : chaque source renvoyée contient `type/id/titre/matière/chapitre/niveau` + un lien
  interne. Aucune clé de réponses n'est transmise au client.
- **Sourcé vs général** : `grounded: true/false` ; avec des sources le coach cite les titres exacts,
  sans source il l'indique clairement au lieu d'inventer.
- **Anti-injection** : le contenu récupéré est nettoyé (motifs « ignore les instructions »,
  `system:`, changement de rôle, demande de secrets…) et balisé `<donnee_non_fiable>`. Le prompt
  système interdit d'exécuter ces instructions ou de modifier des droits.
- **Quotas / coûts** : `COACH_DAILY_LIMIT` (défaut 200) → `429 COACH_QUOTA`, rate limit 40/min,
  historique tronqué.
- **Indisponibilité fournisseur** : repli explicite sur le moteur local avec avertissement.
- Sans clé API, le coach fonctionne en **mode local** mais reste **fondé sur les cours de l'élève**.

## Bibliothèque pédagogique & contenus par classe

Chaque ressource (quiz, flashcard) porte les métadonnées du référentiel : **pays, programme
(`curriculum_id`), niveau, classe, matière, chapitre, objectifs, prérequis, difficulté, langue,
version, sources, type et statut**.

- **Statuts** : `draft`, `to_validate`, `published`, `archived`. Seuls les contenus publiés sont
  servis. Les brouillons restent visibles en admin.
- **Publication contrôlée** : un contenu ne peut être publié sans au moins un objectif, sans
  questions valides (énoncé, options, réponse, correction) et, pour un chapitre d'examen, sans
  source officielle. La validation renvoie `422 VALIDATION_FAILED` avec la liste des raisons.
- **Contenus par classe** : la 6ème et la 3ème ont des contenus **réellement différents**
  (notions, vocabulaire, difficulté, prérequis). Une notion peut revenir avec une **progression
  explicite** (ex. « fractions » : 6ème facile → 3ème difficile avec prérequis 6ème).
- **Sources** officielles conservées ; `checkedAt: null` tant que la vérification humaine n'a pas
  eu lieu — aucune vérification n'est déclarée à tort.
- **Type de contenu** : `original` (exercices originaux inspirés du format) vs `official` — la
  distinction est explicite.

Endpoints :
- `GET /api/quizzes`, `GET /api/quizzes/:id` (métadonnées, `scope=program`, `only=class`).
- `GET /api/flashcards` (paquets par classe, métadonnées).
- `GET /api/library` (quiz + flashcards publiés, filtre programme).
- `GET|POST|PATCH /api/admin/library` (gestion des statuts, publication validée).
- `POST /api/reports` conserve la **version** du contenu signalé.

> Couverture actuelle : **maths et français en 6ème et 3ème**. Les autres classes/matières
> utilisent encore le contenu générique (mentionné dans l'interface).

## Abonnement Premium (Stripe)

- **Liens de paiement publics** : mensuel `https://buy.stripe.com/aFa4grauo6UnduBh1D8N202`,
  annuel `https://buy.stripe.com/8x28wH5a4baDeyFbHj8N204`. Le serveur y ajoute **`clientreferenceid`**
  (= identifiant interne de l'utilisateur connecté). Un `userId` envoyé par le navigateur est ignoré.
- **Activation uniquement par webhook** : la page de succès n'accorde jamais Premium.
- **Webhook** `POST /api/stripe/webhook` : signature **HMAC-SHA256 sur le corps brut**, idempotence
  (`stripe_events`), ordre des événements, prix vérifiés parmi les offres connues.
- **Cycle de vie** : essai 7 jours, renouvellement, échec de paiement (`past_due` + grâce
  `BILLING_GRACE_DAYS`), authentification requise, résiliation en fin de période (accès conservé
  jusqu'à l'échéance), fin d'abonnement, remboursement/contestation (retrait immédiat).
- **Réconciliation** : `POST /api/billing/sync` si un webhook a été manqué.
- **Écran « Mon abonnement »** : offre, statut, prochaine échéance, portail client, synchronisation.
- **Séparation test/production** : `STRIPE_MODE=live|test`.

Variables : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY/YEARLY`,
`STRIPE_LINK_MONTHLY/YEARLY`, `STRIPE_MODE`, `BILLING_GRACE_DAYS`.

> Sans `STRIPE_SECRET_KEY`, l'application tourne en **mode démo** (essai local) et n'ouvre jamais un
> vrai lien de paiement : aucun paiement réel n'est déclenché.

## Fonctionnalités IA

- **Étude IA** (`/api/study/generate`) : résumé, flashcards, quiz et test
  d'entraînement à partir d'un cours collé (ou d'un fichier). Quota gratuit
  3/jour, illimité en Premium.
- **Flashcards** (`/api/flashcards`) : paquets par matière, mode révision
  (retourner / je sais / à revoir / mélanger).
- **Vidéo IA** (`/api/video/generate`) : le cours est transformé en script de
  scènes (titre, idées clés, à retenir, test, flashcard, outro). Le front-end
  l'anime sur un canvas avec narration optionnelle (synthèse vocale) et permet
  de télécharger la vidéo en WebM. 1 vidéo gratuite/jour, illimité en Premium.
- **Coach IA** (`/api/coach/*`, Premium) : tuteur conversationnel. On peut
  brancher sa **propre clé API** (OpenAI, Anthropic, Gemini, endpoint
  personnalisé compatible OpenAI). La clé est stockée **côté serveur** et
  n'est jamais renvoyée au navigateur. Sans clé, un coach local fonctionne
  hors ligne.

## Sécurité

- Mots de passe hachés (bcrypt), sessions JWT en cookie httpOnly.
- Routes protégées (`requireAuth`) et admin (`requireAdmin`, 401 vs 403).
- Quiz notés **côté serveur** (les réponses ne sont pas exposées à l'app aux
  `/api/quizzes/:id`), XP mini-jeux dérivé et plafonné côté serveur.
- Rate limiting sur les routes d'authentification et de génération.
- Aucune donnée bancaire stockée (Stripe Checkout + portail).

## Tests

```bash
npm test        # suite API hermétique (clés externes vides)
npm run e2e     # parcours navigateur Playwright
```

## Arborescence

```
src/       db.js, auth.js, content.js, billing.js, app.js, server.js
public/    index, auth, app, admin, pages légales, css/, js/
scripts/   seed.js, run-tests.js, e2e.js, tests/
```

## Note contenu IA

Le contenu généré par IA peut contenir des erreurs. Vérifie toujours les
informations importantes avec ton cours ou ton professeur.
