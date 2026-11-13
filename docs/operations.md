# Exploitation et retour arrière

## Lire l'état du service

Depuis `/home/deploy/projects/new.thibault-leveau.com` :

```bash
docker compose ps
docker compose logs --tail=100 site
bash scripts/smoke-test.sh
```

Le statut Docker `healthy` confirme que l'endpoint de santé répond dans le conteneur. Le smoke test confirme les routes publiques traversant DNS, TLS et Caddy. Les deux contrôles répondent à des questions différentes et se complètent.

Pour suivre les journaux pendant une intervention :

```bash
docker compose logs --follow --tail=50 site
```

`Ctrl+C` arrête le suivi, pas le service. Compose limite les journaux à trois fichiers de 10 Mo pour ce conteneur. Les journaux Caddy restent gérés par la plateforme partagée.

## Identifier la version déployée

```bash
site_container_id="$(docker compose ps -q site)"
docker inspect --format '{{.Config.Image}}' "$site_container_id"
docker inspect --format '{{.Image}}' "$site_container_id"
git log -1 --oneline
```

La première valeur est le nom de l'image avec son tag ; la deuxième est son identifiant Docker exact. Le commit présent dans le dossier de travail peut différer du service lancé : ne pas utiliser `git log` seul pour conclure à la version exécutée.

## Mettre à jour

1. Vérifier que la version actuelle est saine et enregistrer son image.
2. Placer le dépôt sur le commit à publier, sans perdre de modifications locales.
3. Exécuter les contrôles du [guide de tests](testing.md).
4. Construire avec un nouveau tag de commit.
5. Recréer le service avec `--no-build --wait`.
6. Exécuter le smoke test et vérifier le rendu dans le navigateur.

Avant le remplacement :

```bash
site_container_id="$(docker compose ps -q site)"
previous_image="$(docker inspect --format '{{.Config.Image}}' "$site_container_id")"
printf '%s\n' "$previous_image"
export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
docker compose build --pull site
docker compose up -d --no-build --wait --wait-timeout 120
bash scripts/smoke-test.sh
```

Conserver la valeur de `previous_image` dans le compte rendu de déploiement. La variable shell n'est pas persistante entre deux sessions. Ne pas supprimer l'image précédente avant la fin de la période de vérification.

Le service utilise une seule instance : sa recréation peut provoquer une courte interruption. Cette première version ne fournit pas de mécanisme de bascule sans interruption.

## Retour arrière

Si une version cause une régression, relancer l'image connue comme saine. Dans la même session que la mise à jour, avec `previous_image` encore défini :

```bash
test -n "${previous_image:-}"
docker image inspect "$previous_image" >/dev/null
export IMAGE_TAG="${previous_image##*:}"
docker compose up -d --no-build --wait --wait-timeout 120
bash scripts/smoke-test.sh
```

Dans une nouvelle session, reprendre le tag enregistré dans le compte rendu. `docker image ls local/thibault-personal-site` permet de retrouver les images disponibles, mais le choix de la version saine doit reposer sur son historique de validation.

Ne pas reconstruire le même tag pour revenir en arrière : cela remplacerait son contenu. Aucune migration de données n'est nécessaire dans le périmètre actuel. Si Compose a également changé, restaurer sa configuration compatible avec l'ancienne image avant de relancer le service.

Si la régression concerne Caddy, rétablir uniquement le bloc du domaine concerné et son import depuis la sauvegarde, puis valider et recharger le proxy. Un retour d'image applicative ne répare pas un changement de configuration du proxy ou du DNS.

## Redémarrer sans changer de version

```bash
docker compose restart site
docker compose ps
bash scripts/smoke-test.sh
```

Un redémarrage réutilise le conteneur et ses paramètres. Pour appliquer des variables modifiées dans Compose, employer `up -d` avec le tag déjà déployé : `restart` ne recharge pas la définition du service.

La politique `unless-stopped` redémarre le service après une sortie du processus ou un redémarrage du démon Docker, sauf s'il a été arrêté volontairement. Un statut `unhealthy` n'entraîne pas à lui seul un redémarrage automatique par Docker Compose.

## Surveillance

Le socle fournit une route de santé, un contrôle Docker, des journaux et un script de vérification. Il ne configure pas de service externe de supervision ni d'alerte automatique. Pour une future surveillance, contrôler au minimum l'accueil HTTPS, le statut de santé et l'expiration du certificat, depuis un point extérieur au serveur.

`SITE_LOG_LEVEL` règle les loggers `personal_site`, `uvicorn.error` et `uvicorn.access` : le niveau s’applique aux journaux applicatifs, de processus et d’accès Uvicorn. Les journaux Docker et Caddy restent configurés séparément.

## Sauvegardes et nettoyage

Les sources et fichiers de verrouillage sont conservés dans Git. Les éléments d'exploitation à préserver sont la configuration effective de la plateforme Caddy, ses données TLS selon les procédures de la plateforme, les images des versions récentes et le compte rendu des déploiements. Le site ne stocke actuellement aucune donnée utilisateur côté serveur.

Sur un serveur partagé, éviter les commandes globales comme `docker system prune -a` ou l'arrêt du projet de plateforme. Examiner d'abord les images de cette application et ne supprimer que les versions devenues inutiles, après conservation d'un retour arrière valide.
