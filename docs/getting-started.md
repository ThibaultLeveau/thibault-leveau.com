# Installation et développement

## Prérequis

Utiliser Python **3.13** et Node.js **24**, versions déclarées dans `.python-version` et `.node-version`. Prévoir également Git, Make, npm et uv. Docker Engine avec le plugin Compose est nécessaire pour construire et exécuter l'image de production ; le développement courant utilise les processus locaux.

```bash
python3 --version
node --version
npm --version
uv --version
make --version
docker compose version
```

uv peut installer l'interpréteur Python compatible si aucun n'est présent. Les dépendances exactes sont définies par `uv.lock` et `frontend/package-lock.json` ; ne régénérer ces fichiers que lorsqu'une mise à jour est volontaire.

## Première installation

```bash
git clone https://github.com/ThibaultLeveau/thibault-leveau.com.git
cd thibault-leveau.com
make install
```

Le backend est installé en mode éditable dans `.venv/`. Modifier `backend/src/personal_site/` ne nécessite donc pas de réinstaller le paquet. npm installe le frontend depuis son fichier de verrouillage.

Les valeurs par défaut conviennent au développement. Pour une configuration locale, copier `.env.example` vers `.env`, puis adapter les valeurs selon le [guide de configuration](configuration.md). Ne pas versionner `.env`.

## Travailler sur l'accueil

```bash
make dev
```

| Service | Adresse | Fonction |
| --- | --- | --- |
| Vite | `http://127.0.0.1:5173` | Interface avec rechargement à chaud |
| FastAPI | `http://127.0.0.1:8000/api/health` | API avec rechargement Python |

Ouvrir le port **5173** pour développer l'interface. Vite transmet les requêtes commençant par `/api` au backend : les composants peuvent utiliser des URL relatives sans configurer CORS. Arrêter la commande avec `Ctrl+C` pour interrompre les deux processus.

Sur le serveur actuel, le port 8000 peut déjà être occupé par un autre projet. Utiliser `API_PORT=8010 make dev` pour choisir le port 8010 à la fois pour FastAPI et le proxy Vite, sans arrêter cet autre service.

Pour isoler les processus dans deux terminaux :

```bash
uv run uvicorn personal_site.main:create_app --factory --reload --host 127.0.0.1 --port 8000
```

```bash
npm --prefix frontend run dev -- --host 127.0.0.1
```

Le backend en développement peut démarrer avant la première construction. Il répond à `/api/health` même si les fichiers de l'accueil n'existent pas encore. Pour tester leur distribution par FastAPI, effectuer la construction ci-dessous.

## Travailler sur l'administration

Suivre la [première activation](administration.md#premiere-activation) pour initialiser un compte local et une clé de chiffrement. Avec `make dev`, utiliser `SITE_ADMIN_ORIGIN=http://127.0.0.1:5173` et ouvrir `/admin` sur le serveur Vite. SQLite utilise `data/admin.sqlite3`, exclu de Git. Ne pas partager une base ou une clé de production avec les tests : leurs fixtures créent leurs propres données temporaires et simulent les fournisseurs.

## Travailler sur la documentation

Dans un terminal indépendant :

```bash
make docs
```

Ouvrir **`http://127.0.0.1:8001/documentation/`**. Le préfixe `/documentation/` vient de `site_url` dans `mkdocs.yml` et reproduit le chemin de production. Les changements dans `docs/` sont rechargés automatiquement.

## Tester les fichiers de production

```bash
make build
SITE_ENVIRONMENT=production SITE_STATIC_DIR="$PWD/build" uv run uvicorn personal_site.main:create_app --factory --host 127.0.0.1 --port 8000
```

Ouvrir `http://127.0.0.1:8000` et `http://127.0.0.1:8000/documentation/`. FastAPI sert ici les mêmes sorties Vite et MkDocs que l'image Docker. Une modification du frontend ou des pages demande une nouvelle construction.

## Vérifier avant de contribuer

```bash
make check
cd frontend
npx playwright install --with-deps chromium
cd ..
make test-e2e
```

L'installation de Chromium est à faire une première fois, puis après une mise à jour de Playwright. Sous Linux, `--with-deps` peut nécessiter les droits d'administration pour installer les bibliothèques système. Le [guide des tests](testing.md) détaille les contrôles et les résultats attendus.

## Mettre à jour les dépendances

Pour une évolution Python, modifier `pyproject.toml`, exécuter `uv lock`, puis `make install`. Pour JavaScript, effectuer l'ajout ou la mise à jour depuis `frontend/` avec npm. Versionner le manifeste et son verrouillage ensemble, puis lancer les contrôles et reconstruire l'image Docker.

Une installation courante doit conserver les versions verrouillées. Éviter de mélanger npm, Yarn ou pnpm dans ce dépôt, ou de maintenir un second fichier de dépendances Python en parallèle de `pyproject.toml`.

Le manifeste npm contient un override ciblé `minimatch@>=7 <11.0.1` vers `11.0.1`, lié à [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Lors d’une mise à jour de l’outillage, vérifier si cet override reste nécessaire, puis relancer `npm --prefix frontend audit`, les contrôles et les tests avant de le retirer.
