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
| `GET /api/public/language?area=public\|admin` | `200`, un seul code `language` | Amorçage anonyme ; aucun réglage privé |
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
| `GET /languages` | Cookie | 200 : `public_language`, `admin_language`, `version` |
| `PUT /languages` | Deux codes `fr`/`en` et version entière positive | 200 : réglages et version incrémentée ; 409 si version périmée |
| `PUT /provider` | `provider`, `model`, `api_key` facultative, `clear_api_key` booléen facultatif | 200 : même représentation publique |
| `POST /chat` | `messages`: liste de `{role, content}` | 200 : `message` assistant, `provider` et `model` utilisés |

`provider` appartient à `openai`, `anthropic`, `mistral`. Le modèle est un identifiant de 1 à 128 caractères, commençant par un caractère alphanumérique puis composé de lettres ASCII, chiffres, `.`, `_`, `:`, `/` ou `-`. La clé contient de 1 à 512 caractères ASCII imprimables sans espace. L'omettre conserve la clé actuelle ; `clear_api_key=true` la retire. Fournir simultanément une clé et sa suppression est invalide. Le changement de fournisseur demande une nouvelle clé ou un retrait explicite.

Un nom d'administrateur comporte 3 à 64 lettres ASCII, chiffres, points, tirets ou tirets bas. Le nouveau mot de passe comporte 12 à 128 caractères. Le mot de passe actuel reste obligatoire, même pour renommer le compte ; une demande sans modification répond 400. La création d'une session vérifie à nouveau les identifiants en transaction afin de ne pas accepter une authentification concurrente à leur révocation.

L'ancienne route `/chat`, conservée pour compatibilité, n'alimente plus l'interface. Son historique alterne `user` et `assistant`, commence et termine par `user`, contient au plus 40 messages et 40 000 caractères. Un message utilisateur non vide contient au plus 4 000 caractères, une réponse au plus 20 000. Les corps administratifs sont limités à 256 Kio avant décodage JSON, y compris les transferts sans `Content-Length`. Les champs inconnus sont refusés.

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

## API de l'assistant de contenus

Le préfixe `/api/admin/assistant` réutilise session, origine, CSRF et limite de corps de 256 Kio. Aucun agent n'a accès aux routes d'application. Les outils `rechercher_fiches`, `lire_fiche` et `decrire_collection` sont en lecture seule ; les travaux ajoutent deux outils paginés, `lire_precisions` et `rechercher_taches`, également en lecture seule. Les champs libres et messages sont des données de contexte ; ils ne peuvent définir un rôle système ou un outil.

| Méthode et suffixe | Entrée et résultat |
| --- | --- |
| `POST /turn` | `{request_id: UUID, thread_id: UUID, language: "fr" ou "en", messages: [{role, content}], include_private_notes: false, media_ids: []}` ; 200 : `message`, `questions`, `proposal` ou null, `job` ou null, `provider`, `model`, `calls`, `delegations` |
| `POST /runs/{request_id}/cancel` | Attend l'annulation de la demande `/turn` ou `/jobs` de la même session et met en pause son éventuel travail transféré ; 200 `{cancelled: true}` même si la demande est déjà terminée |
| `GET /proposals/{id}` | Proposition opaque appartenant à la session, différences et reçu éventuel |
| `POST /proposals/{id}/apply` | `{revision: n}` ; revalidation et écriture atomique, retourne le reçu ; un appel répété retourne le même résultat |
| `POST /proposals/{id}/cancel` | `{revision: n}` ; abandon idempotent d'une proposition non appliquée |
| `GET /preferences` | `defaults`, `overrides`, `version` |
| `PUT /preferences` | Même structure, avec version lue ; 200 avec version incrémentée ou 409 en cas de conflit |

Les messages alternent `user`/`assistant`, commencent et terminent par `user`. Maximum : 40 messages, 80 000 caractères cumulés, 16 000 par demande et 20 000 par réponse d'historique. Les dix identifiants de médias maximum sont des entiers positifs relus côté serveur. Le serveur n'accepte ni messages `system`/`tool`, ni opérations arbitraires du navigateur. Les champs inconnus sont refusés.

Une question contient `question`, `reason`, `fields`. Une proposition expose `id`, `revision`, `state`, `expires` (timestamp UTC), `items`, `result`. Chaque item décrit collection, titre, identifiant existant éventuel, différences `{field,label,before,after}`, statuts, libellés des références, informations manquantes et erreurs de complétude. `related=true` désigne une association réciproque également modifiée par le lot. Les opérations internes et références locales `@key` restent côté serveur.

Les états sont `pending`, `superseded` (une précision a remplacé la proposition mais elle peut servir de base au tour suivant), `cancelled`, `applied`. Seul `pending` est applicable ; `applied` retourne son reçu sans réécriture. Un reçu contient les identifiants, titres, collections, versions et statuts réellement enregistrés. Une proposition du parcours direct expire après une heure ; après application son reçu reste valide jusqu'à 24 heures, sous la limite globale de 50 entrées ordinaires. La prochaine création purge les expirations et les entrées les plus anciennes. La révocation de session supprime ces propositions par clé étrangère. Les lots des travaux durables ont une conservation distincte, décrite ci-dessous.

Les opérations sont validées dans un savepoint annulé avant la relecture. L'application relit toutes les versions de cibles et références sous `BEGIN IMMEDIATE`, résout les nouvelles références dans la même transaction et réutilise `ContentStore.write`. Les associations réciproques sont consolidées sans confondre leurs incréments internes de version avec un conflit externe. Une contradiction, un doublon, un statut invalide ou une référence périmée annule l'ensemble.

En plus des statuts administratifs : 404 pour une proposition absente ou étrangère à la session, 410 pour une expiration, 409 pour proposition obsolète/annulée/appliquée lors d'un abandon, conflit de version ou génération annulée, 422 pour contrat ou budget dépassé, 429 pour fréquence ou génération concurrente, 502 pour refus/réponse fournisseur inutilisable, 504 pour délai total. La déconnexion HTTP annule la demande initiale encore ouverte (499 si une réponse peut encore être rendue) et met en pause son éventuel transfert durable. Une fois cette demande terminée, fermer le navigateur n'arrête pas le travail pris en charge. L'instance partage son verrou avec l'ancienne route texte ; les tours de l'assistant sont limités à dix par minute en SQLite.

### Travaux durables

Le préfixe reste `/api/admin/assistant`. Chaque lecture exige une session valide et chaque mutation exige en plus l'origine et le CSRF. Le compte unique peut retrouver ses travaux avec une nouvelle session ; les anciens jetons restent révoqués. Ces routes n'exposent aucune donnée publiquement et utilisent `Cache-Control: no-store`.

| Méthode et suffixe | Entrée et résultat |
| --- | --- |
| `POST /jobs` | Contrat `Turn` ci-dessus, sans tâche de traduction ; crée un travail et retourne 200 avec `Job` |
| `GET /jobs?page=1&limit=10` | `{items: Job[], page, limit, total}` |
| `GET /jobs/{id}` | `Job` courant, compteurs et éventuelles questions/erreur |
| `GET /jobs/{id}/batches?page=1&limit=10` | `{items: [{sequence, proposal}], page, limit, total}` ; une page de lots avec leurs propositions/reçus |
| `POST /jobs/{id}/input` | `{message: string, request_id?: UUID}` ; texte non vide de 1 à 16 000 caractères, identifiant facultatif pour rejouer le même apport sans le dupliquer ; retourne `Job` |
| `POST /jobs/{id}/pause` | Sans corps ; attend la prise en compte de la pause et retourne `Job` |
| `POST /jobs/{id}/resume` | Sans corps ; reprend les étapes restantes et retourne `Job` |
| `POST /jobs/{id}/cancel` | Sans corps ; arrête le travail et retourne `Job` |
| `DELETE /jobs/{id}` | Annule les étapes actives, attend leur arrêt puis supprime les données de suivi ; `{deleted: true}` |

Les pages commencent à 1 ; `limit` vaut 10 par défaut et accepte de 1 à 20. Une valeur hors bornes répond 422. La création de nouveaux travaux partage la limite de dix tentatives par minute avec `/turn`. Une répétition de `request_id` déjà connu retrouve le travail avant cette limite, sans nouvel appel fournisseur.

`Job` expose `id`, `status`, `language`, `message`, `created`, `updated`, `planned`, `prepared`, `applied`, `pending_batches`, `total_tasks`, `calls`, `delegations`, `questions`, `error`, `provider`, `model` et `include_private_notes`. Les dates sont des timestamps UTC. `total_tasks` peut valoir `null` tant que le coordinateur n'a pas fixé le total ; `prepared` inclut les tâches déjà `applied`. Les compteurs ne doivent pas être présentés comme une promesse de contenu déjà enregistré. `message` est le résumé courant du coordinateur, `questions` reprend `{question, reason, fields}`. `error` est un message nettoyé, jamais la réponse brute du fournisseur.

Les états de travail sont `queued`, `running`, `review`, `needs_input`, `paused`, `failed`, `completed`, `cancelled`. Les étapes terminées et leurs lots persistent dans tous ces états. `review` demande la relecture des lots ; `needs_input` attend des précisions. `completed` exige la résolution de l'ensemble des tâches et dépendances, ainsi que l'application des lots. Une coupure réseau ne doit pas être assimilée à une commande de pause ou d'arrêt.

`/turn` peut retourner `job` lorsqu'une planification a une suite ou que ses spécialistes ne tiennent pas dans le budget restant du parcours direct : appels déjà consommés + nombre de spécialistes × limite de récursion par agent (10) > 24. Cette réserve inclut les recherches et les corrections de sortie. Le transfert précède le lancement des spécialistes, réutilise le plan sans nouvelle planification et renvoie `proposal: null` et `delegations: 0` ; les compteurs du travail suivent ensuite la préparation. La création explicite via `/jobs` permet de conserver le travail dès le premier envoi ; répéter le même `request_id` retrouve le travail déjà créé. Les apports suivants utilisent `/input` et leur nombre n'est pas limité par la taille d'un historique `Turn` : chaque segment conserve la limite de 16 000 caractères et le corps HTTP de 256 Kio. Les lectures restent paginées ; le client ne doit pas accumuler tous les lots pour afficher une seule page.

Un apport pendant `queued` ou `running` répond 409 : mettre d'abord le travail en pause. Un nouvel apport en relecture, pause ou échec invalide les lots non appliqués et prépare leur correction sans supprimer les reçus ni réécrire les fiches appliquées. Une réponse à une question réessaie les sections bloquées. Avec le même `request_id`, `/input` renvoie l'état du travail sans ajouter de segment ni relancer la génération ; le client conserve donc cet UUID pour vérifier un envoi dont la réponse a été perdue. L'arrêt rend les lots restants inapplicables ; l'abandon d'une proposition durable met son travail en pause. Le redémarrage du processus transforme les travaux actifs en `paused`, sans lancer d'appel facturable au démarrage ; la reprise exige une session courante.

Une proposition durable conserve le contrat `Proposal`, avec un identifiant `job_…` et `expires: null`. Elle réutilise `GET /proposals/{id}`, `/apply` et `/cancel`, sous session actuelle. L'application exige toujours `{revision: n}`, relit les versions métier et reste atomique/idempotente par lot. La correspondance tâche → fiche et le reçu sont persistés avec l'application ; leur validité dépasse la purge des 50 propositions ordinaires. Supprimer un travail retire ce reçu et les autres données techniques, sans supprimer les fiches déjà enregistrées.

Les validations des quinze collections, des variantes FR/EN, des notes privées et des références restent dans le domaine métier. Une référence vers un lot antérieur utilise l'identifiant réel enregistré. Une référence future reste une dépendance. Après application de toutes les tâches de contenu, les associations différées sont préparées dans des propositions distinctes, avec un seul lot de liens en attente à la fois. Enregistrer ce lot permet de préparer le suivant ; toutes les dépendances doivent être appliquées pour terminer le travail. Une erreur ou un conflit ne valide pas partiellement le lot concerné et ne réécrit pas les lots appliqués auparavant.

Le responsable d'exécution appartient au cycle de vie FastAPI. La requête initiale ne reste pas ouverte pendant toute la préparation. Les étapes interrompues sont rendues reprenables après redémarrage ; sessions et fournisseur sont recontrôlés avant de nouveaux appels. Le travail conserve la langue éditoriale, les préférences et la permission de notes privées choisis à sa création. Une empreinte serveur du fournisseur, du modèle et de la clé détecte leur changement, sans conserver la clé dans les tables de travaux. Une différence met le travail en pause et fait répondre 409 à une reprise ou à un nouvel apport jusqu'au rétablissement des réglages initiaux. La reprise réattache la session actuelle sans réactiver les anciens jetons. Les détails de conservation, de récupération et de suppression figurent dans l'[exploitation](operations.md#travaux-durables-et-conservation).

### Préférences et modèles

`Style` contient `language` (code `fr`, `en`, `fr-CA`…), `tone` (`neutral`, `warm`, `direct`, `formal`), `technicality` (`accessible`, `balanced`, `expert`), `detail` (`concise`, `balanced`, `detailed`), `voice` (`first_person`, `third_person`, `impersonal`), `audience` (300 caractères) et `instructions` (1 500 caractères). `overrides` accepte uniquement les familles `profile`, `career`, `expertise`, `services`, `editorial`, `library`. Une famille absente hérite du style global ; une personnalisation remplace le style complet de la famille.

Les adaptateurs officiels sont isolés dans `assistant/models.py` : OpenAI Responses, Anthropic Messages, Mistral Chat. URL exactes fermées, POST uniquement, TLS, absence de redirection et de proxy d'environnement, réponse HTTP de 2 Mio maximum, pas de relance automatique SDK. OpenAI utilise `store=false`, `use_previous_response_id=false` et les éléments chiffrés de raisonnement seulement en mémoire pour les appels successifs ; aucun état fournisseur n'est conservé par le site. Les API des modèles choisis doivent supporter les outils structurés.

Le [graphe et ses budgets](assistant-design.md#limites-et-extension-du-code) impose 240 secondes au tour direct ou à chaque étape d'un travail durable ; le navigateur attend au plus 250 secondes pour le tour direct. Les travaux sont suivis par lectures successives de leur état. Les exceptions fournisseur sont nettoyées, y compris lorsqu'un SDK enveloppe une erreur de transport. Le journal retient identifiant, comptes d'appels/outils, durée et catégorie technique d'échec, sans corps ni clé. La trace LangSmith est désactivée explicitement.

## API du studio de contenus

Le préfixe `/api/admin/content` réutilise la session, l'origine et le jeton CSRF ci-dessus. Ce contrat administratif reste privé. Le contrat public séparé sélectionne désormais les fiches « prêt » et « public » selon les règles ci-dessous. Collections fermées : `projects`, `experiences`, `skills`, `technologies`, `educations`, `certifications`, `services`, `posts`, `publications`, `testimonials`, `awards`, `profiles`, `organizations`, `taxonomies`, `media`.

| Méthode et suffixe | Entrée / résultat |
| --- | --- |
| `GET /catalog` | Schémas des quinze formulaires, libellés, sections, options et limites ; aucun type modifiable par l'utilisateur |
| `GET /{collection}` | `q`, `status` (`draft`, `ready`, `archived`), `sort` (`updated`, `title`, `order`, `chronology`), `page` ≥ 1, `limit` de 1 à 100, `nature`, `related` facultatifs ; retourne `items`, `total`, `page`, `limit` |
| `POST /{collection}` | `{entry: {...}}` ; crée un brouillon et renvoie 201 |
| `GET /{collection}/{id}` | `entry`, `version`, `status`, dates serveur, `errors` de complétude, `usages`, libellés `references` et métadonnées de fichier éventuelles |
| `PUT /{collection}/{id}` | `{entry: {...}, version: n, as_draft: false}` ; remplace atomiquement la fiche et ses sous-listes ; `as_draft: true` permet de revenir en brouillon |
| `POST /{collection}/validate` | `{entry: {...}}` ; contrôle la saisie courante sans l'enregistrer |
| `POST /{collection}/{id}/check` | Contrôle la complétude de la version enregistrée |
| `POST /{collection}/{id}/transition` | `{version: n, status: "draft" / "ready" / "archived"}` ; relecture obligatoire pour `ready`, restauration d'une archive en `draft` |
| `POST /{collection}/{id}/duplicate` | `{version: n}` ; nouveau brouillon et slug, références réutilisées ; indisponible pour le profil unique et les médias |
| `DELETE /{collection}/{id}?version=n` | 204 uniquement pour une archive à jour, sans usages ; les objets partagés ne sont pas supprimés |
| `GET /media/usage` | Taille cumulée et quota, en octets |
| `POST /media/upload?filename=...` | Corps binaire brut et `Content-Type` autorisé ; 201 et fiche média. Pas de multipart ni de nom de chemin client |
| `GET /media/{id}/file` | Fichier privé par identifiant, sans cache ; PDF en téléchargement |

Les listes excluent les archives par défaut, les corps longs et les notes privées. Recherche sans distinction de casse ou d'accents. Le profil est unique, même archivé. Les champs communs et propres à chaque entité sont décrits dans le [studio](content-studio.md). `GET /catalog` donne leur format précis ; les propriétés inconnues sont refusées. Les références sont `{id, context}`, avec `release` pour une technologie et les informations d'usage pour un média. Une version devient périmée aussi lorsqu'une association réciproque est modifiée depuis l'autre fiche.

Une erreur métier renvoie `detail` et `errors: [{path, message, code}]`, sans recopier la valeur fautive. Exemple de chemin : `media.0.alt`. Un conflit de version ou d'unicité renvoie 409 ; une purge bloquée contient aussi les `usages`. Une structure invalide ou une relecture incomplète renvoie 422. Aucun conflit ne force un écrasement.

### Fichiers et limites

L'exception à la limite JSON de 256 Kio concerne exclusivement `POST /media/upload`. La session et le CSRF sont contrôlés avant la lecture du flux. Un seul téléversement est traité à la fois dans l'instance ; le quota est vérifié dans une transaction SQLite avant de rendre le fichier visible. Les fichiers temporaires utilisent le volume durable, pas le tmpfs de 16 Mio. Échec et annulation nettoient le temporaire.

Formats : JPEG, PNG, WebP (10 Mio, 20 millions de pixels, image fixe), PDF (20 Mio), MP4 et WebM (100 Mio). Le contenu des images est décodé et vérifié avec [Pillow](https://pillow.readthedocs.io/en/stable/reference/Image.html). PDF et vidéos ont un contrôle de signature ; cela ne garantit ni leur innocuité ni leur décodage complet. Pas d'antivirus, de transcodage, de téléchargement d'URL distante ou d'iframe automatique. SVG et HTML sont refusés. Le serveur utilise un nom aléatoire, conserve taille et SHA-256 et ne prend jamais un chemin de fichier depuis la requête. Un format non accepté renvoie 415 ; une taille ou un quota dépassé renvoie 413.

### Persistance et migrations

`content/schemas.py` définit les modèles métier ; `catalog.py` contient les correspondances fermées ; `store.py` gère les transactions. `content_entries` porte le socle, une table par collection les champs spécifiques, des tables ordonnées les sous-listes et des clés étrangères les relations. Aucun document JSON indifférencié n'est utilisé comme base métier. Les clés étrangères sont actives à chaque connexion.

`content/migrations/001.sql` est un instantané immuable du premier schéma. Les migrations s'exécutent dans une transaction et leur registre `content_migrations` doit être une suite connue ; une version future bloque le démarrage. La première migration conserve compte, clé chiffrée, sessions et limites existantes. `002.sql` ajoute préférences et propositions temporaires, `003.sql` les langues d'interface, `004.sql` les variantes éditoriales et `005.sql` les travaux durables ; **le schéma courant est 5**.

Les tables `assistant_jobs`, `assistant_job_inputs`, `assistant_job_tasks`, `assistant_job_sections`, `assistant_job_dependencies` et `assistant_job_batches` conservent l'état technique du travail. Ce stockage ne remplace ni les tables métier ni leurs validations. Une restauration révoque les sessions et supprime leurs propositions ordinaires ; préférences, travaux et lots durables restent dans la copie restaurée, accessibles après une nouvelle connexion. La [sauvegarde cohérente](operations.md#sauvegarde-du-studio-base-et-medias) couvre SQLite et les fichiers.

## Ancien adaptateur de chat texte

Pour la route compatible `/chat`, `admin/store.py` gère les transactions SQLite et `admin/security.py` le hachage, les jetons et la limite de corps. `admin/llm.py` adapte les messages aux API natives : [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create) et [Mistral Chat](https://docs.mistral.ai/api/endpoint/chat).

Les URL HTTPS sont fixes ; le client n'accepte pas de redirection et ignore les variables de proxy. Le délai total est de 65 secondes (connexion 10 s, opérations réseau 60 s), la réponse HTTP de 2 Mio maximum, le budget de sortie demandé de 4 096 tokens. OpenAI reçoit `max_completion_tokens` et `store=false`, les deux autres `max_tokens` ; Anthropic reçoit aussi `anthropic-version: 2026-10-21` avec authentification Bearer. Les réponses brutes et erreurs du fournisseur ne sont pas retournées au navigateur.

## Distribution statique

`delivery.py` utilise `StaticFiles` en mode HTML pour servir les répertoires construits. Ce mode permet de résoudre les index des pages documentaires. Un fichier inexistant reste une erreur 404, y compris sous `/assets/` ou `/documentation/`.

Les sorties attendues sont `SITE_STATIC_DIR/web/index.html` et `SITE_STATIC_DIR/documentation/index.html`. En production, leur absence lève une erreur de démarrage indiquant les chemins manquants. En développement, l'API peut fonctionner sans ces sorties ; les montages ne sont ajoutés que si les répertoires sont présents lors de la création de l'application.

Ne pas créer de route `/{path:path}` qui retourne systématiquement `index.html` : elle casserait le contrat d'erreur, notamment pour les ressources JavaScript et CSS.

## Cache

| Ressource | `Cache-Control` | Intention |
| --- | --- | --- |
| Assets Vite avec empreinte dans leur nom | `public, max-age=31536000, immutable` | Réutilisation longue d'une version dont le nom change avec le contenu |
| Police, icône, script initial et documentation | `no-cache` | Revalidation avant réutilisation |
| Pages publiques et fichiers de contenus | `no-store` | Recontrôler la publication à chaque accès |
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

## API publique et routes de présentation

Les huit pages sont `/`, `/projets`, `/parcours`, `/expertise`, `/services`, `/journal`, `/a-propos` et `/explorer`. Le registre fermé `content/public.py:PATHS` définit les fiches : `/<préfixe>/<id>/<slug>` (ex. `/projets/12/mon-projet`, `/journal/articles/20/mon-article`). Identifiant stable, ancien slug redirigé 308 après autorisation, fiche privée/inconnue 404. Les titres et descriptions SEO sont échappés dans le HTML, sans rendu serveur du corps React.

| Route de lecture | Contrat |
| --- | --- |
| `/api/public/home` | Profil public éventuel, trois projets/articles/services et six compétences |
| `/api/public/entries` | Résumés, `total`, `page`, `limit` ; paramètres `kind`, `q` (160 caractères), `sort` (`selection`, `recent`, `title`), `page` (1–100000), `limit` (1–48, défaut 12), `related` (ID public) |
| `/api/public/entries/{kind}/{id}` | Projection publique des champs, références autorisées, jusqu'à douze usages publics, expiration et métadonnées de fichier autorisées |
| `/api/public/media/{id}/file` | GET/HEAD du fichier autorisé ; PDF en téléchargement, nom de fichier public, support des plages de FileResponse |
| `/api/public/media/{id}/image?width=960` | GET/HEAD WebP optimisé ; largeurs fermées 480, 960 et 1600, sans agrandissement, cache mémoire borné |

Seuls Prêt + Public sont sélectionnés ; les témoignages exigent le consentement. Notes privées, contraintes confidentielles, chemins de stockage, justificatifs privés et état interne sont exclus. Les identités masquées sont remplacées dans le titre, le slug, la recherche et les métadonnées ; leurs champs et associations identifiants sont retirés. La recherche est insensible aux accents/casse et porte sur les titres/résumés projetés, sans utiliser l'index privé. Le tri récent utilise les dates éditoriales/de parcours.

Un média doit aussi avoir un usage autorisé par une fiche publique ; un usage `private_proof` seul ne suffit jamais. Le retrait d'une fiche retire ses liens et peut retirer le dernier usage public d'un média. Le cache mémoire des images ne contourne pas l'autorisation. Toutes les réponses API, fichiers publics et pages dynamiques sont `no-store` ; les assets Vite gardent leur cache immuable. Sans studio actif, accueil et listes sont vides, détails/fichiers 404. Une collection inconnue répond 404 ; des paramètres invalides répondent 422.
