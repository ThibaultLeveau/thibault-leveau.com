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

**Raison.** Il n'existe qu'une page du site et aucun routage client à préserver. Une erreur de ressource doit rester visible dans les tests et les outils réseau.

**Conséquence.** L'ajout de pages nécessite de définir leur routage. Il ne suffit pas d'ajouter une URL dans le navigateur pour qu'elle soit distribuée par le serveur.

## Documentation intégrée sous un préfixe

**Décision.** MkDocs Material est publié sous `/documentation/` avec recherche locale, langue française et modes clair/sombre.

**Raison.** L'architecture et les procédures restent accessibles à côté du site, avec un outil consacré à la documentation. Les polices système évitent un chargement Google Fonts.

**Conséquence.** Le préfixe doit être conservé dans `site_url`, les liens et les tests. La préférence de thème documentaire reste indépendante de celle du site.

## Pas de stockage serveur initial

**Décision.** Aucune base de données, authentification ou administration n'est intégrée. Le thème est stocké dans le navigateur lorsqu'il l'autorise.

**Raison.** L'accueil ne collecte pas de données et n'a pas de contenu dynamique à administrer.

**Conséquence.** Il n'y a pas de migration métier ni de données utilisateur à sauvegarder. Une future collecte de données devra introduire explicitement ses règles d'accès, de conservation et d'exploitation.

## Site public, indexation désactivée

**Décision.** Le site est public mais répond par défaut avec `X-Robots-Tag: noindex, nofollow`.

**Raison.** Le sous-domaine sert la première version du site avant un éventuel élargissement du contenu.

**Conséquence.** Ce mécanisme s'adresse aux moteurs qui le respectent ; il ne restreint pas l'accès aux visiteurs. Activer l'indexation est un changement explicite de configuration, distinct de la publication technique.

## Proxy existant et réseau privé

**Décision.** L'application rejoint `multisite_proxy` sous un alias dédié. Le Caddy de la plateforme gère HTTPS et la compression. Aucun port applicatif n'est publié sur l'hôte.

**Raison.** Le serveur dispose déjà d'un point d'entrée mutualisé. Un bloc isolé par domaine permet d'y ajouter le site avec une configuration limitée.

**Conséquence.** Le déploiement dépend du réseau et de Caddy existants. Une intervention doit préserver les autres sites, leurs routes et les données du proxy.

## Déploiement manuel, contrôles automatisés

**Décision.** GitHub Actions vérifie le code, les sorties, les parcours et l'image. Le démarrage en production reste une opération manuelle documentée, avec un tag de commit.

**Raison.** Le volume et le périmètre initiaux ne nécessitent pas d'automatiser des écritures sur un serveur partagé ou sa zone DNS.

**Conséquence.** Un push sur `main` ne publie pas le site. L'opérateur choisit un commit validé, conserve l'image précédente et effectue les contrôles publics après remplacement. Le service unique peut connaître une courte interruption pendant sa recréation.
