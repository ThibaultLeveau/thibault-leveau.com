# Thibault Leveau

Site personnel : **FastAPI**, **React / TypeScript / Tailwind CSS** et **MkDocs Material**. Un accueil sobre et un studio privé pour les projets, le parcours, les services, les articles et les médias, avec chat LLM et gestion du compte, en thèmes clair et sombre.

- Site : [new.thibault-leveau.com](https://new.thibault-leveau.com)
- Documentation : [guide technique](https://new.thibault-leveau.com/documentation/)
- Administration : [/admin](https://new.thibault-leveau.com/admin), à activer selon le [guide d'administration](docs/administration.md)
- Sources : [ThibaultLeveau/thibault-leveau.com](https://github.com/ThibaultLeveau/thibault-leveau.com)

## Démarrer

Prérequis : Python **3.13**, Node.js **24**, npm, uv, Git et Make. Docker avec Compose est nécessaire pour exécuter l'image de production.

```bash
git clone https://github.com/ThibaultLeveau/thibault-leveau.com.git
cd thibault-leveau.com
make install
make dev
```

Si le port backend 8000 est déjà occupé, utiliser `API_PORT=8010 make dev`.

Le frontend est servi sur `http://127.0.0.1:5173`, l'API sur `http://127.0.0.1:8000/api/health`. Dans un autre terminal, `make docs` lance la documentation sur `http://127.0.0.1:8001/documentation/`.

## Commandes

| Commande | Résultat |
| --- | --- |
| `make install` | Installe les dépendances verrouillées Python et JavaScript |
| `make dev` | Lance Vite et FastAPI avec rechargement |
| `make docs` | Prévisualise la documentation |
| `make build` | Produit `build/web` et `build/documentation` |
| `make check` | Vérifie le code, construit et exécute les tests HTTP |
| `make test-e2e` | Vérifie le site construit dans Chromium avec Playwright |
| `./scripts/smoke-test.sh` | Contrôle les principales routes publiques du site déployé |

Avant le premier test navigateur, installer Chromium et ses dépendances système avec `cd frontend && npx playwright install --with-deps chromium`.

## Architecture

```text
Navigateur → Caddy (HTTPS) → FastAPI :8000
                              ├── /                  React compilé
                              ├── /admin             Administration React
                              ├── /api/admin/*       Sessions, contenus, médias, réglages et chat
                              ├── /assets/           CSS / JavaScript
                              ├── /api/health        JSON de santé
                              └── /documentation/    MkDocs compilé
```

Le conteneur final contient Python et les fichiers construits. Node.js, Vite et MkDocs servent à la construction, sans serveur frontend supplémentaire en production. L'administration activée conserve son compte, ses sessions, ses réglages et ses contenus dans SQLite sur le volume `admin_data`. FastAPI chiffre la clé API et contacte le fournisseur LLM ; les conversations restent en mémoire dans le navigateur.

```text
backend/src/personal_site/  Application et contrat HTTP
backend/tests/             Tests HTTP et configuration
frontend/                  Interface, thème et tests navigateur
docs/                      Documentation source en français
deploy/                    Configuration Caddy du domaine
scripts/                   Construction, contrôles et vérification publique
.github/workflows/         Intégration continue
```

## Configuration et production

Les paramètres applicatifs sont préfixés par `SITE_`. L'exemple `.env.example` et le [guide de configuration](docs/configuration.md) décrivent leur sens. L'indexation est désactivée par défaut pour toutes les réponses ; cela ne protège pas l'accès au site.

L'administration est désactivée par défaut. Définir son origine exacte, une clé de chiffrement et les identifiants d'initialisation avant de l'activer. Une fois créé, le compte se gère dans **Réglages du site → Admin user** ; changer les variables d'initialisation ne le réinitialise pas. Les clés LLM se renseignent dans **Réglages du site → AI provider** et ne sont jamais intégrées au frontend.

Le service Compose rejoint le réseau externe `multisite_proxy` sous l'alias `thibault-personal-site`, sans publier de port hôte. Un bridge dédié `egress` assure les sorties Internet nécessaires aux fournisseurs LLM ; Compose 2.33.1 ou ultérieur est requis. Caddy dessert `new.thibault-leveau.com` et gère HTTPS. Les images de production sont identifiées par le commit Git. Le déploiement est manuel ; la CI effectue les contrôles.

Consulter les procédures de [déploiement](docs/deployment.md), [retour arrière](docs/operations.md) et [dépannage](docs/troubleshooting.md) avant toute intervention sur le serveur.
