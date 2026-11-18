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
| Impossible de joindre le fournisseur, 502 | Vérifier le réseau sortant avec les commandes ci-dessous avant de remplacer la clé |
| Clé absente, 409 | Enregistrer une clé dans Réglages du site → Fournisseur IA |
| Clé refusée, modèle refusé ou quota atteint, 502 | Vérifier fournisseur, modèle, droits, crédit et validité de la clé dans le compte fournisseur ; utiliser une clé de workspace pour Anthropic |
| Fournisseur trop lent, 504 | Réessayer plus tard ou choisir un modèle plus rapide ; le délai serveur est limité à 65 secondes |
| Réglages perdus après recréation | Vérifier le montage `admin_data:/app/data`, le projet Compose et le chemin de base ; ne pas créer une nouvelle base pour masquer le problème |
| SQLite en lecture seule ou permission refusée | Le volume doit être inscriptible par `10001:10001`, répertoire `0700`, base `0600` ; conserver la racine en lecture seule |

Le mot de passe oublié se récupère avec la [commande locale](operations.md#recuperer-le-compte-administrateur). Une clé fournisseur ne peut pas être relue depuis l'interface : le champ vide après enregistrement est normal. La conversation de l'onglet disparaît au rechargement ; les fiches, réglages et travaux enregistrés restent en base. Ouvrir **Travaux enregistrés** après reconnexion pour retrouver une demande suivie.

### Vérifier la connexion sortante

```bash
docker network inspect multisite_proxy --format '{{.Internal}}'
docker network inspect thibault-personal-site_egress --format '{{.Internal}}'
docker compose exec -T site python -c 'import httpx; r=httpx.get("https://api.openai.com/v1/models", timeout=15, trust_env=False, follow_redirects=False); print(r.status_code); assert r.status_code == 401'
```

Les résultats attendus sont `true`, `false`, puis `401` : la requête n’envoie aucune clé et vérifie uniquement DNS, réseau et TLS. `Temporary failure in name resolution` ou `Network is unreachable` avant une réponse HTTP indique un problème réseau, pas une clé refusée. Le service doit rejoindre les deux réseaux décrits dans l’[architecture](architecture.md), avec la passerelle prioritaire sur `egress`. Recréer le service depuis le Compose validé si ce rattachement manque ; ne pas modifier le réseau partagé, publier de port ou désactiver TLS pour contourner la panne.

Après rétablissement du réseau, vérifier le chat dans l’administration : une erreur d’authentification, de modèle ou de quota peut encore nécessiter une action dans le compte fournisseur. Ne jamais copier les clés dans les issues, les journaux ou les captures ; remplacer toute clé divulguée dans l’interface prévue.

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

## Assistant de contenus

| Symptôme | Contrôle et résolution |
| --- | --- |
| Questions au lieu d'une fiche | Préciser la cible, les faits manquants ou demander de conserver un brouillon incomplet. Aucun contenu n'est enregistré pendant la génération. |
| Modèle incompatible avec les outils | Vérifier l'accès au modèle et ses capacités d'outils structurés dans Fournisseur IA. OpenAI utilise Responses pour conserver les outils avec raisonnement ; ne pas forcer Chat Completions sur GPT-6. |
| Limite de budget ou délai | Une étape est bornée à 24 appels et 240 secondes. Consulter l'état et les questions du travail, apporter les précisions utiles puis reprendre après correction de la cause. Le volume total demandé n'impose pas de réduire le nombre de fiches ; les étapes suivantes ont leur propre budget. |
| Une génération est déjà en cours | Consulter Travaux enregistrés, ou utiliser Annuler la génération pour le tour direct concerné. Pause et arrêt attendent la confirmation serveur ; un redémarrage n'est pas le premier recours. |
| Proposition périmée, abandonnée ou expirée | Demander une nouvelle proposition. Le serveur refuse les écritures sur une version obsolète et ne permet aucun écrasement forcé. |
| Connexion perdue pendant l'enregistrement | Utiliser Vérifier l'enregistrement. Une application répétée de la même proposition est idempotente. Vérifier les fiches dans leurs éditeurs si la session a expiré. |
| Notes privées absentes | Activer explicitement leur inclusion pour la demande concernée. Les notes d'autorisation suivent la même règle. |
| Le contenu d'un fichier n'est pas compris | Fournir sa description/transcription dans le message. Seules les métadonnées du média sont transmises, pas le binaire. |
| Préférences modifiées dans un autre onglet | Recharger leur version enregistrée, puis reprendre les modifications souhaitées. |
| Ancienne image refusée après déploiement | Identifier les deux schémas et suivre le retour arrière avec l'image et la sauvegarde correspondantes. Pour les travaux durables, le [retour au schéma 4](operations.md#migration-des-travaux-durables-schema-4-vers-5) exige une restauration. |

### Travaux, interruption et reprise

| Symptôme | Contrôle et résolution |
| --- | --- |
| Le suivi n'apparaît plus après rechargement | Ouvrir Travaux enregistrés et parcourir ses pages. Le chat temporaire n'est pas le stockage du travail. Si la liste est vide, vérifier le volume et le compte avant de recréer la demande. |
| Réseau coupé pendant la préparation | Recharger l'état du même travail. Une coupure HTTP n'est pas une commande d'arrêt ; ne pas créer un second travail pour remplacer une exécution dont l'état n'a pas été vérifié. |
| Session expirée ou compte modifié | Se reconnecter, relire le travail, puis reprendre si nécessaire. Le travail persiste ; l'ancien cookie et son CSRF ne redeviennent pas valides. |
| Travail interrompu par redémarrage | Consulter son état reprenable puis utiliser Reprendre. Les étapes terminées et reçus sont persistés ; seules les étapes restantes doivent être exécutées. |
| Fournisseur, modèle ou clé changé | Le travail conserve l'empreinte de sa configuration d'origine ; les nouveaux appels sont suspendus et la reprise répond 409 tant qu'elle diffère. Rétablir les réglages initiaux seulement s'ils restent valides. Si l'ancienne clé a été compromise ou révoquée, conserver les reçus/fiches et arrêter ce travail. |
| Quota atteint ou fournisseur indisponible | Corriger le crédit, l'accès ou la connectivité, puis reprendre explicitement. Les lots terminés restent conservés ; une boucle automatique sans fin n'est pas une solution. |
| Fiches préparées mais pas enregistrées | Ouvrir les pages de lots, relire et enregistrer chaque proposition. La génération ne modifie jamais les collections à elle seule. |
| Toutes les fiches semblent créées mais le travail reste incomplet | Vérifier les lots d'associations et les questions : une dépendance future ou cyclique peut nécessiter une relecture supplémentaire. Ne pas marquer le travail terminé en ignorant un lien. |
| Conflit lors d'un lot | Une cible ou référence a changé depuis sa préparation. Le lot concerné n'est pas partiellement appliqué. Relire la fiche et apporter la correction au travail ; les lots déjà enregistrés restent conservés. |
| Pause ou arrêt encore en attente | Attendre la réponse serveur puis relire le même travail. L'interface ne doit pas annoncer un arrêt réussi uniquement parce que sa connexion a été interrompue. |
| Données privées encore présentes après effacement du chat | Le brief et les faits d'un travail ont leur propre conservation. Supprimer le suivi retire ces données techniques, sans supprimer les fiches enregistrées ; les anciennes sauvegardes privées gardent éventuellement une copie. |

Lors du diagnostic, consigner seulement identifiant de travail, état, compteurs, heure et catégorie d'erreur. Ne pas copier de brief, notes privées, clé ou réponse fournisseur brute dans les journaux, captures publiques ou issues. Les [contrats](backend.md#travaux-durables) et la [politique de conservation](operations.md#travaux-durables-et-conservation) décrivent les limites applicables.
