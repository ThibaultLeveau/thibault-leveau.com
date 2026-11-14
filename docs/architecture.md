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
   ├── /admin                 même HTML, interface React chargée à la demande
   ├── /api/admin/*           authentification, réglages et chat
   │      ├── SQLite          /app/data/admin.sqlite3 · volume admin_data
   │      └── HTTPS sortant    OpenAI, Anthropic ou Mistral
   ├── /assets/                build/web/assets/
   ├── /fonts/                 build/web/fonts/
   ├── /api/health             réponse JSON
   └── /documentation/         build/documentation/
```

Le DNS de `new.thibault-leveau.com` pointe vers `168.231.82.6`. Le port 8000 du conteneur n'est pas publié sur l'hôte. Le visiteur accède uniquement au proxy sur les ports HTTP et HTTPS.

## Frontières de responsabilité

| Sous-système | Responsabilités | Ne prend pas en charge |
| --- | --- | --- |
| React | Accueil, administration, formulaires, conversation en mémoire et thème | Secrets persistants, authentification serveur, appel direct aux LLM |
| Vite / Tailwind | Compilation TypeScript, CSS et assets | Service HTTP de production |
| FastAPI | API, sessions, SQLite, chiffrement, appels LLM, fichiers et politiques HTTP | Construction à la volée du frontend |
| MkDocs Material | HTML documentaire, navigation, index de recherche | Processus permanent en production |
| Docker Compose | Image, paramètres, redémarrage et réseau applicatif | Gestion du DNS |
| Caddy | HTTPS, compression et reverse proxy | Logique métier |
| Hostinger DNS | Résolution du sous-domaine | Exécution de l'application |

L'évolution administrative a été explicitement approuvée par Thibault (« Je valide »), accord consigné dans l'[issue #3](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/3). Elle ajoute stockage, authentification, routes et appels LLM dans le service existant, sans nouveau framework ni service. Le périmètre est un seul administrateur et une seule instance Uvicorn.

SQLite contient le compte unique (mot de passe haché), les sessions révocables, les compteurs de limitation et le fournisseur sélectionné avec sa clé chiffrée. Le volume Compose `admin_data` survit aux recréations ; seul `/app/data` est durable et inscriptible, la racine du conteneur reste en lecture seule. La clé de chiffrement vient de l'environnement serveur et doit être sauvegardée séparément de la base.

Les messages ne sont pas enregistrés en base. React les garde en mémoire et transmet l'historique nécessaire au backend à chaque envoi ; FastAPI l'envoie au fournisseur choisi. La politique de conservation de ce fournisseur s'applique. Aucun secret fournisseur ni cookie de session n'est placé dans `localStorage` ; seule la préférence de thème y est conservée.

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
│   ├── api/health.py      contrat de santé
│   ├── api/admin.py       authentification, validation et contrats privés
│   └── admin/             stockage, sécurité, adaptateurs LLM, récupération locale
└── tests/                 tests HTTP et démarrage
frontend/
├── public/                fichiers copiés tels quels
├── src/
│   ├── components/        navigation et sélecteur de thème
│   ├── pages/             accueil et composition de l'administration
│   ├── admin/             client API, connexion, formulaires et chat
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

L'application n'utilise pas de routeur client supplémentaire : `/` et `/admin` sont explicitement distribués par FastAPI, `/admin/` redirige vers `/admin`. React choisit la page depuis ce chemin ; les vues de réglages sont un état local, sans URL supplémentaire. Un chemin inconnu, y compris `/admin/inconnu`, renvoie 404.

## Ajouter une fonctionnalité

Une future route API doit être définie dans `api/`, enregistrée dans la fabrique et documentée avec son contrat HTTP. Une nouvelle page nécessite de décider explicitement son routage côté serveur et côté navigateur ; ne pas ajouter un repli global vers `index.html` pour contourner cette décision.

Toute extension au-delà de ce périmètre (plusieurs comptes, service supplémentaire, nouveau stockage ou routage) exige un nouvel accord d'architecture explicite selon `AGENTS.md`. Les raisons des choix actuels sont consignées dans les [décisions techniques](decisions.md).
