# Backend et contrat HTTP

## Fabrique d'application

Le point d'entrée est `personal_site.main:create_app`. Uvicorn appelle cette fabrique avec `--factory` ; les tests peuvent lui transmettre une instance `Settings` afin d'isoler leur configuration.

La fabrique installe les politiques HTTP, enregistre le routeur de santé, puis monte les fichiers construits. L'ordre est important : le montage statique de `/` arrive après les routes d'API et de documentation pour ne pas les masquer.

```bash
uv run uvicorn personal_site.main:create_app --factory --host 127.0.0.1 --port 8000
```

## Routes publiques

| Requête | Réponse attendue | Remarque |
| --- | --- | --- |
| `GET /` | `200`, HTML de l'accueil | React est ensuite exécuté par le navigateur |
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

`/docs`, `/redoc` et `/openapi.json` sont désactivés. Cette page constitue le contrat lisible de l'API initiale.

### Santé du processus

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/api/health
```

```json
{"status":"ok"}
```

La route confirme que l'application répond. Elle ne fait pas d'appel externe et ne vérifie ni le DNS ni Caddy. En production, la présence des deux fichiers `index.html` est contrôlée avant que l'application puisse démarrer ; cette vérification ne remplace pas les tests de distribution de chaque ressource.

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

La reconnaissance des assets immuables est limitée au chemin `assets/` et aux noms construits avec une empreinte. Les fichiers publics non renommés ne doivent pas recevoir ce cache long. `no-cache` autorise le stockage mais demande une revalidation ; ce n'est pas équivalent à `no-store`.

## En-têtes communs

Le middleware ajoute `X-Content-Type-Options: nosniff` et `Referrer-Policy: strict-origin-when-cross-origin`. Tant que `SITE_INDEXABLE=false`, il ajoute également `X-Robots-Tag: noindex, nofollow`. Les tests vérifient la présence de cette politique sur la documentation, l'API et les 404.

Caddy gère HTTPS en amont. Uvicorn accepte les en-têtes de proxy uniquement depuis le réseau configuré dans Compose avec `FORWARDED_ALLOW_IPS`. Si le sous-réseau Docker change, contrôler cette valeur pour conserver les URL et redirections correctes sans élargir inutilement la confiance.

## Ajouter une route

Créer un routeur sous `api/`, l'enregistrer dans `create_app()`, définir une réponse JSON stable et ajouter un test HTTP du résultat et de ses erreurs. Les appels du frontend doivent utiliser le préfixe `/api`. Mettre à jour cette page dans la même modification que le contrat.

Conserver les tests indépendants des variables de la machine en construisant `Settings` explicitement. La fixture d'intégration utilise les véritables sorties de construction pour détecter un problème de chemin, de montage ou de cache que des fichiers fictifs pourraient masquer.
