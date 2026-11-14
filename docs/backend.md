# Backend et contrat HTTP

## Fabrique d'application

Le point d'entrée est `personal_site.main:create_app`. Uvicorn appelle cette fabrique avec `--factory` ; les tests peuvent lui transmettre une instance `Settings` afin d'isoler leur configuration.

La fabrique valide la configuration, ouvre le stockage si l'administration est activée, installe les politiques HTTP, enregistre les routeurs de santé et d'administration, puis monte les fichiers construits. Le montage statique de `/` arrive après les routes explicites pour ne pas les masquer.

```bash
uv run uvicorn personal_site.main:create_app --factory --host 127.0.0.1 --port 8000
```

## Routes publiques

| Requête | Réponse attendue | Remarque |
| --- | --- | --- |
| `GET /` | `200`, HTML de l'accueil | React est ensuite exécuté par le navigateur |
| `GET /admin` | `200`, HTML administratif | Écran de connexion ; aucune donnée privée dans l'HTML |
| `GET /admin/` | `308` vers `/admin` | Route canonique explicite |
| `GET /assets/<fichier>` | `200` si le fichier existe | CSS et JavaScript produits par Vite |
| `GET /fonts/inter-variable.woff2` | `200`, police locale | Pas de requête Google Fonts |
| `GET /favicon.svg` | `200`, SVG | Identité du site |
| `GET /theme-init.js` | `200`, JavaScript | Initialisation du thème avant React |
| `GET /api/health` | `200`, `{"status":"ok"}` | Santé du processus |
| `GET /documentation` | `308` vers `/documentation/` | URL canonique du répertoire |
| `GET /documentation/` | `200`, HTML MkDocs | Racine de la documentation |
| `GET /documentation/architecture/` | `200`, HTML MkDocs | Exemple de page imbriquée |
| `GET /documentation/search/search_index.json` | `200`, JSON | Index utilisé par la recherche du navigateur |
| Chemin absent | `404` | Aucun repli sur l'accueil |

`/docs`, `/redoc` et `/openapi.json` sont désactivés. Cette page constitue le contrat lisible de l'API.

### Santé du processus

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/api/health
```

```json
{"status":"ok"}
```

La route confirme que l'application répond. Elle ne fait pas d'appel externe et ne vérifie ni le DNS ni Caddy. En production, la présence des deux fichiers `index.html` est contrôlée avant que l'application puisse démarrer ; cette vérification ne remplace pas les tests de distribution de chaque ressource.

## API administrative

Toutes les routes sont sous `/api/admin`. Administration désactivée : 503. La connexion exige l'en-tête `Origin` égal à `SITE_ADMIN_ORIGIN`. Les autres routes exigent un cookie valide ; toute mutation exige aussi cette origine et `X-CSRF-Token` reçu lors de la connexion ou de la lecture de session. Aucune politique CORS ouverte n'est configurée.

| Méthode et route | Corps JSON / entrée | Résultat |
| --- | --- | --- |
| `POST /login` | `username`, `password` | 200 : `username`, `csrf_token` ; définit le cookie |
| `GET /session` | Cookie | 200 : `username`, `csrf_token` |
| `POST /logout` | Cookie, origine et CSRF | 204 ; révoque la session et supprime le cookie |
| `PUT /account` | `username`, `current_password`, `new_password` facultatif | 204 ; met à jour le compte et révoque toutes les sessions |
| `GET /provider` | Cookie | 200 : `provider`, `model`, `has_api_key`, catalogue `providers` |
| `PUT /provider` | `provider`, `model`, `api_key` facultative, `clear_api_key` booléen facultatif | 200 : même représentation publique |
| `POST /chat` | `messages`: liste de `{role, content}` | 200 : `message` assistant, `provider` et `model` utilisés |

`provider` appartient à `openai`, `anthropic`, `mistral`. Le modèle est un identifiant de 1 à 128 caractères, commençant par un caractère alphanumérique puis composé de lettres ASCII, chiffres, `.`, `_`, `:`, `/` ou `-`. La clé contient de 1 à 512 caractères ASCII imprimables sans espace. L'omettre conserve la clé actuelle ; `clear_api_key=true` la retire. Fournir simultanément une clé et sa suppression est invalide. Le changement de fournisseur demande une nouvelle clé ou un retrait explicite.

Un nom d'administrateur comporte 3 à 64 lettres ASCII, chiffres, points, tirets ou tirets bas. Le nouveau mot de passe comporte 12 à 128 caractères. Le mot de passe actuel reste obligatoire, même pour renommer le compte ; une demande sans modification répond 400. La création d'une session vérifie à nouveau les identifiants en transaction afin de ne pas accepter une authentification concurrente à leur révocation.

L'historique du chat alterne `user` et `assistant`, commence et termine par `user`, contient au plus 40 messages et 40 000 caractères. Un message utilisateur non vide contient au plus 4 000 caractères, une réponse au plus 20 000. Les corps administratifs sont limités à 256 Kio avant décodage JSON, y compris les transferts sans `Content-Length`. Les champs inconnus sont refusés.

| Statut | Sens |
| --- | --- |
| 400 | Mot de passe actuel incorrect, demande sans changement ou clé manquante lors d'un changement de fournisseur |
| 401 | Identifiants incorrects, session absente, expirée ou révoquée |
| 403 | Origine ou jeton CSRF refusé |
| 409 | Clé LLM non configurée ou modification concurrente du compte |
| 413 / 422 | Corps trop volumineux / format invalide ; aucun champ secret n'est renvoyé |
| 429 | Limite locale ou réponse déjà en cours ; `Retry-After` accompagne les limites temporelles |
| 502 / 504 | Échec fournisseur / délai dépassé, avec message nettoyé |
| 503 | Administration non activée |

Les tentatives d'identifiants sont limitées à 5 par adresse et 30 globalement sur 15 minutes ; le chat à 10 par minute. Les compteurs SQLite survivent au redémarrage. Une seule réponse LLM peut être en cours dans l'instance. Les identifiants et les clés ne sont jamais journalisés par le code applicatif ; ne pas activer une capture des corps HTTP dans le proxy ou l'outillage de production.

## Stockage et appels externes

`admin/store.py` gère les transactions SQLite et `admin/security.py` le hachage, les jetons et la limite de corps. `admin/llm.py` adapte les messages aux API natives : [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create) et [Mistral Chat](https://docs.mistral.ai/api/endpoint/chat).

Les URL HTTPS sont fixes ; le client n'accepte pas de redirection et ignore les variables de proxy. Le délai total est de 65 secondes (connexion 10 s, opérations réseau 60 s), la réponse HTTP de 2 Mio maximum, le budget de sortie demandé de 4 096 tokens. OpenAI reçoit `max_completion_tokens` et `store=false`, les deux autres `max_tokens` ; Anthropic reçoit aussi `anthropic-version: 2026-10-21` avec authentification Bearer. Les réponses brutes et erreurs du fournisseur ne sont pas retournées au navigateur.

## Distribution statique

`delivery.py` utilise `StaticFiles` en mode HTML pour servir les répertoires construits. Ce mode permet de résoudre les index des pages documentaires. Un fichier inexistant reste une erreur 404, y compris sous `/assets/` ou `/documentation/`.

Les sorties attendues sont `SITE_STATIC_DIR/web/index.html` et `SITE_STATIC_DIR/documentation/index.html`. En production, leur absence lève une erreur de démarrage indiquant les chemins manquants. En développement, l'API peut fonctionner sans ces sorties ; les montages ne sont ajoutés que si les répertoires sont présents lors de la création de l'application.

Ne pas créer de route `/{path:path}` qui retourne systématiquement `index.html` : elle casserait le contrat d'erreur, notamment pour les ressources JavaScript et CSS.

## Cache

| Ressource | `Cache-Control` | Intention |
| --- | --- | --- |
| Assets Vite avec empreinte dans leur nom | `public, max-age=31536000, immutable` | Réutilisation longue d'une version dont le nom change avec le contenu |
| HTML, police, icône, script initial et documentation | `no-cache` | Revalidation avant réutilisation |
| API et réponses en erreur | `no-store` | Ne pas conserver les résultats |
| HTML `/admin` et redirection `/admin/` | `no-store` | Ne pas conserver la page administrative |

La reconnaissance des assets immuables est limitée au chemin `assets/` et aux noms construits avec une empreinte. Les fichiers publics non renommés ne doivent pas recevoir ce cache long. `no-cache` autorise le stockage mais demande une revalidation ; ce n'est pas équivalent à `no-store`.

## En-têtes communs

Le middleware ajoute `X-Content-Type-Options: nosniff` et `Referrer-Policy: strict-origin-when-cross-origin`. Tant que `SITE_INDEXABLE=false`, il ajoute également `X-Robots-Tag: noindex, nofollow`. Les tests vérifient la présence de cette politique sur la documentation, l'API et les 404.

Pour `/admin`, `/admin/` et `/api/admin/*`, `noindex, nofollow` est inconditionnel. Ces routes reçoivent `X-Frame-Options: DENY` et une CSP limitée à l'origine pour scripts, styles, connexions et polices, sans script inline ; les cadres et URL de base sont interdits. Le cookie `site_admin_session` est `HttpOnly`, `SameSite=Strict`, de chemin `/api/admin`, avec une durée absolue de 12 heures ; `Secure` est activé pour toute origine HTTPS.

Caddy gère HTTPS en amont. Uvicorn accepte les en-têtes de proxy uniquement depuis le réseau configuré dans Compose avec `FORWARDED_ALLOW_IPS`. Si le sous-réseau Docker change, contrôler cette valeur pour conserver les URL et redirections correctes sans élargir inutilement la confiance.

## Ajouter une route

Créer un routeur sous `api/`, l'enregistrer dans `create_app()`, définir une réponse JSON stable et ajouter un test HTTP du résultat et de ses erreurs. Les appels du frontend doivent utiliser le préfixe `/api`. Mettre à jour cette page dans la même modification que le contrat.

Conserver les tests indépendants des variables de la machine en construisant `Settings` explicitement. La fixture d'intégration utilise les véritables sorties de construction pour détecter un problème de chemin, de montage ou de cache que des fichiers fictifs pourraient masquer.
