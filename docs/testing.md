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

Ces tests utilisent le client HTTP de l'application : ils n'ouvrent pas de port public et ne vérifient pas le certificat TLS. Une construction manquante est une erreur de préparation du test, pas une raison de remplacer les artefacts par des fichiers factices.

## Tests navigateur

Deux projets Chromium couvrent un bureau de 1440 pixels et un viewport mobile. Un scénario spécifique vérifie une largeur de 320 pixels. Les parcours couvrent l'accueil, la police locale, l'absence de débordement, le clavier, les préférences système, la persistance du thème et un stockage navigateur indisponible.

Le test d'initialisation du thème bloque le JavaScript compilé de React. Le thème attendu doit malgré tout être appliqué par `theme-init.js`. La documentation est testée via une page imbriquée, ses liens et la recherche interactive.

Par défaut, Playwright démarre FastAPI en mode production sur `127.0.0.1:8765`. Construire les sorties avant une exécution isolée :

```bash
make build
make test-e2e
```

Pour viser un service déjà lancé, sans démarrer le serveur local :

```bash
PLAYWRIGHT_BASE_URL=https://new.thibault-leveau.com make test-e2e
```

Ces parcours ne modifient pas le serveur ; leurs changements de thème restent dans les contextes navigateur de test.

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
