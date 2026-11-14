# Dépannage

## Commencer par localiser la panne

```text
DNS résout-il vers le serveur ?
  └── HTTPS est-il valide ?
        └── Caddy atteint-il le conteneur ?
              └── FastAPI a-t-il démarré ?
                    └── Les fichiers construits sont-ils présents ?
                          └── Le navigateur charge-t-il les bonnes ressources ?
```

Exécuter `bash scripts/smoke-test.sh` et noter la première commande en échec. Conserver le statut HTTP, l'URL et l'heure avant de redémarrer un service : ces éléments permettent de vérifier ensuite que la correction répond au symptôme.

## Port de développement déjà occupé

Le port 8000 peut être utilisé par un autre projet du serveur. Ne pas arrêter un processus non identifié pour libérer ce port. Choisir un port distinct pour cette application :

```bash
API_PORT=8010 make dev
```

Le script de développement et Vite utilisent ensemble `API_PORT`. L'adresse de santé devient `http://127.0.0.1:8010/api/health`, tandis que l'accueil reste sur `http://127.0.0.1:5173`. Cette variable concerne le développement ; le port interne Docker reste 8000.

## « Artefacts manquants » au démarrage

L'application en production exige les index du frontend et de la documentation.

```bash
make build
ls -l build/web/index.html build/documentation/index.html
```

Vérifier ensuite que `SITE_STATIC_DIR` désigne le répertoire parent absolu `build/`, et non son sous-dossier `web/`. Dans Docker, les sorties sont construites par l'image ; un échec signifie qu'il faut examiner la construction ou la configuration plutôt que copier manuellement un fichier dans le conteneur.

## L'API répond mais l'accueil est introuvable

En développement, le backend peut démarrer sans fichiers statiques. Ouvrir le serveur Vite sur le port 5173 pour le développement frontend, ou exécuter `make build` puis redémarrer FastAPI pour tester la distribution de production.

Une URL arbitraire qui renvoie 404 est normale : seules les pages `/` et `/admin` sont définies hors documentation. Ne pas corriger ce comportement avec un repli global vers `index.html`.

## Caddy renvoie 502

```bash
docker compose ps
docker compose logs --tail=100 site
docker network inspect multisite_proxy
docker exec multisite-platform-caddy-1 wget -qO- http://thibault-personal-site:8000/api/health
```

Vérifier que le service tourne, que Caddy et l'application rejoignent le même réseau, et que le bloc proxy utilise l'alias `thibault-personal-site:8000`. Publier le port 8000 sur l'hôte ne résout pas une erreur de réseau interne et n'est pas nécessaire pour cette architecture.

## Le domaine ne résout pas ou charge un autre site

```bash
dig +short A new.thibault-leveau.com
dig +short AAAA new.thibault-leveau.com
dig +short CNAME new.thibault-leveau.com
```

L'enregistrement A doit indiquer `168.231.82.6`. Un AAAA ou CNAME inattendu peut expliquer un comportement différent selon le réseau du visiteur. Comparer les enregistrements avec la zone Hostinger et vérifier que le nom `new` est déclaré dans la zone de `thibault-leveau.com`.

Si le DNS est correct, vérifier l'import du bloc Caddy puis sa validation. Ne pas changer l'enregistrement racine, les MX ou les autres sous-domaines pour corriger cette route.

## Le certificat HTTPS n'est pas valide

Vérifier d'abord le DNS, l'accessibilité publique des ports 80 et 443 et les journaux du proxy :

```bash
docker logs --tail=150 multisite-platform-caddy-1
```

Une configuration syntaxiquement valide ne garantit pas qu'une autorité de certification puisse vérifier le domaine. Caddy doit recevoir les requêtes correspondant au nom. Ne pas rendre permanent un contournement de la vérification TLS dans les tests ou le navigateur.

## La documentation charge sans style ou la recherche échoue

Vérifier ces URL :

```bash
curl --fail --silent --show-error https://new.thibault-leveau.com/documentation/architecture/ >/dev/null
curl --fail --silent --show-error https://new.thibault-leveau.com/documentation/search/search_index.json >/dev/null
```

Contrôler `site_url` dans `mkdocs.yml` et conserver le suffixe `/documentation/`. Les pages et assets doivent provenir de la même construction. Les liens documentaires locaux doivent utiliser les fichiers Markdown, pas des chemins absolus qui repartent à la racine du site.

La recherche nécessite JavaScript. La construction stricte valide les liens sources, tandis que Playwright vérifie le chargement effectif de l'index et des résultats sous le préfixe public.

## Le thème ne persiste pas

Dans les outils du navigateur, inspecter la clé `personal-site-theme`. Les seules valeurs valides sont `light` et `dark`. Si le stockage est bloqué, le changement reste disponible pendant la page mais ne peut pas être mémorisé durablement.

Le thème de MkDocs est indépendant. Une préférence choisie dans la documentation ne doit pas être utilisée pour diagnostiquer celle de l'accueil. Si un flash apparaît avant React, vérifier la présence et l'ordre du script `/theme-init.js` dans le document HTML.

## Le navigateur affiche une ancienne version

Les assets Vite possèdent des noms dépendant de leur contenu ; l'HTML doit être revalidé. Vérifier d'abord l'image réellement exécutée, puis les en-têtes HTTP :

```bash
curl --silent --show-error --output /dev/null --dump-header - https://new.thibault-leveau.com/
```

L'accueil doit porter `Cache-Control: no-cache`. Une image reconstruite avec le même tag sans recréation du conteneur ne remplace pas automatiquement le processus en cours. Utiliser des tags de commit et la procédure de mise à jour documentée.

## Administration et fournisseurs LLM

| Symptôme | Vérification / correction |
| --- | --- |
| Message « administration non activée », API 503 | Configurer `SITE_ADMIN_ENABLED`, les identifiants initiaux, l'origine et la clé Fernet selon le [guide](administration.md), puis recréer le service |
| Démarrage refusé pour mot de passe initial absent | Une base neuve exige `SITE_ADMIN_PASSWORD` ; une base existante ne doit pas être remplacée par erreur |
| Démarrage refusé sur `SITE_SECRET_KEY` | Vérifier le format Fernet et retrouver la clé correspondant à la base ; voir la [récupération](operations.md#cle-de-chiffrement-perdue-ou-rotation) |
| Connexion 401 | Vérifier les identifiants actuels ; les variables d'initialisation ne remplacent pas le compte existant |
| Session 401 après modification du compte | Comportement attendu : toutes les sessions ont été révoquées ; se reconnecter |
| Origine refusée, 403 | L'adresse du navigateur doit correspondre exactement à `SITE_ADMIN_ORIGIN`, schéma et port compris, sans slash final ; ne pas conserver l'origine Vite en production |
| Jeton de formulaire refusé, 403 | Recharger la page puis se reconnecter si nécessaire ; ne pas désactiver CSRF |
| Trop de tentatives, 429 | Attendre le délai `Retry-After` : jusqu'à 15 minutes pour les identifiants, une minute pour le chat ; redémarrer ne remet pas les compteurs à zéro |
| Clé absente, 409 | Enregistrer une clé dans Réglages du site → AI provider |
| Clé refusée, modèle refusé ou quota atteint, 502 | Vérifier fournisseur, modèle, droits, crédit et validité de la clé dans le compte fournisseur ; utiliser une clé de workspace pour Anthropic |
| Fournisseur trop lent, 504 | Réessayer plus tard ou choisir un modèle plus rapide ; le délai serveur est limité à 65 secondes |
| Réglages perdus après recréation | Vérifier le montage `admin_data:/app/data`, le projet Compose et le chemin de base ; ne pas créer une nouvelle base pour masquer le problème |
| SQLite en lecture seule ou permission refusée | Le volume doit être inscriptible par `10001:10001`, répertoire `0700`, base `0600` ; conserver la racine en lecture seule |

Le mot de passe oublié se récupère avec la [commande locale](operations.md#recuperer-le-compte-administrateur). Une clé fournisseur ne peut pas être relue depuis l'interface : le champ vide après enregistrement est normal. Les conversations disparaissent au rechargement ; seuls le compte et les réglages sont durables.

## La construction stricte MkDocs échoue

Lire le premier avertissement : il indique généralement une page absente de la navigation, un fichier déplacé ou une ancre renommée. Corriger la source, conserver `--strict`, puis reconstruire. Désactiver la validation masquerait le problème pour les lecteurs suivants.

## Playwright ne démarre pas

```bash
cd frontend
npx playwright install --with-deps chromium
cd ..
make build
make test-e2e
```

Vérifier que le port 8765 est libre. Si une cible externe est volontairement utilisée, définir `PLAYWRIGHT_BASE_URL` ; sinon enlever cette variable pour retrouver le serveur local automatique. Consulter le rapport HTML et les traces en cas d'échec d'un parcours, sans augmenter arbitrairement tous les délais.
