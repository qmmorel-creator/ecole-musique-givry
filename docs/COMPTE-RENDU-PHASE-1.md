# Compte rendu · phase 1 (démonstration, données fictives)

Établi le 9 novembre 2026 pour Quentin.

## Publication

| | |
| --- | --- |
| URL | https://ecole-musique-givry.netlify.app |
| Site Netlify | `ecole-musique-givry` (ID `b8bd1f57-c614-4ab3-a781-2f7a5b7ce985`), équipe `qm-morel`, nom obtenu tel quel |
| Commit déployé (SHA) | `c42b40fff1fa0c42fcb7afce1c730021455086a7` (branche `phase-1-demo`) |
| Deploy ID | `6af1dc228fdb0ac8a9cd38c6` (un seul déploiement en production) |
| Mode de déploiement | build local, `netlify deploy --prod --no-build --dir dist` ; site **non relié au dépôt Git**, pour qu'aucun push ne déclenche de build ni de déploiement payant en crédits |
| Données | `VITE_DATA_SOURCE=demo` : jeu d'essai fictif dans le navigateur, bandeau « Données de démonstration », bouton « Réinitialiser la démonstration » |
| Indexation | `<meta name="robots" content="noindex, nofollow">`, en-tête `X-Robots-Tag: noindex, nofollow` sur toutes les routes, `robots.txt` qui interdit tout |
| Projet Supabase | **non créé** (phase 1 décidée le 9 novembre) ; région prévue : Francfort ou Paris |

Les commits postérieurs au SHA déployé ne touchent que la configuration des tests et ce compte rendu.

## Vérifications en production

| Contrôle | Résultat |
| --- | --- |
| La page répond | 200 sur `/`, `/inscription`, `/bureau`, `/reinscription/…`, `/donnees-personnelles`, `/robots.txt` |
| `noindex` | présent (balise et en-tête) sur toutes ces routes |
| Formulaire sur téléphone (375 px) | inscription complète, fratrie reconnue, liste d'attente, réinscription par lien : OK, sans défilement horizontal |
| Connexion du bureau | sélecteur de rôle de démonstration : OK pour les 3 rôles ; droits vérifiés (le secrétariat n'accède pas à la comptabilité) |
| Mails | **aucun mail réel ne part en phase 1** : ils s'affichent dans le journal « Mails » et sur la page de confirmation |
| Console du navigateur | aucune erreur (vérifiée par les tests) |
| Données sans connexion | sans connexion, `/bureau/*` affiche seulement la page de connexion. Réserve : en démonstration, le jeu d'essai **fictif** est contenu dans le code JavaScript public ; c'est sans conséquence ici, et en phase 2 aucune donnée ne sera dans le code (RLS, voir plus bas) |

Les 18 tests de bout en bout ont été rejoués contre l'URL de production : 18 réussis.

## Tests

`npm run verify` passe avant chaque push : lint, types, types des fonctions Edge (Deno), tests, compilation, tests de bout en bout.

| Suite | Nombre | Contenu |
| --- | --- | --- |
| Unitaires (Vitest) | 54 | calcul du tarif (dont l'exemple 310,50 € de la maquette), réduction fratrie, échéances et statuts, déclencheur des recettes, exercice, bilan, validation, recherche de fratrie, jeu d'essai, source de démonstration, copie du domaine dans les fonctions Edge |
| SQL et RLS (Vitest + PGlite) | 35 | migrations appliquées sur Postgres ; **un visiteur anonyme ne lit aucune ligne des 21 tables** ; compte sans profil : rien ; droits par rôle ; recettes automatiques non modifiables ; déclencheur ; bordereau ; journal ; limite d'envois ; purge |
| Bout en bout (Playwright) | 18 | téléphone : inscription, liste d'attente, réinscription ; bureau : accueil, élèves et export Excel, règlement, bordereau PDF, relances validées, liste d'attente, droits ; comptabilité : encaissement vers recette, dépense avec justificatif, bilan PDF, reçu, attestation, exports XLSX et CSV, grille paramétrable ; accessibilité WCAG 2.1 AA (axe-core) sur toutes les pages et navigation au clavier |
| Fonctions Edge | 5 | types vérifiés par Deno 2.9.6 |

Tests sur un Supabase local réel (CLI 3.1.0, Docker) :
- les 3 migrations et `seed.sql` s'appliquent sans erreur sur Postgres 15 Supabase ;
- par l'API REST avec la clé anon : refus (`42501`) sur `students`, `families`, `guardians`, `enrollments`, `payments`, `ledger_entries`, `audit_log` et sur `sibling_lookup` ; `public_catalog` renvoie 13 cours sans aucune adresse ;
- le code des fonctions `recherche-fratrie` et `inscription`, exécuté avec Deno contre ce Supabase local : fratrie trouvée et non trouvée, refus 429 au 13e appel, refus 400 d'un dossier invalide, inscription créée avec réduction fratrie (310,50 € en 3 × 103,50 €), champ piège ignoré, action tracée dans le journal.
- **Limite** : le runtime Edge en conteneur n'a pas pu démarrer dans cet environnement : il refuse le certificat du proxy réseau du conteneur de travail pour télécharger `supabase-js`. C'est un problème de l'environnement, pas du code, mais le service `supabase functions serve` lui-même n'a donc pas été testé. Les fonctions `reinscription`, `envoyer-mails` et `inviter-membre` sont typées mais n'ont pas été exécutées. L'implémentation `supabase` de la couche de données est typée et compilée, mais n'a pas encore tourné dans un navigateur.

## Crédits Netlify et palier Resend

Barème officiel ([documentation Netlify](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), mise à jour du 12 août 2026) : 15 crédits par déploiement en production, 0 pour un déploiement de prévisualisation, 20 crédits par Go, 2 crédits pour 10 000 requêtes, compute à 10 crédits par Go-heure (non utilisé : aucune fonction Netlify).

| Poste | Estimation |
| --- | --- |
| Ce déploiement | **15 crédits** (un seul déploiement en production) |
| Trafic mesuré | 0,4 Mo et 9 requêtes pour une famille qui remplit le formulaire ; 0,75 Mo et 24 requêtes pour une session du bureau au premier chargement |
| Mois de forte activité (juin) | environ 150 visites de familles et 60 sessions du bureau : 0,1 Go, soit environ 2 crédits, et moins de 4 000 requêtes, soit moins de 1 crédit |
| Total mensuel hors déploiement | environ 3 crédits ; chaque mise en production ajoute 15 crédits |

**Écart avec MISSION.md** : le compte Netlify utilisé n'est pas sur l'offre gratuite. L'équipe `qm-morel` est sur une offre **Pro à crédits** (`credit-pro-tier-2`, 3 000 crédits par mois au minimum selon la documentation), partagée par 9 sites. Créer le site n'a rien coûté ; le déploiement a consommé environ 15 crédits de cette allocation, sans dépense supplémentaire si le solde n'est pas épuisé. Selon la documentation, quand les crédits sont épuisés, tous les sites de l'équipe sont mis en pause, sauf si l'auto-recharge est activée (désactivée par défaut). Je n'ai pas lu le solde actuel de l'équipe.

Resend : non utilisé en phase 1 (aucun mail réel). En phase 2, l'offre gratuite (3 000 mails par mois, 100 par jour) suffit : environ 90 dossiers par an, quelques relances et liens de réinscription.

## Points à faire trancher par Quentin

Valeurs par défaut paramétrables, toutes signalées dans l'interface :

1. **Grille tarifaire réelle.** Hypothèses : cours individuel 30 min à 310 € (enfant, commune), 345 € (enfant, hors commune), 390 € et 430 € (adulte) ; éveil 150 et 170 € ; chorale 120 et 140 € (adulte) ; formation musicale seule 120 à 160 €. Une seule durée de cours individuel : faut-il une formule 45 min pour le cycle 2 ?
2. **Règles de fratrie.** Hypothèses : −10 % à partir du 2e élève de la famille, enfants seulement, sur l'instrument et la FM payante, jamais sur l'adhésion. Adhésion familiale : 20 € une fois par saison. Âge adulte : 18 ans au 1er septembre. Tarif « commune » : Givry seulement.
3. **Formation musicale.** Hypothèse : ajoutée d'office pour les enfants inscrits en instrument, incluse dans leur tarif ; payante pour un adulte qui la suit.
4. **Catégories comptables.** Nomenclature associative proposée (8 recettes, 10 dépenses), modifiable par la trésorerie.
5. **Dates.** Exercice du 1er septembre au 31 août ; échéances du règlement en 3 fois les 15 octobre, 15 janvier et 15 avril (une échéance passée est ramenée à la date d'inscription).
6. **Modèle des PDF.** Bandeau bleu, note orange dessinée (le vrai logo de l'école reste à fournir) ; bordereau séparé par chèques, chèques vacances ANCV et espèces. Les ANCV ne se déposent pas en banque mais se remboursent auprès de l'ANCV : faut-il les sortir du bordereau ? Le reçu de paiement n'est pas un reçu fiscal ; aucun reçu fiscal de don (Cerfa) n'est produit : hors devis à mon sens.
7. **Droits par rôle.** Présidence : tout. Trésorerie : tout sauf la gestion des comptes du bureau. Secrétariat : élèves, inscriptions, places, saisie des règlements et relances, sans bordereaux, comptabilité, paramètres ni RGPD.
8. **Dossier complet.** Pièce demandée par défaut : attestation d'assurance responsabilité civile (case cochée par le bureau, pas de dépôt de fichier par les familles, qui relèverait de l'espace famille).
9. **Règlement intérieur et textes RGPD.** Le règlement intérieur n'est pas fourni : il faut un document ou un lien. Les mentions RGPD et la durée de conservation (3 ans après la dernière saison) sont à valider par le bureau.
10. **Expéditeur des mails.** Resend n'envoie à n'importe quel destinataire qu'avec un domaine vérifié. Il faut donc soit l'option « nom de domaine dédié en .fr » du devis (+ 20 € HT par an, à décider), soit un sous-domaine d'un domaine existant. C'est une dépense à valider.
11. **Mails applicatifs.** MISSION.md demande Resend en SMTP. J'ai choisi le SMTP pour Supabase Auth et l'API HTTP de Resend (même compte, même offre gratuite) pour les mails des fonctions Edge, plus simple et plus fiable depuis Deno. À confirmer.
12. **Équipe Netlify.** Voir l'écart ci-dessus : garder le site sur l'équipe Pro `qm-morel`, ou le déplacer sur un compte gratuit dédié à l'école.
13. **Nom de la trésorière.** La maquette utilise « Claire D. », reprise comme personne fictive ; le devis nomme Mme Sarah Villar. Aucune personne réelle ne figure dans la démonstration.

## Reste à faire avant de remplacer les données fictives (phase 2)

1. Accord de Quentin pour créer le projet Supabase (environ 10 $ par mois dans l'organisation Pro), en région Francfort ou Paris.
2. `supabase link`, `supabase db push` (**sans** `seed.sql`), `supabase functions deploy`, secrets `RESEND_API_KEY`, `MAIL_FROM`, `RATE_LIMIT_SALT`, `SITE_URL`.
3. Domaine d'envoi vérifié chez Resend, SMTP Resend dans Supabase Auth, URL du site et URLs de redirection (`/bureau`).
4. Variables Netlify : `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`.
5. Tester de bout en bout le mode `supabase` dans un navigateur (connexion par lien magique, toutes les actions du bureau, envoi réel des mails) ; c'est la partie qui n'a pas encore tourné.
6. Grille, catégories, dates, cours et capacités réels saisis dans Paramètres ; invitation des membres du bureau.
7. Import des vraies données par Quentin.
8. Retirer `noindex` (balise dans `index.html`, en-tête dans `netlify.toml`, `robots.txt`) seulement après validation de la mise en service ; le bandeau disparaît avec `VITE_DATA_SOURCE=supabase`.
9. Point de fiabilité connu : deux familles qui prennent la dernière place d'un cours exactement au même moment pourraient toutes deux être inscrites (le bureau valide chaque dossier). Un verrou en base est possible si besoin.

## Hors périmètre, non construit

Planning des professeurs, organisation événementielle, planning des cours et des salles, espace famille, paiement en ligne par carte, reprise de l'historique, données de santé, paie des professeurs.
