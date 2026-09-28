# Déploiement & retour arrière — REVIQO

## Prérequis

- **Node.js ≥ 24** (`node:sqlite` est disponible sans drapeau sur Node 24 ; `.node-version` fixe `24`).
- `npm install` (dépendances : express, cookie-parser, bcryptjs, jsonwebtoken, stripe, nodemailer).
- Base **SQLite** dans `DB_PATH` (par défaut `./data/reviqo.db`).

## Variables d'environnement

Voir `.env.example`. Minimum vital en production :

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | signature des sessions (généré sur Render) |
| `APP_ORIGIN` | URL publique (liens e-mail, redirections OAuth) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | compte administrateur initial |
| `DB_PATH` | chemin de la base SQLite |

Optionnels (voir `docs/EXTERNAL-SERVICES.md`) : e-mail, Stripe, Google, LLM, YouTube, publicités.

## Render

Le fichier **`render.yaml`** décrit le service :

- `buildCommand: npm install && npm run check` (le `check` refuse tout fichier front-end placé dans `src/`) ;
- `startCommand: npm start` (`node src/server.js`) ;
- `healthCheckPath: /api/health` ;
- `NODE_VERSION=24`.

> **Base de données** : sur un service Render (surtout en plan gratuit), le disque est **éphémère** :
> la base SQLite est réinitialisée à chaque déploiement. Pour conserver les données, attachez un
> **disque persistant** et pointez `DB_PATH` dessus, ou migrez vers PostgreSQL.

## Démarrage

```bash
npm install
cp .env.example .env        # renseigner les valeurs
npm run seed                # facultatif : données de démonstration
npm start                   # http://localhost:3000
```

## Migrations

Les migrations sont **automatiques et non destructives** au démarrage (`src/db.js`) :
`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`, index `IF NOT EXISTS`, upsert du référentiel
des programmes et de la bibliothèque. Aucune donnée existante n'est supprimée.

## Vérifications

```bash
npm test      # suite API hermétique (base temporaire, clés externes vides)
npm run check # garde-fou de déploiement (imports serveur)
npm run e2e   # parcours navigateur Playwright (nécessite les navigateurs Playwright)
```

## Procédure de retour arrière

1. **Code** : redéployer le commit précédent (Render → *Rollback* ou `git revert` puis push).
   Le service redémarre et rejoue les migrations (idempotentes).
2. **Base** : sauvegarder `DB_PATH` avant toute mise à jour majeure
   (`cp data/reviqo.db data/backup-YYYYMMDD.db`). En cas de problème, restaurer le fichier sauvegardé
   **après** avoir arrêté le service.
3. **Stripe** : en cas d'incident de facturation, utiliser le dashboard Stripe ; l'état local étant
   reconstruit par les webhooks, lancer `POST /api/billing/sync` (ou attendre le prochain événement)
   pour resynchroniser.
4. **Contenus** : les statuts `draft`/`to_validate`/`archived` permettent de retirer un contenu
   défectueux sans le supprimer (admin → Bibliothèque).

## Liste de contrôle après déploiement

- [ ] `GET /api/health` renvoie `{ ok: true }`.
- [ ] Connexion administrateur OK, `/admin.html` accessible.
- [ ] Un compte de test peut s'inscrire et se connecter.
- [ ] `GET /api/config` renvoie `stripeEnabled`, `googleEnabled`, `trialDays`.
- [ ] Admin → Diagnostics : e-mail/Stripe/YouTube indiqués selon la configuration réelle.
