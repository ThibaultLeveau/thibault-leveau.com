# Administration, contenus et chat LLM

L'espace privé est accessible à **`/admin`**. Il contient le studio de contenus, un chat texte, le choix du fournisseur LLM et la gestion d'un compte administrateur unique. L'accueil public et la documentation restent accessibles sans connexion.

Le [studio de contenus](content-studio.md) organise les projets, le parcours, les services, les publications et leurs références. Aucune donnée biographique ni fiche de démonstration n'est préremplie. Les contenus restent privés, même au statut **Prêt**.

## Première activation

Après installation des dépendances, créer un fichier local `.env` depuis `.env.example` s'il n'existe pas, puis limiter ses permissions :

```bash
test -e .env || install -m 0600 .env.example .env
chmod 600 .env
```

Renseigner ces paramètres dans ce fichier avec un éditeur local :

| Variable | Valeur à préparer |
| --- | --- |
| `SITE_ADMIN_ENABLED` | `true` |
| `SITE_ADMIN_USERNAME` | Identifiant de 3 à 64 lettres ASCII, chiffres, points, tirets ou tirets bas |
| `SITE_ADMIN_PASSWORD` | Mot de passe initial unique de 12 à 128 caractères |
| `SITE_SECRET_KEY` | Clé Fernet générée ci-dessous, à conserver durablement |
| `SITE_ADMIN_ORIGIN` | `http://127.0.0.1:5173` avec Vite ; `https://new.thibault-leveau.com` en production |

Générer la clé de chiffrement sur le serveur, puis copier sa valeur dans `SITE_SECRET_KEY` et dans une sauvegarde protégée :

```bash
uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

Ne publier ni cette sortie ni le mot de passe dans Git, une issue ou les journaux. Le fichier `.env` est exclu du contexte Docker et de Git. Les paramètres ne sont jamais injectés dans les bundles Vite.

En local, lancer `make dev`, puis ouvrir `http://127.0.0.1:5173/admin`. Pour tester le build directement avec FastAPI sur le port 8000, définir l'origine `http://127.0.0.1:8000` avant de lancer le processus. En production, suivre le [déploiement](deployment.md), puis ouvrir `https://new.thibault-leveau.com/admin`. L'origine doit correspondre exactement à l'adresse du navigateur, sans chemin ni slash final.

Au premier démarrage activé, le compte est créé dans SQLite. Après une première connexion réussie, retirer la valeur `SITE_ADMIN_PASSWORD` du fichier d'environnement et recréer le service pour ne plus la conserver dans son environnement. Le mot de passe haché en base suffit ensuite. Modifier `SITE_ADMIN_USERNAME` ou `SITE_ADMIN_PASSWORD` ne remplace jamais un compte existant.

Sans activation, `/admin` présente un message de configuration et l'API privée répond 503. Aucune clé LLM n'est requise pour se connecter et gérer le compte ; le chat attend qu'une clé soit enregistrée.

## Naviguer dans l'espace

La sidebar regroupe **Chat**, **Projets**, **Parcours** (expériences, formations, certifications, distinctions), **Services**, **Publications** (articles et interventions), **Témoignages**, **Référentiels** (compétences, technologies, organisations, catégories et tags), **Médias** et **Mon profil**. Les groupes et les réglages du bas utilisent un second menu accolé, un seul à la fois.

Sur tablette, un rail et la commande **Menu** donnent accès à la navigation complète. Sous 600 pixels, le formulaire dispose de toute la largeur et Menu ouvre un panneau. Le contenu derrière ce panneau est inerte. `Échap` le ferme et rend le focus à une commande visible ; la navigation peut défiler indépendamment sur un écran bas.

Le thème partage la préférence de l'accueil. Le lien « Voir le site » revient à l'accueil. La déconnexion révoque la session et efface la conversation. Une saisie de contenu non enregistrée demande d'abord de rester, d'enregistrer ou de l'abandonner.

## Renseigner une fiche

1. Ouvrir la collection et **Nouvelle fiche**. Un titre suffit pour créer un brouillon ; les valeurs fournies doivent être valides.
2. Utiliser les sections locales. Un projet sépare **Essentiel**, **Contexte et dates**, **Contribution et résultats**, **Compétences et stack**, **Liens et médias**, **Relecture**. Les autres fiches ne montrent que les sections utiles à leur modèle.
3. Choisir les références existantes avec recherche. Une organisation peut être créée rapidement depuis son sélecteur ; le projet conserve sa saisie. Les noms proches sont suggérés avant de créer un doublon.
4. Ajouter les lignes structurées et utiliser Monter, Descendre ou Retirer. Retirer une association ne supprime jamais la fiche associée.
5. **Enregistrer le brouillon** sauvegarde toutes les sections. **Vérifier la fiche** contrôle la saisie sans l'enregistrer ; le récapitulatif conduit au champ concerné, y compris dans une autre section.
6. Dans Relecture, **Enregistrer et marquer prêt** applique le minimum éditorial propre à ce type. Prêt ne publie rien sur le site. Une fiche prête devenue incomplète peut être **enregistrée en brouillon**.

Une date peut être `2024`, `2024-06` ou `2024-06-15`. « En cours » exclut une fin ; une absence motivée distingue une date inconnue. Un projet professionnel peut exister sans emploi associé, et un projet personnel sans organisation. Responsabilités, actions et résultats sont distincts. Le prix « sur devis » laisse le montant vide ; un montant `0.00` est un prix nul explicite, conservé exactement.

Le statut et la diffusion envisagée sont indépendants. L'aperçu exclut les notes privées, les justificatifs et les références confidentielles. Pour voir une image associée dans cet aperçu, renseigner sa diffusion envisagée comme publique dans sa fiche média, son rôle et son alternative dans la fiche qui l'utilise. Le fichier reste protégé par la session. Le corps des articles accepte le Markdown, avec aperçu sûr ; les images distantes ne sont pas chargées automatiquement.

Les collections permettent recherche sans accents, filtre d'état, de nature, de référence et tri. Le profil est unique. Les usages sont consultables en bas de fiche. **Dupliquer** crée un brouillon avec un nouveau slug et réutilise les références ; médias et profil ne se dupliquent pas. **Archiver** conserve les données ; restaurer repasse en brouillon. La suppression définitive exige une archive sans usages et une confirmation explicite.

## Saisie non enregistrée et conflits

Il n'y a pas d'enregistrement automatique. Une navigation, une sortie vers l'accueil, une déconnexion ou un rechargement avertit d'une saisie modifiée. Les erreurs réseau conservent les champs. Une expiration de session masque la fiche, puis restaure sa saisie après reconnexion dans le même onglet. Aucune copie n'est placée dans `localStorage` ; fermer l'onglet peut perdre les modifications.

Deux onglets ne s'écrasent pas silencieusement : l'API compare la version lue, y compris après une modification d'association réciproque. Un conflit conserve la saisie et propose de recharger la version enregistrée avec confirmation. Copier auparavant les passages à conserver si nécessaire ; aucun bouton ne force un écrasement.

## Ajouter des médias

Dans **Médias**, téléverser une image JPEG/PNG/WebP, un PDF ou une vidéo MP4/WebM ; l'envoi montre sa progression et peut être annulé. Renseigner ensuite crédits, origine/licence et notes. **Ajouter un lien** crée un média externe, sans téléchargement serveur. Les fichiers sont réutilisables ; alternative, légende, rôle et transcription appartiennent à chaque usage dans une fiche.

Limites : images fixes 10 Mio et 20 millions de pixels, PDF 20 Mio, vidéos 100 Mio ; quota cumulé 1 Gio par défaut. Les archives occupent encore du stockage. Les fichiers restent privés et les PDF se téléchargent. Il n'y a ni antivirus ni transcodage ; un contrôle de format n'est pas une garantie sur le contenu d'un document ou d'une vidéo. Voir la [configuration](configuration.md) et les [sauvegardes](operations.md#sauvegarde-du-studio-base-et-medias).

Aucun fournisseur LLM n'est nécessaire pour utiliser ces fonctions. Les contenus ne lui sont pas transmis.

## Configurer AI provider

1. Ouvrir **Réglages du site → AI provider**.
2. Choisir **OpenAI**, **Anthropic** ou **Mistral**.
3. Vérifier l'identifiant du modèle et son accès sur le compte fournisseur. Un modèle proposé est prérempli ; le champ reste modifiable.
4. Saisir une clé API valide du fournisseur choisi, puis **Enregistrer les réglages**.

Les modèles préremplis sont `gpt-6-luna`, `claude-sonnet-4-6` et `mistral-small-latest`. Les catalogues et droits évoluent : consulter les [modèles OpenAI](https://developers.openai.com/api/docs/models), [modèles Anthropic](https://platform.claude.com/docs/en/models/overview) ou [modèles Mistral](https://docs.mistral.ai/getting-started/models). Pour Anthropic, utiliser une clé limitée au workspace voulu : l'adaptateur n'envoie pas d'identifiant de workspace distinct.

Après enregistrement, le champ se vide et indique qu'une clé existe. La clé est chiffrée en base et n'est jamais renvoyée par l'API. Laisser le champ vide conserve la clé du fournisseur actuel ; changer de fournisseur demande une nouvelle clé. **Retirer la clé** supprime la clé enregistrée et désactive l'envoi du chat. Un changement de fournisseur ou de modèle démarre une nouvelle conversation.

L'enregistrement vérifie le format des réglages, sans appel facturé. Le premier message vérifie réellement l'accès à la clé et au modèle. Les erreurs de quota, d'accès ou de délai sont affichées sans exposer la réponse brute du fournisseur.

## Utiliser le chat

Saisir un message puis cliquer sur la flèche d'envoi, ou appuyer sur `Entrée`. `Maj+Entrée` insère une ligne. Les suggestions remplissent le champ sans envoyer automatiquement de requête. **Nouvelle conversation** efface les messages de l'onglet.

Le chat accepte du texte et affiche les réponses comme du texte, y compris tout HTML éventuel. Il ne lance pas de code, ne charge pas de fichier et ne navigue pas sur le Web. Une demande est traitée à la fois ; la réponse complète apparaît après génération. En cas d'erreur, le brouillon est restauré pour permettre de réessayer.

| Limite | Valeur |
| --- | --- |
| Message utilisateur | 4 000 caractères |
| Historique envoyé | 40 messages et 40 000 caractères au maximum |
| Réponse affichable | 20 000 caractères, budget demandé de 4 096 tokens |
| Fréquence du compte | 10 tentatives d'envoi par minute |
| Attente maximale côté serveur | 65 secondes |

Ouvrir une nouvelle conversation lorsque l'historique atteint la limite. Le serveur ne sauvegarde pas les conversations : recharger l'onglet, se déconnecter ou changer de modèle les efface. Les réglages et la clé persistent en revanche après un redémarrage.

Chaque envoi transmet l'historique visible au fournisseur sélectionné, selon ses conditions de conservation et de facturation. OpenAI reçoit `store=false` ; cela ne constitue pas une garantie générale d'absence de conservation par un fournisseur. Aucun abonnement ni crédit API n'est fourni par ce site.

## Modifier Admin user

Ouvrir **Réglages du site → Admin user**, modifier le nom et/ou saisir un nouveau mot de passe, puis confirmer avec le mot de passe actuel. Le nouveau mot de passe doit comporter au moins 12 caractères ; le laisser vide conserve celui qui existe. Sa confirmation doit être identique.

Après modification, toutes les sessions sont révoquées et l'écran de connexion réapparaît. Utiliser les nouveaux identifiants dans tous les onglets. La session expire aussi au bout de 12 heures, sans prolongation automatique. Les tentatives de connexion et de vérification du mot de passe sont limitées à 5 par adresse et 30 globalement sur 15 minutes, y compris les tentatives réussies.

En cas d'oubli, utiliser la [récupération locale du compte](operations.md#recuperer-le-compte-administrateur). La base ne doit pas être supprimée : elle contient aussi les réglages du fournisseur. Les problèmes d'origine, de clé et de démarrage sont détaillés dans le [dépannage](troubleshooting.md#administration-et-fournisseurs-llm).
