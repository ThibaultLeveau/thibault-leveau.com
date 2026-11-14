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
   Si l'administration est active, sauvegarder sa base et vérifier la disponibilité de sa clé de chiffrement.
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

### Sauvegarder SQLite pendant le fonctionnement

Utiliser l'API de sauvegarde SQLite pour obtenir une copie cohérente pendant les écritures. Ces commandes créent un fichier privé hors du dépôt :

```bash
set -e
umask 077
mkdir -p /home/deploy/backups/thibault-personal-site
admin_backup="/home/deploy/backups/thibault-personal-site/admin-$(date -u +%Y%m%dT%H%M%SZ).sqlite3"
docker compose exec -T site python -c 'import sqlite3; source=sqlite3.connect("file:/app/data/admin.sqlite3?mode=ro", uri=True); target=sqlite3.connect("/tmp/admin-backup.sqlite3"); source.backup(target); target.close(); source.close()'
docker compose exec -T site python -c 'import sys; from pathlib import Path; sys.stdout.buffer.write(Path("/tmp/admin-backup.sqlite3").read_bytes())' > "$admin_backup"
chmod 600 "$admin_backup"
uv run python -c 'import sqlite3,sys; db=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro", uri=True); assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"; assert db.execute("SELECT count(*) FROM account").fetchone()[0]==1; db.close()' "$admin_backup"
docker compose exec -T site python -c 'from pathlib import Path; Path("/tmp/admin-backup.sqlite3").unlink()'
```

L'export passe par `exec -T` et une redirection binaire vers le fichier privé : `docker compose cp` ne retrouve pas toujours les fichiers du montage tmpfs `/tmp` sur cette plateforme. Conserver `-T` pour ne pas altérer le flux avec un terminal. Les vérifications contrôlent l'intégrité et la présence du compte avant de supprimer la copie temporaire.

Transférer la copie validée dans le stockage de sauvegarde prévu. Conserver la clé de chiffrement dans un emplacement protégé distinct et noter le commit de l'image avec la sauvegarde. Ne pas envoyer ces fichiers dans une issue ou une PR, ni laisser leur contenu binaire s'afficher dans le terminal.

### Restaurer une sauvegarde

Choisir une copie vérifiée et une image compatible, conserver la base actuelle avant écrasement, puis arrêter le service. Dans la même session où `admin_backup` désigne la copie à restaurer :

```bash
test -f "$admin_backup"
docker compose stop site
docker compose run --rm -T --no-deps --entrypoint python site -c 'import sys, sqlite3; from pathlib import Path; p=Path("/app/data/admin.sqlite3"); p.write_bytes(sys.stdin.buffer.read()); p.chmod(0o600); db=sqlite3.connect(p); db.execute("DELETE FROM sessions"); db.commit(); db.close()' < "$admin_backup"
docker compose up -d --no-build --wait --wait-timeout 120
bash scripts/smoke-test.sh
```

Le conteneur de restauration utilise le même utilisateur `10001:10001` et le même volume. Avant le redémarrage, `SITE_SECRET_KEY` doit correspondre à la copie. La suppression des sessions restaurées impose une nouvelle connexion. Vérifier ensuite le compte et la présence de la clé dans l'interface, sans l'afficher.

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
