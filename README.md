# École de Musique de Givry

Application d'inscription en ligne, d'administration des élèves et de gestion associative de l'École de Musique de Givry (71), conçue par QME · Quentin Morel Engineering.

**Phase 1 (en cours) : démonstration avec des données fictives**, publiée sur https://ecole-musique-givry.netlify.app (bandeau « Données de démonstration », pages non indexées). Les données réelles et la base Supabase viendront en phase 2, sur décision de Quentin.

- Cahier des charges : [`docs/MISSION.md`](docs/MISSION.md) · maquette : [`docs/maquette-demo.html`](docs/maquette-demo.html) · devis et offre : [`docs/`](docs/)
- Compte rendu de la phase 1 : [`docs/COMPTE-RENDU-PHASE-1.md`](docs/COMPTE-RENDU-PHASE-1.md)

## Ce que fait l'application

| Module | Pour qui | Contenu |
| --- | --- | --- |
| 1. Inscriptions en ligne | Familles, sur téléphone | Formulaire en 3 étapes, lien fratrie (réponse « trouvée » ou « non trouvée » seulement), places restantes et liste d'attente, formation musicale ajoutée d'office, tarif selon la grille, règlement en 1 ou 3 fois, autorisations datées, mail de confirmation, réinscription par lien personnel |
| 2. Administration | Bureau | Accueil et « à faire », base des élèves (filtres, fiches, historique, export Excel), échéances et règlements, bordereau de remise PDF, relances validées avant envoi, places et liste d'attente |
| 3. Gestion associative | Trésorerie | Exercice paramétrable, recettes d'inscription automatiques, saisie des recettes et dépenses avec justificatif, résultat par événement, bilan PDF, reçus et attestations, export pour le CA |

Hors périmètre (modules complémentaires sur devis) : planning des professeurs, organisation événementielle, planning des cours et des salles, espace famille, paiement en ligne par carte, reprise de l'historique. Aucune donnée de santé, pas de paie.

## Architecture

- **Front** : Vite, React, TypeScript, site statique. Interface en français, mobile d'abord pour les familles.
- **Domaine métier** (`src/domain/`) : TypeScript pur, sans dépendance. Tarif, fratrie, échéances, statuts, recettes automatiques, bilan, validation, modèles de mails, droits par rôle. Il est **copié à l'identique** dans les fonctions Edge (`npm run sync:shared`, vérifié par un test), pour que le navigateur et le serveur appliquent les mêmes règles.
- **Couche de données** (`src/data/`) : une interface (`api.ts`), deux implémentations choisies par `VITE_DATA_SOURCE` :
  - `demo` (phase 1, active) : jeu d'essai fictif dans le navigateur (localStorage), qui simule le serveur (validation, recherche de fratrie, tarif, déclencheur des recettes, journal, mails affichés à l'écran). Bouton « Réinitialiser la démonstration ».
  - `supabase` (phase 2) : écrite et typée, appelle les tables protégées par RLS, les RPC et les fonctions Edge.
- **Supabase** (`supabase/`) : migrations SQL, RLS sur toutes les tables, déclencheur des recettes, RPC `security definer`, fonctions Edge (Deno), jeu d'essai fictif `seed.sql`.
- **PDF** (bordereau, bilan, reçu, attestation) et **exports** (XLSX, CSV) générés dans le navigateur.

## Installation

Prérequis : Node.js 22.

```bash
npm install
cp .env.example .env        # VITE_DATA_SOURCE=demo pour la démonstration
npm run dev                 # http://localhost:5173
```

### Variables d'environnement

| Variable | Où | Rôle |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | navigateur | `demo` ou `supabase` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | navigateur | URL du projet et clé publique (anon / publishable). Jamais la clé `service_role`. |
| `VITE_SITE_URL` | navigateur | adresse publique (liens de connexion et de réinscription) |
| `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | secrets Supabase | envoi des mails par Resend |
| `RATE_LIMIT_SALT` | secret Supabase | sel du hachage des adresses IP (limite d'envois) |
| `SITE_URL` | secret Supabase | origine autorisée (CORS) et liens |

Les secrets se déclarent dans Netlify (variables `VITE_*`) et avec `supabase secrets set` ; jamais dans le dépôt.

## Vérification

```bash
npm run verify
```

Lance dans l'ordre : lint (ESLint), types (TypeScript), types des fonctions Edge (Deno, via `npx`, réseau nécessaire au premier lancement), tests (Vitest : domaine, source de démonstration, migrations et RLS sur Postgres en mémoire avec PGlite), compilation, tests de bout en bout (Playwright : téléphone et bureau). Elle doit passer avant chaque push.

## Base de données (phase 2)

```bash
npx supabase start                      # local, avec Docker
npx supabase db reset                   # applique supabase/migrations puis supabase/seed.sql (fictif)
npx supabase functions serve            # fonctions Edge en local
```

En production : projet Supabase en **région européenne** (Francfort ou Paris), puis `supabase link`, `supabase db push`, `supabase functions deploy`, `supabase secrets set …`. Le jeu d'essai fictif ne doit pas être chargé en production réelle ; Quentin importe lui-même les vraies données.

Points clés de sécurité :
- RLS activée sur toutes les tables ; le rôle `anon` n'a aucun droit sur les tables. Le public ne voit que `public_catalog()` (cours, places, grille, sans donnée personnelle) et passe par les fonctions Edge.
- `sibling_lookup()` et `hit_rate_limit()` ne sont exécutables que par la clé `service_role` des fonctions Edge.
- Droits par rôle (`presidence`, `tresorerie`, `secretariat`) : même matrice dans `src/domain/permissions.ts` et `public.has_cap()`.
- Les recettes automatiques ne se modifient pas à la main ; le journal `audit_log` trace chaque action du bureau.
- Justificatifs dans le bucket privé `justificatifs`, lus par liens signés de 60 secondes.
- Authentification du bureau par lien magique, inscriptions publiques fermées (`enable_signup = false`) ; la présidence invite les membres.

Le jeu d'essai `supabase/seed.sql` est généré depuis celui de la démonstration : `npm run seed:sql`.

## Déploiement (Netlify)

Site statique, sans fonction Netlify (économie de crédits). `netlify.toml` fixe la commande de build, la réécriture des routes vers `index.html` et l'en-tête `X-Robots-Tag: noindex`.

```bash
npm run build
npx netlify-cli deploy --prod --dir dist --site ecole-musique-givry   # NETLIFY_AUTH_TOKEN dans l'environnement
```

Chaque mise en production consomme des crédits Netlify : regrouper les changements et limiter les déploiements.

## Guide court pour le bureau

1. **Se connecter** : ouvrir `/bureau`, saisir son adresse mail, cliquer sur le lien reçu (pas de mot de passe). En démonstration, choisir un rôle.
2. **Chaque semaine** : l'accueil liste ce qui est à faire (dossiers à valider, rattachements de fratrie à vérifier, pièces à remettre en banque, familles en retard, places à proposer).
3. **Valider un dossier** : Élèves → filtre « À valider » → ouvrir la fiche → vérifier le rattachement si demandé → « Valider l'inscription ».
4. **Enregistrer un règlement** : Encaissements → « Enregistrer » sur l'échéance → mode, numéro de chèque ou référence, banque, date. Un virement est encaissé tout de suite ; un chèque passe « à remettre ».
5. **Remettre les chèques** : Encaissements → cocher les pièces → « Préparer le bordereau » → « Générer le bordereau PDF » → après le dépôt, « Marquer comme déposé ». Les recettes arrivent seules en comptabilité.
6. **Relancer** : Encaissements → « Préparer les relances » → Mails → relire, cocher, « Valider et envoyer ». Rien ne part sans validation.
7. **Liste d'attente** : Inscriptions et places → « Proposer la place » au premier → après sa réponse, « Inscrire » ou « Retirer ».
8. **Comptabilité** : saisir les dépenses et recettes avec leur justificatif, rattacher un événement si besoin ; « Générer le bilan PDF » pour l'assemblée générale. L'outil tient une comptabilité de trésorerie ; il ne remplace pas un expert-comptable.
9. **Reçus et attestations** : fiche famille → « Reçu de paiement PDF » ou « Attestation PDF » sur l'élève.
10. **Transmettre au bureau suivant** : Paramètres → Comptes du bureau → inviter les nouveaux membres, retirer l'accès des sortants.
11. **RGPD** : Données et RGPD → export complet (Excel ou CSV), purge des familles au-delà de la durée de conservation, journal des actions.

---

Réalisé par QME.
