# Architecture

## Vue de production

Le dépôt assemble trois sources — Python, TypeScript et Markdown — en **un seul service applicatif**. Caddy, déjà utilisé par la plateforme, termine HTTPS et transmet les requêtes à FastAPI sur le réseau Docker interne.

```text
Visiteur
   │
   │ HTTPS · new.thibault-leveau.com
   ▼
Caddy · plateforme existante
   │
   │ réseau Docker multisite_proxy
   ▼
thibault-personal-site:8000 · FastAPI / Uvicorn
   ├── /                      build/web/index.html
   ├── /assets/                build/web/assets/
   ├── /fonts/                 build/web/fonts/
   ├── /api/health             réponse JSON
   └── /documentation/         build/documentation/
```

Le DNS de `new.thibault-leveau.com` pointe vers `168.231.82.6`. Le port 8000 du conteneur n'est pas publié sur l'hôte. Le visiteur accède uniquement au proxy sur les ports HTTP et HTTPS.

## Frontières de responsabilité

| Sous-système | Responsabilités | Ne prend pas en charge |
| --- | --- | --- |
| React | Composition de l'accueil et état du thème | Routage serveur, certificat TLS |
| Vite / Tailwind | Compilation TypeScript, CSS et assets | Service HTTP de production |
| FastAPI | API, fichiers statiques, erreurs HTTP, politique d'indexation et cache | Construction à la volée du frontend |
| MkDocs Material | HTML documentaire, navigation, index de recherche | Processus permanent en production |
| Docker Compose | Image, paramètres, redémarrage et réseau applicatif | Gestion du DNS |
| Caddy | HTTPS, compression et reverse proxy | Logique métier |
| Hostinger DNS | Résolution du sous-domaine | Exécution de l'application |

L'absence de base de données est intentionnelle. Le seul état propre à l'interface est la préférence de thème enregistrée dans le navigateur. Aucune migration de données ni sauvegarde de données métier n'est nécessaire pour cette version.

## Chaîne de construction

```text
frontend/src + public + package-lock.json
                    │ npm ci + compilation Vite
                    ▼
                 build/web
                    │
docs + mkdocs.yml    │
         │          │
         │ MkDocs   │
         ▼          │
build/documentation │
         │          │
         └────┬─────┘
              │ copie dans l'image finale
backend + uv.lock ──► image Python non privilégiée
```

Les outils de compilation sont présents dans des étapes distinctes du Dockerfile. L'image finale contient le backend, ses dépendances d'exécution et les deux sorties statiques. Elle ne dépend ni du poste de développement ni d'un répertoire `build/` préexistant sur l'hôte.

## Organisation des sources

```text
backend/
├── src/personal_site/
│   ├── main.py            fabrique et assemblage
│   ├── config.py          paramètres validés
│   ├── delivery.py        distribution et cache
│   └── api/health.py      contrat de santé
└── tests/                 tests HTTP et démarrage
frontend/
├── public/                fichiers copiés tels quels
├── src/
│   ├── components/        navigation et sélecteur de thème
│   ├── pages/             accueil
│   ├── theme/             état du thème React
│   └── styles/            police, couleurs et composition
└── tests/e2e/             parcours navigateur
docs/                      sources documentaires
deploy/                    bloc Caddy du sous-domaine
scripts/                   commandes reproductibles
```

Les paramètres Python, groupes de dépendances et outils de qualité sont centralisés dans `pyproject.toml`. `Makefile` expose les commandes usuelles ; les scripts permettent de les réutiliser dans la CI.

## Développement et production

En développement, Vite et FastAPI sont séparés pour conserver leur rechargement respectif. Le proxy de Vite traite `/api` ; MkDocs possède son propre serveur de prévisualisation. En production, les trois sorties partagent un seul domaine et un seul processus applicatif.

L'application n'utilise pas de routeur client : `/` est l'unique page du site. Un chemin inconnu renvoie une erreur 404. Cette règle évite de masquer une erreur de lien ou un asset manquant en retournant par erreur le document de l'accueil.

## Ajouter une fonctionnalité

Une future route API doit être définie dans `api/`, enregistrée dans la fabrique et documentée avec son contrat HTTP. Une nouvelle page nécessite de décider explicitement son routage côté serveur et côté navigateur ; ne pas ajouter un repli global vers `index.html` pour contourner cette décision.

L'ajout d'un formulaire, d'une base de données, d'une authentification ou de services externes modifie les contraintes d'exploitation. Ces évolutions demandent leurs propres paramètres, tests et procédures. Le socle n'en préinstalle aucune. Les raisons des choix actuels sont consignées dans les [décisions techniques](decisions.md).
