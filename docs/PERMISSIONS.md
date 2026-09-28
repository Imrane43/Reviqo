# Permissions, XP et droits — REVIQO

## Rôles

| Rôle | Description |
|---|---|
| **Invité** (`is_guest`) | profil unique, non listé dans les classements publics ; conversion possible en compte inscrit sans perdre sa progression. |
| **Utilisateur** (`user`, plan `free`) | accès aux contenus gratuits, quotas IA limités, publicités. |
| **Premium** (`plan = 'premium'`, statut actif/essai) | contenus premium, IA illimitée, Coach, Vidéo IA, zéro publicité. |
| **Admin d'équipe** (`team_members.role = 'admin'`) | gère **son équipe** uniquement (invitations, membres, défis). |
| **Admin de plateforme** (`users.role = 'admin'`) | accès `/api/admin/*`. **Distinct** d'un admin d'équipe. |

## Accès aux endpoints (résumé)

| Ressource | Invité | Utilisateur | Premium | Admin équipe | Admin plateforme |
|---|---|---|---|---|---|
| `/api/quizzes`, `/api/flashcards`, `/api/subjects` | oui (gratuits) | oui | + premium | — | — |
| Quiz premium | non (402) | non (402) | oui | — | oui |
| `/api/study/generate`, `/api/video/*`, `/api/coach/*` | non | quotas / refus | oui | — | oui |
| `/api/leaderboard` (global/hebdo/mois/amis) | non authentifié | oui | oui | — | oui |
| `/api/teams/:id` (détail privé) | non | **membre uniquement (403)** | idem | oui | **non** (hors équipe) |
| `/api/teams/members/:id/{remove,role}` | non | non (403) | non (403) | oui | non (hors équipe) |
| `/api/admin/*` | non | non (403) | non (403) | non | oui |
| `/api/me/export`, `DELETE /api/me` | non | oui | oui | oui | **non** (protégé) |

Toutes les vérifications sont faites **côté serveur**. Les données d'un compte ne sont jamais
accessibles à un autre (favoris, carnet d'erreurs, révisions, planning, sessions d'étude).

## Règles d'XP

- **Calcul serveur uniquement** : aucun gain accepté directement depuis le navigateur.
- **Idempotence** : chaque attribution porte une clé `xp_transactions.ref` unique → rejouer un
  événement (tentative, partie, session) ne crédite pas deux fois.
- **Anti-farming** : répéter le même quiz le même jour → **20 %** dès la 2ᵉ tentative, **0** au-delà
  de 3. Les mini-jeux sont plafonnés (≤ 120 XP/session).
- **Séries** : bonus une seule fois par jour (`streak:<user>:<date>`).
- **XP collectif** : un gain d'XP alimente l'objectif d'équipe via un événement unique
  (`team_xp_events.ref`).
- **Classements** : départage déterministe `xp DESC, id ASC` ; ligue d'équipe par taille avec score
  normalisé par membre (`perMember`).

## Droits premium et politique de facturation

- **Essai** : 7 jours (`TRIAL_DAYS`), puis prélèvement automatique.
- **Activation** : uniquement par **webhook Stripe vérifié**. La page de succès n'active jamais rien.
- **Impayé** (`past_due`) : accès conservé pendant `BILLING_GRACE_DAYS` (défaut 3).
- **Résiliation en fin de période** : accès conservé jusqu'à `current_period_end`.
- **Remboursement / contestation** : retrait immédiat des droits.
- **Facturation** : conservée même après suppression de compte (obligation légale).

## Contenus

- Statuts : `draft` → `to_validate` → `published` → `archived`. Seuls les `published` sont servis.
- Publication refusée (`422`) sans objectif, sans question valide, ou sans source officielle pour un
  chapitre d'examen.
- Filtrage strict par **programme** (`curriculum_id` ou matière du programme) et par **droits**
  (contenu premium exclu pour un compte gratuit).
