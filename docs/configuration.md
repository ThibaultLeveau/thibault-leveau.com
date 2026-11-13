# Configuration

## Paramètres applicatifs

`personal_site.config` utilise Pydantic Settings. Les variables sont préfixées par `SITE_` pour éviter les collisions avec les autres services du serveur. Une valeur invalide provoque une erreur explicite au chargement de la configuration.

| Variable | Type / valeurs | Défaut | Usage |
| --- | --- | --- | --- |
| `SITE_ENVIRONMENT` | `development` ou `production` | `development` | Active la vérification stricte des sorties construites au démarrage en production |
| `SITE_STATIC_DIR` | Chemin absolu | `build/` à la racine du dépôt en installation éditable | Répertoire parent de `web/` et `documentation/` |
| `SITE_INDEXABLE` | Booléen, par exemple `true` / `false` | `false` | Contrôle l'en-tête d'indexation sur les réponses |
| `SITE_LOG_LEVEL` | `debug`, `info`, `warning`, `error`, `critical` | `info` | Niveau des journaux applicatifs et Uvicorn (processus et accès) |

Dans le conteneur, `SITE_STATIC_DIR` vaut `/app/build`. Il désigne le **parent** des deux sites construits, pas directement `/app/build/web`.

```text
/app/build/
├── web/
│   ├── index.html
│   └── assets/
└── documentation/
    ├── index.html
    └── search/search_index.json
```

## Configuration locale

`.env.example` est la référence des valeurs usuelles. Une copie `.env` peut contenir les adaptations de la machine et reste ignorée par Git. Une variable présente dans l'environnement du processus prend priorité sur la valeur du fichier.

```bash
cp .env.example .env
```

Exemple d'exécution sans fichier supplémentaire :

```bash
SITE_ENVIRONMENT=production SITE_STATIC_DIR="$PWD/build" uv run uvicorn personal_site.main:create_app --factory --host 127.0.0.1 --port 8000
```

`SITE_STATIC_DIR` doit être absolu ; `$PWD/build` convient lorsque la commande est lancée à la racine du dépôt. Le contrôle en production refuse un démarrage dont l'accueil ou la documentation construits sont absents. Il évite qu'un service apparaisse sain alors qu'il ne peut pas distribuer le site.

## Indexation

Par défaut, chaque réponse porte :

```http
X-Robots-Tag: noindex, nofollow
```

La règle concerne l'accueil, la documentation, l'API et les erreurs. Le site reste accessible sans authentification. Changer `SITE_INDEXABLE` impose un redémarrage du processus ; ce paramètre ne déclenche pas à lui seul l'indexation par les moteurs et ne garantit pas la disparition immédiate de résultats déjà indexés.

## Paramètres d'outillage

| Paramètre | Emplacement | Valeur / rôle |
| --- | --- | --- |
| Version Python | `.python-version`, `pyproject.toml` | Python 3.13 |
| Version Node.js | `.node-version`, Dockerfile, CI | Node.js 24 |
| URL canonique documentaire | `mkdocs.yml`, `site_url` | `https://new.thibault-leveau.com/documentation/` |
| Sortie Vite | `frontend/vite.config.ts` | `build/web/` à la racine |
| Sortie MkDocs | `mkdocs.yml`, `site_dir` | `build/documentation/` |
| `IMAGE_TAG` | Environnement de Docker Compose | `local` par défaut ; commit Git en production |
| `API_PORT` | Environnement de `make dev` et de Vite | `8000` par défaut ; port backend local et cible du proxy Vite |
| `PLAYWRIGHT_BASE_URL` | Environnement des tests navigateur | Cible externe facultative ; sinon serveur local sur 8765 |

`IMAGE_TAG` choisit l'image `local/thibault-personal-site:<tag>`. Il ne change pas le code contenu dans une image déjà construite. Définir le tag lors de la construction et du démarrage avec la même valeur.

La configuration Compose définit les paramètres du conteneur ; exporter une variable dans le shell ne la transmet pas automatiquement si le fichier Compose ne la référence pas. Inspecter le résultat avec `docker compose config` avant de déployer une modification de configuration.

## Ports et réseau

| Port | Contexte | Exposition prévue |
| --- | --- | --- |
| 5173 | Vite local | Boucle locale |
| 8000 | FastAPI local ou conteneur | Boucle locale en développement ; réseau Docker en production |
| 8001 | MkDocs local | Boucle locale |
| 8765 | Serveur Playwright local | Boucle locale pendant les tests |
| 80 / 443 | Caddy | Accès public HTTP / HTTPS |

Le nom DNS Docker `thibault-personal-site` est utilisable uniquement sur `multisite_proxy`. Il ne correspond pas à un enregistrement public Hostinger.

## Secrets et changements

La version initiale ne nécessite aucune clé API ou mot de passe. Ne pas ajouter de secret à `frontend/public/`, aux variables injectées par Vite ou aux pages MkDocs : ces fichiers sont distribués aux visiteurs. Une future intégration privée devra rester dans la configuration serveur.

Toute nouvelle variable doit être ajoutée au modèle de configuration, à `.env.example`, à cette page et aux tests de validation. Une nouvelle valeur de production doit aussi être intégrée explicitement à Compose.
