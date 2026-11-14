# Décisions techniques

Cette page conserve les raisons des choix structurants. Une évolution qui change ces contraintes doit mettre à jour la décision concernée et les procédures associées.

## Un dépôt et une image applicative

**Décision.** Le backend, le frontend, les pages documentaires et les configurations de construction vivent dans le même dépôt. Ils sont publiés ensemble dans une image applicative.

**Raison.** Le site initial est petit et les trois sorties partagent la même version. Une contribution peut mettre à jour son code, ses tests et sa documentation sans coordonner plusieurs publications.

**Conséquence.** Une correction documentaire demande une nouvelle image, même si Python ne change pas. La contrepartie est un déploiement cohérent et un retour arrière unique.

## FastAPI et frontend compilé

**Décision.** FastAPI sert l'API et les fichiers construits par React/Vite. Node.js intervient dans le développement et la compilation, sans processus Node.js permanent en production.

**Raison.** Cette organisation respecte le choix Python tout en permettant une interface TypeScript moderne et une construction optimisée du frontend.

**Conséquence.** L'accueil dépend de JavaScript pour son rendu React. Le thème est initialisé séparément avant ce rendu. Le socle ne fournit pas de rendu serveur React ; ce besoin pourra être réévalué si le contenu ou les objectifs de référencement évoluent.

## Routes explicites et vraies erreurs 404

**Décision.** Les fichiers absents et routes inconnues répondent 404. Aucun repli universel vers l'accueil n'est configuré.

**Raison.** L'accueil et l'administration ont chacun une route explicite, sans routeur client supplémentaire. Une erreur de ressource doit rester visible dans les tests et les outils réseau.

**Conséquence.** L'ajout de pages nécessite de définir leur routage. Il ne suffit pas d'ajouter une URL dans le navigateur pour qu'elle soit distribuée par le serveur.

## Documentation intégrée sous un préfixe

**Décision.** MkDocs Material est publié sous `/documentation/` avec recherche locale, langue française et modes clair/sombre.

**Raison.** L'architecture et les procédures restent accessibles à côté du site, avec un outil consacré à la documentation. Les polices système évitent un chargement Google Fonts.

**Conséquence.** Le préfixe doit être conservé dans `site_url`, les liens et les tests. La préférence de thème documentaire reste indépendante de celle du site.

## Pas de stockage serveur initial

**Décision initiale, remplacée pour l'administration par l'accord de l'issue #3.** Le premier accueil n'intégrait ni base de données ni compte. Le thème reste stocké dans le navigateur lorsqu'il l'autorise.

**Raison.** L'accueil ne collecte pas de données et n'a pas de contenu dynamique à administrer.

**Conséquence actuelle.** L'accueil public reste sans collecte ; l'administration introduit les données et procédures décrites ci-dessous.

## Administration dans le service existant — issue #3

**Accord.** Thibault a explicitement validé l'évolution proposée (« Je valide »), consignée dans l'[issue #3](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/3). L'accord couvre `/admin`, les API privées FastAPI, un compte unique, SQLite durable, sessions sécurisées et clé LLM chiffrée.

**Décision.** Réutiliser React/Vite et FastAPI, sans routeur ni service additionnel. Initialiser le compte par variables d'environnement uniquement lorsque la base est vide ; conserver ensuite les changements de nom et de mot de passe dans SQLite sur le volume `admin_data`. L'administration reste désactivée par défaut.

**Raison.** Un simple fichier d'environnement ne peut pas conserver les modifications depuis l'interface sans modifier la configuration du déploiement. SQLite apporte des transactions et une persistance locale adaptée à ce compte unique.

**Conséquence.** La base et `SITE_SECRET_KEY` demandent des sauvegardes. Les variables initiales ne sont pas un mécanisme de récupération ; une commande locale dédiée réinitialise le compte et révoque les sessions. Ne pas supprimer le volume pour changer un mot de passe. Plusieurs instances ou comptes nécessiteraient une autre décision.

## Sessions, mot de passe et clé fournisseur

**Décision.** Hacher les mots de passe avec scrypt (sel aléatoire, N=32768, r=8, p=3), stocker seulement l'empreinte SHA-256 des jetons de session aléatoires, expirer les sessions après 12 heures et toutes les révoquer après une modification du compte. Le cookie est `HttpOnly`, `SameSite=Strict`, limité à `/api/admin` et `Secure` en HTTPS. Les mutations exigent l'origine exacte et un jeton CSRF ; la connexion exige l'origine exacte. HTTP est réservé à la boucle locale.

**Décision.** Chiffrer la clé fournisseur avec Fernet (`cryptography`) et une clé serveur distincte de SQLite. L'API expose seulement sa présence ; une valeur vide conserve la clé et un retrait explicite la supprime. Les pages privées sont sans cache, sans indexation et protégées par CSP. Les tentatives d'identifiants et de chat sont limitées en base pour conserver ces limites au redémarrage.

**Conséquence.** Perdre `SITE_SECRET_KEY` empêche de déchiffrer la clé fournisseur ; la conserver lors des déploiements. Ce chiffrement protège une copie de la base seule, pas un serveur compromis disposant des deux éléments. La récupération et les sauvegardes sont décrites dans [Exploitation](operations.md).

## Chat texte et destinations LLM fixes

**Décision.** FastAPI appelle les API natives OpenAI, Anthropic ou Mistral via HTTPX, avec des URL fixes, sans redirection ni proxy hérité de l'environnement. Les identifiants de modèle sont configurables. L'interface attend une réponse complète en texte, sans streaming, outils, fichiers ni exécution de HTML.

**Raison.** Ces adaptateurs répondent au besoin de chat simple et gardent la clé côté serveur sans multiplier les SDK. Les destinations fixes évitent qu'un paramètre utilisateur devienne une URL arbitraire appelée par le serveur.

**Conséquence.** Une conversation reste dans la mémoire de l'onglet ; rechargement, déconnexion, changement de fournisseur ou de modèle la réinitialisent. Les limites de taille et de durée sont explicites. La conservation et les coûts externes dépendent du fournisseur ; les tests simulent ses réponses et n'engagent aucune dépense API.

## Site public, indexation désactivée

**Décision.** Le site est public mais répond par défaut avec `X-Robots-Tag: noindex, nofollow`.

**Raison.** Le sous-domaine sert la première version du site avant un éventuel élargissement du contenu.

**Conséquence.** Ce mécanisme s'adresse aux moteurs qui le respectent ; il ne restreint pas l'accès aux visiteurs. Activer l'indexation est distinct de la publication technique. `/admin` et `/api/admin/*` restent toujours non indexables ; leurs données sont protégées par la session, indépendamment de cette directive.

## Proxy existant et réseau privé

**Décision.** L'application rejoint `multisite_proxy` sous un alias dédié. Le Caddy de la plateforme gère HTTPS et la compression. Aucun port applicatif n'est publié sur l'hôte.

**Raison.** Le serveur dispose déjà d'un point d'entrée mutualisé. Un bloc isolé par domaine permet d'y ajouter le site avec une configuration limitée.

**Conséquence.** Le déploiement dépend du réseau et de Caddy existants. Une intervention doit préserver les autres sites, leurs routes et les données du proxy.

## Déploiement manuel, contrôles automatisés

**Décision.** GitHub Actions vérifie le code, les sorties, les parcours et l'image. Le démarrage en production reste une opération manuelle documentée, avec un tag de commit.

**Raison.** Le volume et le périmètre initiaux ne nécessitent pas d'automatiser des écritures sur un serveur partagé ou sa zone DNS.

**Conséquence.** Un push sur `main` ne publie pas le site. L'opérateur choisit un commit validé, conserve l'image précédente et effectue les contrôles publics après remplacement. Le service unique peut connaître une courte interruption pendant sa recréation.
