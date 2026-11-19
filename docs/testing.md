# Tests et intégration continue

## Vérification complète

Depuis la racine du dépôt, après `make install` :

```bash
make check
make test-e2e
```

`make check` exécute Ruff, la vérification de format Python, TypeScript et ESLint, construit le frontend et la documentation, puis lance pytest. L'ordre garantit que les tests HTTP portent sur de véritables sorties de production.

Playwright nécessite Chromium. Lors de la première installation ou après une mise à jour de sa version :

```bash
cd frontend
npx playwright install --with-deps chromium
cd ..
```

## Niveaux de vérification

| Contrôle | Ce qu'il détecte | Commande ciblée |
| --- | --- | --- |
| Ruff | Erreurs et conventions Python | `uv run --frozen ruff check backend` |
| Format Python | Écart au format du projet | `uv run --frozen ruff format --check backend` |
| TypeScript / ESLint | Types et règles du frontend | `npm --prefix frontend run check` |
| MkDocs strict | Liens, ancres et configuration documentaire | `uv run --frozen --group docs mkdocs build --strict` |
| pytest | Contrats HTTP, configuration et fichiers construits | `uv run --frozen pytest` |
| Playwright | Comportement réel dans Chromium | `make test-e2e` |
| Docker build | Cohérence de toutes les étapes de l'image | `docker build --tag personal-site:check .` |
| Docker Compose | Syntaxe et compatibilité de la configuration, sans afficher les secrets | `docker compose config --quiet` |
| Smoke test | Réponses principales d'un service lancé | `bash scripts/smoke-test.sh` |

Les commandes de contrôle ne réécrivent pas le code source. Pour appliquer volontairement le format Python, utiliser `uv run ruff format backend`, puis inspecter le diff et relancer les contrôles.

## Tests HTTP

Les fixtures construisent l'application en production avec le dossier `build/`. Les tests vérifient notamment :

- le contenu et le type de la réponse de santé, ainsi que son absence de cache ;
- l'accueil et les assets réellement référencés par son HTML ;
- le cache long des assets nommés avec empreinte et la revalidation du HTML ;
- la redirection `/documentation` et le chargement d'une page imbriquée ;
- l'index JSON de recherche ;
- les 404 sur les chemins inconnus, l'API, les assets et la documentation ;
- la désactivation de Swagger, ReDoc et OpenAPI ;
- l'échec de démarrage si un `index.html` requis manque ;
- le refus d'un chemin statique relatif et le contrôle explicite de l'indexation.

`test_admin.py` ajoute une base SQLite temporaire et des secrets générés pour chaque fixture. Les tests couvrent activation, connexion, cookies, origine/CSRF, expiration et révocation, changement du compte, persistance et chiffrement des clés, limites de fréquence et de corps, validation des conversations et confidentialité des erreurs. Les trois adaptateurs LLM sont testés avec `httpx.MockTransport`, y compris refus, redirections, dépassements et délais : aucune clé réelle ni dépense API n'est nécessaire.

Ces tests utilisent le client HTTP de l'application : ils n'ouvrent pas de port public et ne vérifient pas le certificat TLS. Une construction manquante est une erreur de préparation du test, pas une raison de remplacer les artefacts par des fichiers factices.

### Studio de contenus : tests HTTP

`test_content.py` vérifie les quinze collections sur une vraie base temporaire : création, lecture, modification, duplication autorisée, archivage, restauration et suppression. Les parcours contrôlent les projets professionnel et personnel, les associations réciproques, le mauvais type de référence, la portée des catégories, les usages inverses, la suppression bloquée, les versions concurrentes et la persistance au redémarrage.

Les contrôles métier couvrent dates réelles et partielles, fin/en cours, certifications en préparation ou expirées, prix exacts dont zéro, consentement des témoignages, brouillon et passage prêt. Les tests de fichiers couvrent session, CSRF, formats trompeurs, SVG refusé, taille/quota, nom de chemin hostile, alternative d'image et lecture privée. La migration est testée depuis une base administrative peuplée (compte, clé chiffrée et session conservés) et refuse une version future. Un export/restauration vérifie manifeste, empreintes, intégrité, références, fichiers et révocation des sessions ; une copie altérée est refusée.

Commande ciblée : `uv run --frozen pytest backend/tests/test_content.py`. Elle ne touche aucun volume ni identifiant de production.

### Assistant : contrats, graphe et résilience

`test_assistant.py`, `test_assistant_contracts.py` et `test_assistant_resilience.py` couvrent création/édition des 15 collections, les valeurs des 403 champs et leurs sous-champs, listes conservées, références nouvelles/cycliques, associations réciproques, versions concurrentes, prix exacts et champs nullables. Les propositions sont contrôlées sans mutation métier, puis appliquées atomiquement et de façon idempotente. Les tests couvrent expiration, abandon, remplacement après clarification, révocation de session et rejet d'opérations fournies par le client.

Les tests traversent les véritables agents LangChain, le StateGraph LangGraph et les adaptateurs natifs HTTP (OpenAI Responses, Anthropic et Mistral) avec des transports simulés. Ils vérifient clarification/reprise, délégation par sections, préférences familiales, contexte privé exclu, outils uniquement en lecture, sorties invalides bornées, refus fournisseur nettoyés, délais et annulation serveur avec libération du verrou. Une base peuplée en schéma 1 est migrée ; l'export/restauration préserve préférences et contenus tout en révoquant les propositions.

Commande ciblée : `uv run --frozen pytest backend/tests/test_assistant*.py`. Construire auparavant avec `make build` ; ne pas reconstruire les artefacts pendant ces tests HTTP.

### Travaux durables : critères de vérification

Les scénarios de l'issue #22 doivent traverser la planification progressive, les sous-agents et le stockage durable avec des fournisseurs simulés. Un résultat de génération seul ne prouve pas l'absence de plafond : vérifier le nombre exact de tâches préparées et appliquées, leurs identités, les relations finales et les appels effectivement délégués.

| Scénario | Preuve attendue |
| --- | --- |
| Demandes de 13 et 100 fiches | Toutes les fiches demandées, sans réduction imposée du volume, doublon ni écriture avant relecture |
| Plus de 16 sections déléguées | Vagues successives et maximum mesuré de trois appels simultanés |
| Plus de 50 lots et 40 apports | Continuité du travail, pagination effective et reçus antérieurs encore idempotents |
| Coupure HTTP, rechargement et reconnexion | Même travail retrouvé, anciennes sessions refusées, étapes terminées conservées |
| Redémarrage du processus | Étapes interrompues reprenables, applications passées non répétées |
| Pause et arrêt | Confirmation de l'arrêt effectif des appels, absence de nouvel appel après prise en compte |
| Questions, quota, erreur ou budget d'étape | Avancement sauvegardé et reprise explicite sans boucle illimitée |
| Références entre lots, futures et cycliques | Identifiants réels réutilisés et propositions d'associations relues ; aucun lien omis |
| Conflits, variantes et règles métier | Annulation atomique du lot en conflit, versions/FR-EN/statut/visibilité/consentement préservés |
| Notes privées et suppression | Permission réellement observée dans les contextes, données techniques supprimées volontairement et fiches enregistrées conservées |
| Migration 4 → 5 et restauration | Compte, contenus, variantes et médias préservés ; travaux/reçus restaurés et sessions révoquées |

Conserver les scénarios des demandes simples et traductions : leur réussite est nécessaire en plus des nouveaux parcours. Les tests doivent inspecter de vraies bases temporaires et les sorties du graphe, sans remplacer les validations métier par des mocks. Les fournisseurs simulés évitent la dépense mais ne prouvent pas la qualité éditoriale réelle.

`test_assistant_jobs.py` traverse les vrais sous-agents pour 13 et 100 fiches, mesure la concurrence, contrôle l'absence d'écriture avant application, puis vérifie les comptes et identités enregistrés. Il couvre également 52 lots avec reçus durables et 42 apports supplémentaires avec `request_id` idempotent. `test_assistant_jobs_storage.py` vérifie la migration d'une base bilingue peuplée de schéma 4, l'annulation transactionnelle d'une migration en échec et l'export/restauration des travaux, lots en attente, reçus et faits utilisateur. La restauration révoque les anciennes sessions, permet une nouvelle connexion et préserve l'idempotence des applications.

`test_assistant_jobs_content.py` vérifie les lectures d'outils et médias attachés avec ou sans accord pour les notes privées, ainsi que l'édition anglaise sans écraser la source française. `test_assistant_jobs_concurrency.py` combine plusieurs travaux et un tour direct pour vérifier la limite globale de trois appels simultanés. Il contrôle aussi le rejeu d'un ancien abandon et l'annulation des créations `/turn` et `/jobs` avant ou après leur commit, sans relance implicite. Les fichiers `test_assistant_jobs_resilience.py` et `test_assistant_jobs_dependencies.py` couvrent les interruptions, les quotas, les conflits, les cycles entre pages et les corrections de liens après création.

`test_assistant_call_budget.py` reproduit une expérience avec organisation et dix technologies : 12 tâches sur une seule page, chaque agent effectuant une vraie lecture d’outil avant sa sortie structurée. Il vérifie le transfert avant rédaction, plus de 24 appels répartis entre étapes, le plan non répété, l’absence d’écriture implicite, les reçus rejouables et les dix liens après application. Deux scénarios vérifient la frontière de réservation selon les appels déjà consommés par le coordinateur. Le parcours navigateur des travaux traverse également ce cas avec les véritables API et une base isolée.

Commande ciblée : `uv run --frozen pytest backend/tests/test_assistant_jobs*.py`. Ces tests ne touchent ni volume ni identifiant de production. Les résultats datés de leur exécution et les éventuelles vérifications impossibles sont consignés dans l'issue et la pull request, séparément de cette description de couverture.

## Tests navigateur

### Parcours du studio

`content.spec.ts` traverse React, FastAPI, SQLite et les fichiers sans simuler le stockage. Il crée un média, un projet professionnel avec expérience, organisation créée depuis le sélecteur, compétence, technologie, lieu, lien et image ; puis un service avec formule et FAQ et un article long. Il vérifie passage prêt, aperçu sans notes privées ni HTML exécutable, rechargement, conflit, garde de navigation, saisie conservée après reconnexion, duplication, archivage et restauration.

Les deux projets navigateur exécutent ce parcours avec des noms distincts, sans conflit de données. Les captures couvrent clair/sombre à 1440, 1024, 390 et 320 pixels, les six sections à 320 pixels et un viewport effectif équivalent au zoom 200 % sur bureau. Les couleurs de texte de l'éditeur sont mesurées dans les deux thèmes (rapport joint au test) ; le focus clavier et les débordements sont contrôlés. Le fournisseur est volontairement indisponible dans ce parcours pour vérifier l'indépendance des contenus.

### Accueil, réglages et documentation

Deux projets Chromium couvrent un bureau de 1440 pixels et un viewport mobile. Un scénario spécifique vérifie une largeur de 320 pixels. Les parcours couvrent l'accueil, la police locale, l'absence de débordement, le clavier, les préférences système, la persistance du thème et un stockage navigateur indisponible.

Le test d'initialisation du thème bloque le JavaScript compilé de React. Le thème attendu doit malgré tout être appliqué par `theme-init.js`. La documentation est testée via une page imbriquée, ses liens et la recherche interactive.

Les parcours administratifs couvrent connexion et déconnexion, menus accolés, choix du fournisseur, confidentialité de la clé, modification du compte, chat, erreurs, clavier et thèmes jusqu'à 320 pixels. La plupart contrôlent l'interface avec des routes simulées. Un parcours bureau traverse réellement React, FastAPI, SQLite, LangChain et LangGraph ; seul le HTTP externe est simulé. Sa variante mobile est volontairement ignorée pour éviter deux écritures concurrentes sur les réglages du serveur partagé.

Par défaut, Playwright démarre `backend/tests/serve_e2e.py` sur `127.0.0.1:8765`, avec les fichiers de production, une base temporaire et un compte de test fixe. Ce script reste hors du paquet et de l'image de production. Construire les sorties avant une exécution isolée :

```bash
make build
make test-e2e
```

Pour viser un service déjà lancé, sans démarrer le serveur local :

```bash
PLAYWRIGHT_BASE_URL=https://new.thibault-leveau.com make test-e2e
```

Avec `PLAYWRIGHT_BASE_URL`, tous les parcours administratifs sont ignorés : les tests publics restent en lecture seule. Ne pas utiliser les identifiants de production dans les fixtures, rapports, traces ou captures. Les changements de thème restent dans les contextes navigateur de test.

## Résultats et diagnostic

Playwright affiche le résultat dans le terminal et produit un rapport HTML sous `frontend/playwright-report/`. Les traces et captures sont conservées en cas d'échec. Pour ouvrir le rapport localement :

```bash
cd frontend
npx playwright show-report
```

Si un test de navigation documentaire échoue alors que MkDocs construit sans erreur, inspecter le chemin réellement demandé et la console du navigateur. Un préfixe erroné, un index de recherche absent ou une mauvaise réponse HTTP peuvent n'apparaître qu'à l'exécution.

## GitHub Actions

Le workflow est déclenché par les pushes sur `main` et les pull requests. Il installe Node.js et uv, restaure les dépendances verrouillées, lance les contrôles et tests navigateur, puis construit l'image Docker. En cas d'échec, le rapport Playwright est publié comme artefact temporaire de la CI.

La CI ne publie pas d'image dans un registre et ne déploie pas le serveur. Un résultat vert valide le commit testé ; la procédure de [déploiement](deployment.md) doit ensuite utiliser ce même commit. Les commandes de vérification publique restent nécessaires après démarrage derrière Caddy.

### Parcours de l'assistant et essai fournisseur

`assistant-workflow.ts`, appelé par le parcours réel administratif, vérifie les préférences (garde de saisie, héritage, réinitialisation, rechargement), un projet avec nouvelle compétence, correction avant application, liens vers les éditeurs, clarification d'un profil délégué, service à tarifs exacts et FAQ, puis article avec fichier téléversé. Les captures concernent les vues réelles, en clair/sombre à 1440, 390 et 320 pixels ; contrôler aussi le focus clavier, les contrastes et l'absence de débordement. Les scénarios partagent volontairement le seul parcours qui configure la clé de test, pour éviter une course avec son retrait.

Les simulations garantissent des scénarios reproductibles, pas la qualité d'un fournisseur réel. Lors d'un changement d'adaptateur, effectuer également un essai borné du modèle configuré avec des données synthétiques et un stockage temporaire. Aucun contenu de démonstration n'est appliqué en production. Consigner modèle, nombre d'appels, délégations, présence de questions/proposition et résultat, sans clé ni contenu privé. L'essai de l'issue #12 a notamment détecté le besoin de Responses pour les outils avec raisonnement de GPT-6 Luna ; le contrôle a été relancé après correction.

Le parcours navigateur des travaux doit vérifier une demande importante, les compteurs et pages de lots, la relecture/application, les précisions, la pause/reprise/arrêt, le retour après rechargement et reconnexion, et la suppression volontaire du suivi. Contrôler français/anglais, clair/sombre, bureau/mobile jusqu'à 320 pixels, contrastes, focus visible et commandes clavier. Une perte réseau pendant l'application doit conduire à relire le reçu du même lot, sans nouvelle création. Les écritures de ces scénarios utilisent exclusivement un stockage de test isolé.

`assistant-jobs.spec.ts` sépare deux niveaux : scénarios d'interface avec API simulée (états, réponses retardées, reprise, 51 lots et 41 apports), puis parcours réel de 13 fiches sur le serveur dédié 8769. Ce dernier utilise React, FastAPI, SQLite, LangChain et LangGraph ; seul le transport fournisseur est simulé par `assistant_jobs_e2e.py`. Le serveur est lancé par `serve_e2e.py` avec `ASSISTANT_JOBS_FIXTURES=1` et `E2E_PORT=8769`, sur une base temporaire distincte. Ce parcours d'écriture s'exécute une seule fois sur bureau et n'est jamais dirigé vers la production.

## Collections publiques

`test_public.py` couvre les quinze projections et routes, Prêt + Public, retrait, archives, références privées, recherche sans accents, pagination, limites, anonymat, consentement, métadonnées échappées, 404 et fichiers/miniatures avec contrôle d'accès avant cache. `public_fixtures.py` produit des contenus et une illustration synthétiques uniquement pour les tests.

Playwright démarre cinq serveurs locaux isolés : 8765 pour les parcours historiques (base vierge), 8766 avec `PUBLIC_FIXTURES=1` pour les collections publiques et 8767 avec `E2E_PORT=8767` pour les langues. Les serveurs 8766 et 8767 utilisent des bases peuplées temporaires distinctes. Le serveur 8768 est réservé aux écritures du parcours bilingue et 8769 aux travaux durables de l'assistant. Aucun de ces réglages n'appartient à la configuration de production. `public.spec.ts` vérifie les sept rubriques, les quinze fiches, la recherche et ses liens, les tarifs, FAQ, sommaire, images, le menu au clavier et les erreurs. Les captures couvrent desktop/mobile, clair/sombre et 320 px. Le profil de démonstration n'entre jamais dans l'image ni dans la base de production.

Avec `PLAYWRIGHT_BASE_URL`, les tests dépendant de données synthétiques sont ignorés et les vérifications publiques restent en lecture seule. Exécuter les constructions avant les tests HTTP et navigateur ; ne pas reconstruire `build/web` pendant qu'un test le lit. Les contrôles de contraste, zoom 200 % et revue visuelle complètent les assertions fonctionnelles.

## Langues d’interface

`test_languages.py` couvre les valeurs initiales, session/origine/CSRF, validation fermée, conflit de version, codes anonymes minimaux, HTML et messages localisés, métadonnées de chaque formulaire, absence de mutation éditoriale lors du changement d’interface, choix éditorial indépendant, concurrence entre zones, migration d’une base de schéma 2 peuplée, redémarrage et sauvegarde/restauration. Les propositions persistées sont relues dans la langue courante sans modifier leurs valeurs. La parité des clés et interpolations est contrôlée pour les deux catalogues backend et frontend.

`npm run check` inclut `scripts/check-i18n.mjs`, une analyse TypeScript des textes JSX, expressions conditionnelles, attributs accessibles et textes français non extraits, avec exceptions limitées aux marques et aux noms natifs des langues. Les clés passées à `t()` sont typées. `scripts/test-i18n.mjs` contrôle les pluriels à zéro, un, plusieurs et un million ainsi que les interpolations numériques dans chaque langue. Pour ajouter une langue, adapter aussi les pluriels et les contrôles de parité.

`languages.spec.ts` modifie réellement les réglages sur le serveur 8767 et vérifie garde de navigation, application immédiate, indépendance public/admin, rechargement, formulaires et chat anglais, quinze fiches éditoriales préservées, recherche, 404, clavier et absence de débordement. Les captures et mesures de contraste couvrent la nouvelle page en français/anglais, clair/sombre et jusqu’à 320 pixels. Ce parcours s’exécute une seule fois et contrôle lui-même les largeurs mobile/bureau ; il est ignoré lorsque `PLAYWRIGHT_BASE_URL` vise la production.

`language-loading.spec.ts` vérifie sur les assets réellement construits que seul le catalogue actif est téléchargé, que le premier rendu attend ses traductions, et qu’un échec réseau affiche une reprise utilisable au clavier dans les deux langues et thèmes. Un téléchargement administratif interrompu ne doit déclencher aucune sauvegarde de langue. Les réponses HTML et API nécessaires à ces pannes sont simulées ; les fichiers JavaScript proviennent du véritable build Vite.

## Variantes des collections

`test_localizations.py` couvre les quinze types, l’identité unique, les faits et montants conservés, les conflits entre versions, les traductions périmées et les déplacements de lignes. Les parcours traversent les propositions IA structurées, leur absence d’écriture avant validation et leur application idempotente. Les recherches, métadonnées, réponses FR/EN, refus d’exposition de notes privées et priorités de langue sont vérifiés sur de vraies bases temporaires.

`collection-languages.spec.ts` utilise le serveur isolé 8768 : édition des versions, garde de saisie, offre après sauvegarde, traduction avec comparaison avant remplacement, affichage public et conservation de la recherche au changement de langue. Il contrôle le dialogue avant tout appel IA et les deux thèmes jusqu’à 320 pixels. Les textes du fournisseur simulé sont déterministes ; la qualité éditoriale de la traduction initiale fait l’objet d’une relecture séparée avant publication.
