# Configuration

## Paramètres applicatifs

`personal_site.config` utilise Pydantic Settings. Les variables sont préfixées par `SITE_` pour éviter les collisions avec les autres services du serveur. Une valeur invalide provoque une erreur explicite au chargement de la configuration.

| Variable | Type / valeurs | Défaut | Usage |
| --- | --- | --- | --- |
| `SITE_ENVIRONMENT` | `development` ou `production` | `development` | Active la vérification stricte des sorties construites au démarrage en production |
| `SITE_STATIC_DIR` | Chemin absolu | `build/` à la racine du dépôt en installation éditable | Répertoire parent de `web/` et `documentation/` |
| `SITE_INDEXABLE` | Booléen, par exemple `true` / `false` | `false` | Contrôle l'en-tête d'indexation sur les réponses |
| `SITE_LOG_LEVEL` | `debug`, `info`, `warning`, `error`, `critical` | `info` | Niveau des journaux applicatifs et Uvicorn (processus et accès) |
| `SITE_ADMIN_ENABLED` | Booléen | `false` | Active le compte, le stockage et les API privées |
| `SITE_ADMIN_USERNAME` | 3–64 caractères `A-Z`, `a-z`, `0-9`, `_`, `.` ou `-` | `admin` | Nom utilisé uniquement lors de la création du compte |
| `SITE_ADMIN_PASSWORD` | Secret, 12–128 caractères | Vide | Requis pour une base neuve ; ignoré pour un compte existant et retirable après initialisation |
| `SITE_SECRET_KEY` | Clé Fernet valide | Vide | Requise quand l'administration est activée ; chiffre la clé LLM |
| `SITE_ADMIN_DB_PATH` | Chemin absolu | `data/admin.sqlite3` à la racine du dépôt | Base SQLite ; Compose impose `/app/data/admin.sqlite3` sur le volume `admin_data` |
| `SITE_MEDIA_QUOTA_BYTES` | Entier positif, au plus 1 Tio | `1073741824` (1 Gio) | Quota cumulé des fichiers de la médiathèque ; transmis explicitement par Compose |
| `SITE_ADMIN_ORIGIN` | Origine HTTPS exacte, sans chemin | `http://127.0.0.1:5173` en local | Origine autorisée pour les mutations ; HTTP permis seulement sur localhost, 127.0.0.1 ou ::1 |

Dans le conteneur, `SITE_STATIC_DIR` vaut `/app/build`. Il désigne le **parent** des deux sites construits, pas directement `/app/build/web`.

Le répertoire des médias est toujours `media/` à côté de la base : `/app/data/media` dans Compose. Il n'est pas servi par le montage statique. Le quota concerne les fichiers validés, y compris archivés ; un fichier temporaire supplémentaire peut occuper au plus 100 Mio pendant un téléversement. Réduire le quota ne supprime aucun fichier existant et bloque les ajouts tant que l'utilisation est trop élevée. Les limites unitaires restent 10 Mio pour une image, 20 Mio pour un PDF et 100 Mio pour une vidéo. Prévoir aussi l'espace de SQLite et des sauvegardes.

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

La règle concerne l'accueil, la documentation, l'API et les erreurs. Les pages publiques restent accessibles sans authentification. Changer `SITE_INDEXABLE` impose un redémarrage du processus ; ce paramètre ne déclenche pas à lui seul l'indexation par les moteurs. L'administration et ses API restent toujours `noindex, nofollow`, même lorsque le site devient indexable.

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

La configuration Compose définit les paramètres du conteneur ; exporter une variable dans le shell ne la transmet pas automatiquement si le fichier Compose ne la référence pas. Valider avec `docker compose config --quiet` : sans cette option, la sortie contient aussi les secrets résolus. Compose utilise l'origine `https://new.thibault-leveau.com` par défaut, mais une valeur locale dans `.env` la remplace ; adapter ce fichier avant activation en production.

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

Les identifiants d'initialisation et la clé Fernet restent dans l'environnement serveur ; le fichier `.env` doit avoir des permissions `0600`. La clé LLM est renseignée depuis l'interface et stockée chiffrée en base. Ne pas ajouter de secret à `frontend/public/`, aux variables injectées par Vite ou aux pages MkDocs : ces fichiers sont distribués aux visiteurs. Les personnes ayant accès au démon Docker peuvent lire l'environnement du conteneur.

Conserver `SITE_SECRET_KEY` entre les redémarrages. Une clé absente ou invalide empêche le démarrage activé ; une clé valide mais différente empêche le déchiffrement d'un fournisseur déjà enregistré. La désactivation laisse la base intacte. La [procédure d'administration](administration.md) explique l'initialisation, et l'[exploitation](operations.md) couvre récupération et sauvegarde.

Toute nouvelle variable doit être ajoutée au modèle de configuration, à `.env.example`, à cette page et aux tests de validation. Une nouvelle valeur de production doit aussi être intégrée explicitement à Compose.
