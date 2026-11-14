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
   Si l'administration est active, sauvegarder sa base et ses médias, puis vérifier la disponibilité de sa clé de chiffrement.
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

Ne pas reconstruire le même tag pour revenir en arrière : cela remplacerait son contenu. L'ajout initial de l'administration crée son schéma sans modifier les données publiques. Revenir à une image antérieure à l'administration conserve le volume, mais ne fournit plus `/admin`. Pour toute évolution ultérieure du schéma, vérifier sa compatibilité ou restaurer la sauvegarde adaptée avant de relancer l'ancienne image. Si Compose a également changé, restaurer sa configuration compatible sans supprimer le volume.

Le réseau `egress` appartient au projet Compose. Restaurer un Compose antérieur à l’issue #6 retire la route Internet du service et rend les appels LLM indisponibles. Ne pas modifier `multisite_proxy` pour compenser et refaire le contrôle HTTPS sortant du [déploiement](deployment.md) après toute modification réseau.

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

Les sources et fichiers de verrouillage sont conservés dans Git. Préserver aussi la configuration Caddy, ses données TLS selon les procédures de la plateforme, les images récentes et les comptes rendus. Avec l'administration, sauvegarder le volume `admin_data` et `SITE_SECRET_KEY` séparément. Une copie de SQLite seule ne permet pas de retrouver la clé API. Les messages du chat ne sont pas stockés dans cette base.

Le volume réel se nomme normalement `thibault-personal-site_admin_data`. Vérifier les montages du conteneur si le nom du projet Compose a été modifié. Ne pas exécuter `docker compose down -v` : cette option supprime les données persistantes.

### Sauvegarde du studio : base et médias

`python -m personal_site.content.backup` fournit `export`, `verify` et `restore`. L'export utilise l'API SQLite et réserve les écritures pendant la copie des médias : base et fichiers décrivent ainsi le même instant. Le manifeste contient le format, la version de schéma, le commit fourni, la taille et le SHA-256 de chaque fichier et de la base. Aucun secret n'est affiché. Le répertoire de destination doit être nouveau.

Sur un poste de développement, avec `SITE_ADMIN_DB_PATH` correctement configuré :

```bash
umask 077
studio_backup="/chemin/prive/studio-$(date -u +%Y%m%dT%H%M%SZ)"
uv run python -m personal_site.content.backup export "$studio_backup" --commit "$(git rev-parse HEAD)"
uv run python -m personal_site.content.backup verify "$studio_backup"
```

En production, utiliser l'image réellement déployée et un répertoire hôte dédié, accessible à l'UID/GID `10001:10001` du conteneur. Exemple de préparation par l'opérateur autorisé :

```bash
sudo install -d -m 0700 -o 10001 -g 10001 /home/deploy/backups/thibault-personal-site
```

Prévoir une fenêtre de maintenance courte, surtout pour les gros fichiers : une requête d'écriture durant un export long peut dépasser son attente SQLite. Le serveur est arrêté dans cet exemple et le conteneur de maintenance utilise le même volume. Ne pas arrêter le proxy partagé.

```bash
set -e
site_container_id="$(docker compose ps -q site)"
studio_image="$(docker inspect --format '{{.Config.Image}}' "$site_container_id")"
export IMAGE_TAG="${studio_image##*:}"
studio_backup_name="studio-$(date -u +%Y%m%dT%H%M%SZ)"
docker compose stop site
docker compose run --rm -T --no-deps --volume /home/deploy/backups/thibault-personal-site:/backup site python -m personal_site.content.backup export "/backup/$studio_backup_name" --commit "$IMAGE_TAG"
docker compose run --rm -T --no-deps --volume /home/deploy/backups/thibault-personal-site:/backup:ro site python -m personal_site.content.backup verify "/backup/$studio_backup_name"
docker compose up -d --no-build --wait --wait-timeout 120
bash scripts/smoke-test.sh
```

Le tag doit être le commit de l'image ; si son origine ne permet pas de l'établir, utiliser explicitement `--commit unknown` et documenter ce manque. Le montage `/backup` évite le tmpfs `/tmp` de 16 Mio. Si une commande échoue après l'arrêt, diagnostiquer l'erreur puis relancer le service avec le même tag : `set -e` ne le redémarre pas automatiquement.

Transférer le répertoire validé vers le stockage de sauvegarde prévu, avec ses permissions privées. Sauvegarder `SITE_SECRET_KEY` séparément. Une copie de SQLite seule ne suffit plus dès qu'un média a été téléversé. Les médias archivés sont inclus ; les URL externes ne sont pas téléchargées. Un arrêt brutal peut laisser un temporaire `.upload-*` ou un fichier orphelin non référencé : l'export n'inclut que les références validées. Nettoyer ces fichiers seulement après arrêt, sauvegarde et comparaison avec `media_files` ; ne jamais effacer le répertoire de médias en bloc.

### Vérifier une restauration isolée

La commande vérifie intégrité SQLite, clés étrangères, version et empreintes. Elle refuse une destination existante, copie vers un nouveau répertoire et révoque toutes les sessions dans la copie restaurée. Le manifeste d'origine reste une preuve de l'export ; la base restaurée change volontairement après révocation des sessions.

```bash
uv run python -m personal_site.content.backup verify "$studio_backup"
uv run python -m personal_site.content.backup restore "$studio_backup" /chemin/prive/restauration-test
```

Démarrer une instance locale isolée avec `SITE_ADMIN_DB_PATH=/chemin/prive/restauration-test/admin.sqlite3`, l'ancienne clé Fernet et l'origine locale exacte. Vérifier connexion, réglages sans révéler la clé, projet lié à une expérience et ouverture d'un média. Ne pas pointer cette instance de test vers le volume actif.

Pour restaurer la production : vérifier la copie isolée et l'image compatible, sauvegarder l'état actuel, arrêter le service, puis remplacer **ensemble** `admin.sqlite3` et `media/` dans le volume. Conserver le couple précédent dans un répertoire privé avant le remplacement ; ne pas écraser une base en cours d'utilisation. Utiliser un conteneur de maintenance avec le volume et la sauvegarde montée en lecture seule, en conservant l'utilisateur `10001:10001`, les dossiers `0700` et les fichiers `0600`. La commande `restore` peut préparer `/app/data/restauration-verifiee` avant cette bascule contrôlée. Ne pas démarrer l'application entre les deux déplacements. Révoquer les sessions est déjà fait par `restore` ; configurer la clé Fernet correspondante, puis redémarrer et vérifier les parcours.

### Avant la première migration vers le studio

L'ancienne image ne contient pas encore la commande de sauvegarde du studio et la base ne contient pas de médias. Sauvegarder SQLite par son API avant de publier l'image qui applique la migration initiale :

```bash
umask 077
admin_backup="/chemin/prive/admin-avant-studio.sqlite3"
docker compose exec -T site python -c 'import sqlite3; source=sqlite3.connect("file:/app/data/admin.sqlite3?mode=ro", uri=True); target=sqlite3.connect("/tmp/admin-backup.sqlite3"); source.backup(target); target.close(); source.close()'
docker compose exec -T site python -c 'import sys; from pathlib import Path; sys.stdout.buffer.write(Path("/tmp/admin-backup.sqlite3").read_bytes())' > "$admin_backup"
uv run python -c 'import sqlite3,sys; db=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro", uri=True); assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"; db.close()' "$admin_backup"
docker compose exec -T site python -c 'from pathlib import Path; Path("/tmp/admin-backup.sqlite3").unlink()'
```

L'export binaire utilise `exec -T` car `docker compose cp` ne retrouve pas toujours les fichiers tmpfs sur cette plateforme. Cette procédure SQLite seule est réservée à la base antérieure au studio. Le premier schéma de contenu est additif : revenir à l'ancienne image conserve ses tables et fichiers, mais les rend indisponibles jusqu'au retour à une image compatible.

## Récupérer le compte administrateur

Avec un accès local autorisé au serveur, utiliser la commande interactive :

```bash
docker compose exec site python -m personal_site.admin.reset
```

En développement : `uv run python -m personal_site.admin.reset`. Saisir le nom et le nouveau mot de passe, puis sa confirmation. Le mot de passe n'est pas affiché ni passé en argument de commande. La commande préserve les réglages fournisseur et révoque toutes les sessions. Les limites de tentatives restent actives jusqu'à leur expiration (15 minutes maximum).

Changer le mot de passe initial dans `.env` ne réinitialise pas un compte déjà créé. Ne pas supprimer SQLite pour récupérer l'accès. La commande exige l'administration activée et la clé de chiffrement existante.

## Clé de chiffrement perdue ou rotation

Pour changer `SITE_SECRET_KEY` volontairement, retirer d'abord la clé fournisseur dans l'interface, remplacer la clé Fernet dans la configuration et sa sauvegarde, recréer le service, puis saisir à nouveau la clé fournisseur. Ne pas remplacer la clé Fernet alors qu'un secret chiffré subsiste en base : le démarrage refuserait cette incohérence.

Si la clé est perdue, chercher sa sauvegarde en priorité. Sans elle, le secret fournisseur est irrécupérable depuis SQLite. Après sauvegarde de la base et arrêt du service, l'opérateur peut retirer seulement ce secret avec :

```bash
docker compose run --rm -T --no-deps --entrypoint python site -c 'import sqlite3; db=sqlite3.connect("/app/data/admin.sqlite3"); db.execute("UPDATE provider SET api_key = NULL WHERE id = 1"); db.execute("DELETE FROM sessions"); db.commit(); db.close()'
```

Générer ensuite une nouvelle clé Fernet, la configurer et la sauvegarder, recréer le service et saisir une nouvelle clé fournisseur depuis l'interface. Cette opération préserve le compte et le modèle mais supprime définitivement le secret fournisseur enregistré.

## Nettoyage ciblé

Sur un serveur partagé, éviter les commandes globales comme `docker system prune -a` ou l'arrêt du projet de plateforme. Examiner d'abord les images de cette application et ne supprimer que les versions devenues inutiles, après conservation d'un retour arrière valide.
