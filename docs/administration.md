# Administration et chat LLM

L'espace privé est accessible à **`/admin`**. Il contient un chat texte, le choix du fournisseur LLM et la gestion d'un compte administrateur unique. L'accueil public et la documentation restent accessibles sans connexion.

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

Le premier menu latéral contient **Chat**. Le bouton **Réglages du site**, placé en bas, ouvre un second menu accolé au premier, avec **AI provider** et **Admin user**. Sur petit écran, le premier menu devient une barre d'icônes ; le second se superpose au contenu tout en restant accolé. La touche `Échap` referme ce menu et rend le focus au bouton des réglages.

Le sélecteur de thème en haut bascule entre clair et sombre et partage la préférence de l'accueil. Le lien « Voir le site » retourne à l'accueil. La déconnexion efface la session courante et la conversation en mémoire.

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
