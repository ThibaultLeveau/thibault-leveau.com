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
   ├── /api/admin/*           authentification, contenus, médias, réglages et chat
   │      ├── SQLite          /app/data/admin.sqlite3 · volume admin_data
   │      ├── Médias privés    /app/data/media · même volume
   │      └── HTTPS sortant    OpenAI, Anthropic ou Mistral
   ├── /assets/                build/web/assets/
   ├── /fonts/                 build/web/fonts/
   ├── /api/health             réponse JSON
   └── /documentation/         build/documentation/
```

Le DNS de `new.thibault-leveau.com` pointe vers `168.231.82.6`. Le port 8000 du conteneur n'est pas publié sur l'hôte. Le visiteur accède uniquement au proxy sur les ports HTTP et HTTPS.

Le réseau partagé `multisite_proxy` est interne : il transporte les requêtes de Caddy mais ne permet pas les appels Internet. Le service rejoint aussi le bridge dédié `thibault-personal-site_egress`, créé par Compose, dont la passerelle est prioritaire pour les sorties DNS et HTTPS. Cette correction de routage a été explicitement autorisée par Thibault (« Oui j’autorise ») dans l'[issue #6](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/6). Le réseau partagé reste inchangé. Le bridge sortant n'est pas un filtrage par domaine : les destinations LLM fixes sont imposées par le code applicatif.

## Frontières de responsabilité

| Sous-système | Responsabilités | Ne prend pas en charge |
| --- | --- | --- |
| React | Accueil, administration, formulaires, conversation en mémoire, suivi des travaux et thème | Secrets persistants, authentification serveur, appel direct aux LLM |
| Vite / Tailwind | Compilation TypeScript, CSS et assets | Service HTTP de production |
| FastAPI | API, sessions, SQLite, chiffrement, exécution des travaux et appels LLM, fichiers et politiques HTTP | Construction à la volée du frontend |
| MkDocs Material | HTML documentaire, navigation, index de recherche | Processus permanent en production |
| Docker Compose | Image, paramètres, redémarrage et réseau applicatif | Gestion du DNS |
| Caddy | HTTPS, compression et reverse proxy | Logique métier |
| Hostinger DNS | Résolution du sous-domaine | Exécution de l'application |

L'évolution administrative a été explicitement approuvée par Thibault (« Je valide »), accord consigné dans l'[issue #3](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/3). Elle ajoute stockage, authentification, routes et appels LLM dans le service existant, sans nouveau framework ni service. Le périmètre est un seul administrateur et une seule instance Uvicorn.

SQLite contient le compte unique (mot de passe haché), les sessions révocables, les compteurs de limitation et le fournisseur sélectionné avec sa clé chiffrée, ainsi que les fiches typées et leurs relations. Les médias binaires vivent à côté de la base, dans `media/`. Leur accès administratif passe par les API privées ; les fichiers publiables ont une route publique qui recontrôle leur visibilité et leurs usages à chaque requête. Les migrations de contenu sont versionnées et transactionnelles ; les sauvegardes associent base et fichiers avec un manifeste. Le volume Compose `admin_data` survit aux recréations ; seul `/app/data` est durable et inscriptible, la racine du conteneur reste en lecture seule. La clé de chiffrement vient de l'environnement serveur et doit être sauvegardée séparément de la base.

La conversation courante reste en mémoire dans React. Pour un travail de création durable, SQLite conserve le brief, les faits nécessaires à la reprise et leur permission de lecture des notes privées, ainsi que les tâches, résultats et reçus ; il ne devient pas un historique général de conversation. Les raisonnements internes et les secrets fournisseur ne font pas partie de cet état. FastAPI transmet le contexte utile au fournisseur choisi, dont la politique de conservation s'applique. Aucun secret fournisseur ni cookie de session n'est placé dans `localStorage`.

## Langues des interfaces

Les [langues d’interface](languages.md) étendent la base existante avec `site_languages` (migration 3). Deux codes globaux règlent indépendamment le public et l’administration. Les écritures restent derrière session/origine/CSRF ; l’amorçage anonyme expose seulement le code de la zone demandée. FastAPI localise les métadonnées et messages par requête et injecte la langue dans le document ; React utilise i18next et react-i18next, sans nouveau service ni routeur. Cette évolution de persistance et de contrats a été explicitement validée par Thibault (« Je valide cette conception »), [accord de l’issue #18](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/18#issuecomment-6883886744). Les valeurs des collections et la langue de rédaction des agents restent indépendantes.

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
│   ├── admin/             stockage, sécurité, adaptateurs LLM, récupération locale
│   ├── api/content.py     contrats privés des contenus et médias
│   ├── api/public.py      lecture publique et médias autorisés
│   ├── content/public.py  projection publique, éligibilité et relations filtrées
│   ├── assistant/         agents, graphe, travaux durables, propositions et préférences
│   └── content/           modèles métier, migrations, transactions, fichiers et sauvegardes
└── tests/                 tests HTTP et démarrage
frontend/
├── public/                fichiers copiés tels quels
├── src/
│   ├── components/        navigation et sélecteur de thème
│   ├── pages/             composition de l'administration
│   ├── public/            site, collections, fiches, lecture et client public
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

L'application n'utilise pas de routeur client supplémentaire. FastAPI distribue explicitement `/`, `/projets`, `/parcours`, `/expertise`, `/services`, `/journal`, `/a-propos`, `/explorer`, leurs fiches et `/admin`. Les liens HTML gèrent navigation, historique et rechargement ; les filtres sont des paramètres d'URL. Le serveur vérifie la visibilité avant de servir une fiche et redirige un ancien slug vers son URL actuelle. Les vues internes du studio restent un état local. Un chemin inconnu, y compris `/admin/inconnu`, renvoie 404.

## Ajouter une fonctionnalité

### Assistant de contenus — issue #12

Thibault a explicitement approuvé la [conception des agents](assistant-design.md) (« J'accepte »), [accord consigné avant implémentation](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/12#issuecomment-6880648679). LangChain et LangGraph s'exécutent dans FastAPI. Le domaine `assistant/` sépare contrats, modèles, outils de lecture, orchestration, propositions et préférences. `content/` reste responsable des validations et écritures métier. Les sous-agents préparent des données structurées ; seule l'application explicite d'une proposition autorise une transaction métier.

Les préférences et propositions temporaires sont conservées dans la même base SQLite, avec migrations et sauvegardes existantes. Les API sont privées sous `/api/admin/assistant/*`, avec session et CSRF. React présente les questions, les différences et les réglages dans `/admin`. Le fournisseur reçoit le contexte utile à la demande ; la conversation reste en mémoire dans l'onglet. L'issue #22 étend ensuite ce fonctionnement avec les travaux durables décrits ci-dessous. Aucun nouveau service, routeur, réseau ou mécanisme d'authentification n'est ajouté.

Une future route API doit être définie dans `api/`, enregistrée dans la fabrique et documentée avec son contrat HTTP. Une nouvelle page nécessite de décider explicitement son routage côté serveur et côté navigateur ; ne pas ajouter un repli global vers `index.html` pour contourner cette décision.

Toute extension au-delà de ce périmètre (plusieurs comptes, service supplémentaire, nouveau stockage ou routage) exige un nouvel accord d'architecture explicite selon `AGENTS.md`. Les raisons des choix actuels sont consignées dans les [décisions techniques](decisions.md).

L'architecture du [studio de contenus](content-studio.md#architecture-proposee-et-impacts) a été explicitement approuvée par Thibault le 14 novembre 2026 (« Ok » en réponse à la demande de validation), accord consigné dans l'[issue #8](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/8#issuecomment-6878880881). Elle étend SQLite avec des tables métier et des migrations versionnées, ajoute les API privées de contenus et de médias et conserve les fichiers dans `/app/data/media`, dans le volume existant. Les sauvegardes couvrent ensemble base et médias. L'implémentation est suivie dans la PR #9 ; aucun nouveau framework, service ou routeur de pages n'est ajouté.

## Présentation publique des collections — issue #14

L'[accord explicite](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/14#issuecomment-6881977535) étend les routes et l'accès aux données selon la [conception publique](public-site-design.md). `content/public.py` possède la sélection et les projections ; `api/public.py` valide les entrées et distribue les réponses/fichiers. La liste utilise des résumés SQL paginés ; les corps longs sont chargés sur les fiches. Chaque accès média recontrôle la visibilité avant le cache de miniatures. Les dérivés sont éphémères en mémoire, sans migration ni modification du volume. Quand le studio est désactivé, les pages restent disponibles avec des collections vides, sans créer de stockage.

## Variantes éditoriales FR/EN

L’[accord explicite de l’issue #20](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/20#issuecomment-6917635569) autorise la migration 3 → 4 et les routes publiques `/fr` et `/en`. Deux tables SQLite normalisées conservent les états et textes de variantes ; les fiches, relations et fichiers restent uniques. Le registre fermé et les empreintes de lignes appartiennent à `content/localization.py`, les écritures versionnées au domaine existant, et les projections autorisées à `content/public.py`.

Les routes FastAPI restent explicites, avec liens natifs React et sans bibliothèque de routage supplémentaire. Le code de l’URL prime sur le choix du visiteur puis sur le défaut du site. L’administration conserve sa propre langue. La recherche SQL utilise les résumés localisés et les catalogues d’interface sont chargés à la demande.

`assistant/translation.py` prépare une traduction structurée sans outils de contexte, limitée aux textes autorisés. Il réutilise les adaptateurs, budgets, propositions, validations transactionnelles et protections existants. La publication ne déclenche jamais de génération. Les [langues](languages.md) détaillent les contrats, les états et le comportement des traductions périmées.

## Grandes demandes et travaux durables — issue #22

Thibault a répondu « Je suis d'accord » à la proposition de traitement par lots et de reprise, [accord explicite consigné avant implémentation](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/22#issuecomment-6991171778). Il autorise l'extension de SQLite, les API privées de suivi, la conservation du brief et des faits utiles ainsi que l'exécution indépendante de la connexion HTTP.

La migration `005.sql` passe le schéma de 4 à 5. Les travaux, apports de faits, tâches, sections, dépendances et lots vivent dans la base existante. Le responsable d'exécution appartient au cycle de vie de l'unique processus FastAPI. Il enregistre les transitions et reprend les étapes restantes depuis SQLite ; une requête HTTP sert à créer, consulter ou commander le travail. Le rechargement de la page n'est donc plus une annulation implicite du travail.

Le passage du tour direct au travail durable tient compte des appels déjà dépensés et réserve la borne complète de chaque spécialiste, recherches et réparations structurées incluses. Il intervient avant leur lancement et transmet le plan existant, même si la demande tient sur une page de douze tâches.

Le coordinateur planifie progressivement, puis distribue les fiches et sections aux spécialistes en vagues limitées à trois appels simultanés. Les budgets bornent chaque étape, sans imposer de nombre maximal de fiches ou de lots pour l'ensemble du travail. Listes, lectures de lots et contexte fournisseur restent bornés ; les faits supplémentaires s'ajoutent par segments. Le traitement conserve les règles des quinze collections, le profil unique, les variantes FR/EN et les permissions sur les notes privées.

Chaque lot reste une proposition : seule l'action explicite d'enregistrement déclenche les écritures de `content/`, atomiques et idempotentes pour ce lot. Le travail peut être partiellement enregistré, état visible dans le suivi. Les tâches conservent leurs identités et leur correspondance vers les fiches déjà enregistrées. Les références entre lots et leurs éventuels cycles restent des dépendances à résoudre avant de déclarer le travail terminé.

Les travaux sont accessibles à l'administrateur unique après reconnexion, sans réactiver les anciennes sessions. Leur suppression explicite retire les données techniques de reprise et les reçus, sans supprimer les fiches déjà enregistrées. Ils ne subissent pas la purge des propositions temporaires de conversation. Sauvegardes, permissions du volume et politique de conservation couvrent donc aussi ces données privées. Voir le [contrat backend](backend.md#travaux-durables), l'[exploitation](operations.md#travaux-durables-et-conservation) et la [migration 4 vers 5](operations.md#migration-des-travaux-durables-schema-4-vers-5).

Le service reste unique, sans file externe ni nouveau processus permanent. Plusieurs instances, comptes ou un changement de stockage demanderaient une nouvelle décision d'architecture. Les quotas fournisseur, les crédits et le stockage disponible restent des contraintes réelles.
