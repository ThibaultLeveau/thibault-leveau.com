# Déploiement

## Livraison obligatoire après fusion

Selon `AGENTS.md`, l’agent poursuit chaque demande jusqu’au déploiement en production et à sa vérification, sauf instruction explicite contraire de Thibault. La fusion et le déploiement sont autorisés dès que les tests, la CI et la revue requis sont satisfaits ; aucune confirmation supplémentaire n’est nécessaire pour appliquer cette procédure dans l’architecture approuvée. Les changements documentaires intégrés à l’image sont également publiés.

La CI contrôle la version mais ne lance pas le déploiement. L’agent déploie `main` validé depuis un arbre propre, sauvegarde les données selon le [guide d’exploitation](operations.md#sauvegardes-et-nettoyage), conserve l’image précédente, puis contrôle le site réellement servi. Le compte rendu dans l’issue et à Thibault indique commit, image, URL et résultats. Une clôture automatique de l’issue à la fusion ne dispense pas de cette dernière étape. Si le déploiement est bloqué ou annulé par un retour arrière, indiquer précisément l’état réel et la cause.

## Cible et prérequis

Le site est déployé depuis le serveur actuel, dans `/home/deploy/projects/new.thibault-leveau.com`. Le service Docker rejoint le réseau existant `multisite_proxy` ; Caddy est géré par la plateforme sous le nom `multisite-platform-caddy-1`.

| Élément | Cible |
| --- | --- |
| Domaine | `new.thibault-leveau.com` |
| IPv4 publique | `168.231.82.6` |
| Projet Compose | `thibault-personal-site` |
| Service Compose | `site` |
| Image | `local/thibault-personal-site:<commit>` |
| Alias réseau | `thibault-personal-site` |
| Port applicatif interne | `8000` |
| Configuration Caddy hôte | `/srv/apps/platform/caddy/` |
| Même répertoire dans Caddy | `/etc/caddy/` |

Le sous-domaine est une nouvelle entrée de la plateforme. Ne pas arrêter le proxy partagé, remplacer sa configuration globale ou modifier les enregistrements des autres sites pour déployer cette application.

## 1. Préparer une version identifiée

Depuis la racine du dépôt :

```bash
git status --short
git log -1 --oneline
make install
make check
make test-e2e
```

Déployer un commit validé avec un arbre de travail propre. Des sources non commitées produiraient une image différente du commit affiché par son tag. Après validation, les sources et fichiers de verrouillage sont publiés sur `main` dans le dépôt GitHub prévu.

Définir un identifiant d'image depuis le commit courant :

```bash
export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
docker compose config --quiet
docker network inspect multisite_proxy
```

Le réseau doit déjà exister et contenir Caddy. Vérifier son sous-réseau contre `FORWARDED_ALLOW_IPS` dans Compose. Ne pas recréer un réseau partagé pour résoudre une erreur de nom.

Utiliser Compose **2.33.1 ou ultérieur** pour `gw_priority`. Le réseau partagé est interne ; Compose crée aussi le bridge non interne `thibault-personal-site_egress`, propre à cette application, pour la route Internet sortante. Ne pas désactiver l’isolation du réseau partagé.

## 2. Construire et démarrer l'application

Pour activer l'administration, préparer les variables selon le [guide dédié](administration.md#premiere-activation), avec `SITE_ADMIN_ORIGIN=https://new.thibault-leveau.com`. Garder `.env` privé (`0600`) et sauvegarder `SITE_SECRET_KEY`. Laisser `SITE_ADMIN_ENABLED=false` conserve un déploiement public sans compte. Une configuration d'administration invalide empêche tout le processus de démarrer : la vérifier avant le remplacement du service.

```bash
docker compose build --pull site
docker compose up -d --no-build --wait --wait-timeout 120
docker compose ps
```

Le Dockerfile compile le frontend, construit MkDocs en mode strict, installe le backend et copie les sorties dans l'image finale. Le processus s'exécute sous l'utilisateur `10001:10001` ; Compose impose une racine en lecture seule, un `/tmp` temporaire et le volume durable `admin_data` sur `/app/data`. Le répertoire initial de l'image appartient à cet utilisateur avec des permissions `0700` ; Docker transmet ces permissions lors de la création du volume. SQLite est créé en `0600`.

Le contrôle de santé appelle `/api/health` depuis le conteneur. Si `up --wait` échoue, inspecter les journaux avant de poursuivre :

```bash
docker compose logs --tail=100 site
```

Aucun port hôte ne doit être publié par ce service. Vérifier la communication depuis Caddy :

```bash
docker exec multisite-platform-caddy-1 wget -qO- http://thibault-personal-site:8000/api/health
```

Résultat attendu : `{"status":"ok"}`. Cette vérification précède la modification du DNS et permet de distinguer les problèmes applicatifs des problèmes de domaine.

Vérifier également la sortie Internet sans envoyer de clé ni déclencher de génération :

```bash
docker network inspect thibault-personal-site_egress --format '{{.Internal}}'
docker compose exec -T site python -c 'import httpx; r=httpx.get("https://api.openai.com/v1/models", timeout=15, trust_env=False, follow_redirects=False); print(r.status_code); assert r.status_code == 401'
```

Résultats attendus : `false`, puis `401` (authentification absente). Ce refus confirme DNS, connexion et TLS vers OpenAI, mais pas la validité d’une clé, le crédit ou l’accès au modèle. Le contrôle de santé local ne vérifie pas cette connectivité.

## 3. Installer le bloc Caddy

Cette étape s'effectue au premier déploiement, puis lors d'une modification explicite du bloc proxy. Le fichier versionné est `deploy/new.thibault-leveau.com.caddy`. Il réutilise le snippet `common` déjà défini par la plateforme ; sa validation doit donc se faire à travers le Caddyfile principal, et non comme fichier autonome.

Sauvegarder le fichier principal et inspecter ses imports :

```bash
proxy_backup="/srv/apps/platform/caddy/Caddyfile.backup.$(date -u +%Y%m%dT%H%M%SZ)"
cp /srv/apps/platform/caddy/Caddyfile "$proxy_backup"
rg -n 'import|new\.thibault-leveau\.com' /srv/apps/platform/caddy/Caddyfile
install -m 0644 deploy/new.thibault-leveau.com.caddy /srv/apps/platform/caddy/new.thibault-leveau.com.caddy
```

Ajouter une seule fois la ligne suivante au fichier `/srv/apps/platform/caddy/Caddyfile`, en conservant les autres blocs et imports :

```caddyfile
import new.thibault-leveau.com.caddy
```

Valider avant de recharger :

```bash
docker exec multisite-platform-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec multisite-platform-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Une validation en erreur interdit de poursuivre le rechargement. Corriger le bloc ou restaurer la sauvegarde du fichier principal. Le rechargement valide met à jour les routes sans arrêter les autres sites.

Caddy gère le certificat et la redirection HTTP vers HTTPS. La délivrance d'un certificat peut rester en attente tant que le DNS public ne désigne pas le serveur.

## 4. Déclarer le DNS Hostinger

Lire la zone DNS de `thibault-leveau.com` avant toute écriture. L'enregistrement souhaité est :

| Type | Nom | Valeur | TTL |
| --- | --- | --- | --- |
| A | `new` | `168.231.82.6` | 300 secondes |

Créer uniquement cette entrée si elle n'existe pas. Si elle est déjà identique, ne rien modifier. Si `new` possède une autre cible, un CNAME ou un AAAA, examiner l'usage existant avant toute modification : une entrée contradictoire peut détourner certains visiteurs vers un autre serveur. Conserver les enregistrements MX, TXT et ceux des autres hôtes.

L'opération se réalise avec un accès Hostinger authentifié. L'installation du code et le démarrage du conteneur ne créent pas automatiquement le DNS. Une connexion Hostinger indisponible empêche cette étape, sans invalider la construction locale.

Vérifier la résolution publique :

```bash
dig +short A new.thibault-leveau.com
dig +short AAAA new.thibault-leveau.com
```

L'adresse A attendue est `168.231.82.6`. Le TTL de 300 secondes régit la mise en cache de la nouvelle réponse ; les caches d'une ancienne réponse ou d'une absence peuvent demander davantage de temps.

## 5. Vérifier depuis l'extérieur

```bash
curl --silent --show-error --output /dev/null --dump-header - http://new.thibault-leveau.com/
curl --fail --silent --show-error --output /dev/null --dump-header - https://new.thibault-leveau.com/
bash scripts/smoke-test.sh
```

La première réponse doit rediriger vers HTTPS. La seconde doit réussir sans désactiver la vérification du certificat, avec l'en-tête `X-Robots-Tag: noindex, nofollow`. Le smoke test contrôle l'accueil, la santé, la documentation, l'index de recherche et des erreurs 404.

Ouvrir enfin l'accueil sur mobile et bureau, tester le thème et lancer une recherche dans la documentation. Un contrôle JSON de santé seul ne suffit pas à valider l'expérience complète.

Si l'administration est activée, vérifier `/admin`, une connexion HTTPS, les réglages et la déconnexion. Un visiteur sans session doit recevoir 401 sur `/api/admin/session`, et le cookie obtenu après connexion doit être `Secure`, `HttpOnly` et `SameSite=Strict`. Ne pas enregistrer les identifiants dans des captures ou traces. La validation d'un véritable appel LLM exige une clé et peut être facturée ; les tests automatisés utilisent un fournisseur simulé.

Une fois le compte initialisé, retirer la valeur du mot de passe initial de `.env` et recréer le service avec le même tag. Conserver la clé Fernet : le compte existant est relu depuis SQLite et n'a plus besoin de son mot de passe initial en environnement.

Pour consulter le certificat présenté :

```bash
openssl s_client -connect new.thibault-leveau.com:443 -servername new.thibault-leveau.com </dev/null 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

## Déploiements suivants

Un changement purement applicatif ne nécessite aucune modification du DNS ou de Caddy. Conserver l'image précédente, construire un nouveau tag depuis le commit validé, puis recréer uniquement le service `site` avec ce tag. Refaire les contrôles publics.

Le tag `local` convient aux essais. Pour une version publiée, utiliser un tag de commit et conserver son identifiant avec le résultat des vérifications. La procédure de retour à l'image précédente figure dans [Exploitation et retour arrière](operations.md).

## Livraison de l'assistant de contenus

Cette version passe le schéma SQLite de 1 à 2. Avant de remplacer le service, suivre la [sauvegarde et la compatibilité de retour arrière](operations.md#migration-de-lassistant-schema-1-vers-2) avec l'image actuellement exécutée. Ne modifier ni Caddy, ni DNS, ni réseau pour cette évolution.

Après démarrage, vérifier le schéma, la conservation des comptes/contenus/médias, le chat et **Agents et rédaction** avec une session autorisée, puis les réponses HTTPS et le rendu bureau/mobile dans les deux thèmes. La CI et les parcours isolés prouvent les écritures ; les contrôles de production n'y créent pas de fiches de démonstration. Consigner le résultat, le commit et l'image réellement exécutée dans l'issue #12.
