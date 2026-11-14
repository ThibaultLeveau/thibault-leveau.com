# Consignes pour les agents

Ces règles s’appliquent à l’ensemble du dépôt et à chaque demande de travail.

## Design et documentation obligatoires

- Maintenir un design très moderne, soigné et épuré sur toutes les interfaces, y compris l’administration.
- Prévoir systématiquement des thèmes clair et sombre cohérents avec le [guide de design](docs/design-system.md) et les variables visuelles existantes.
- Vérifier la lisibilité, les contrastes, la navigation clavier, les états de focus et le rendu responsive dans les deux thèmes, sur ordinateur et mobile.
- Conserver une hiérarchie visuelle claire, des espacements généreux et des interactions simples ; éviter les ornements et informations sans utilité.
- Documenter chaque fonctionnalité et toute évolution de configuration, d’API, de sécurité ou d’exploitation dans les pages MkDocs concernées.

## Architecture obligatoire

- Lire les documents pertinents avant toute modification : [README](README.md), [architecture](docs/architecture.md), [décisions techniques](docs/decisions.md) et [tests](docs/testing.md).
- Respecter obligatoirement l’architecture, l’organisation des fichiers, les frontières de responsabilité et les conventions existantes.
- Conserver la répartition actuelle : React/Vite pour le frontend, FastAPI pour l’API et la distribution des fichiers, MkDocs pour la documentation, Docker Compose pour le service et Caddy pour le proxy HTTPS.
- Si une demande nécessite une évolution de l’architecture (nouveau service, framework, stockage, authentification, routage ou déplacement de responsabilités), expliquer à Thibault le besoin, la proposition et ses impacts, puis lui demander son accord explicite **avant de l’implémenter**. Ne pas considérer la demande fonctionnelle seule comme une validation de cette évolution.
- Consigner l’accord dans l’issue et mettre à jour la documentation d’architecture et les décisions techniques avec l’évolution approuvée.

## Workflow obligatoire pour chaque demande

1. **Créer une issue GitHub avant de modifier le dépôt.** Y détailler la demande, le contexte, le périmètre, les critères d’acceptation, les éventuels impacts d’architecture et les vérifications prévues. Pour la continuation d’une même demande, compléter son issue existante.
2. **Créer ensuite une branche dédiée** à partir de la branche principale à jour. Inclure le numéro de l’issue dans son nom, par exemple `fix/12-description` ou `docs/12-description`. Ne pas travailler ni pousser directement sur `main`.
3. **Réaliser les changements** dans cette branche en suivant l’architecture validée. Mettre à jour l’issue avec les décisions et les éventuels blocages.
4. **Tester avant d’ouvrir la pull request.** Suivre `docs/testing.md`, exécuter les contrôles adaptés et consigner les commandes ainsi que leurs résultats. Ajouter ou adapter des tests lorsque le comportement modifié le nécessite. Corriger les échecs liés au changement ; signaler clairement toute vérification impossible sans la présenter comme réussie.
5. **Ouvrir une pull request GitHub (merge request)** vers `main`, avec un résumé du problème, des changements et des validations. La relier à l’issue avec `Closes #<numéro>`.
6. **Effectuer une revue de code avant la fusion.** Examiner le diff final : conformité à la demande et à l’architecture, régressions, sécurité, tests et documentation. Consigner les conclusions dans la pull request, en précisant s’il s’agit d’une auto-revue ou d’une revue indépendante. Corriger les points bloquants et relancer les vérifications concernées après chaque correction. Une auto-revue ne remplace pas une approbation indépendante exigée par GitHub.
7. **Fusionner après validation.** Attendre la réussite de la CI sur la version finale et la résolution des points bloquants de revue. Respecter les protections de branche et les approbations requises, sans les contourner. Si une condition empêche la fusion, documenter le blocage et le signaler à Thibault.
8. **Déployer en production après la fusion.** Sauf instruction explicite contraire de Thibault, le déploiement fait partie de chaque livraison, y compris documentaire ; ne pas s’arrêter à la fusion. Appliquer [la procédure de déploiement](docs/deployment.md) depuis `main` validé, avec un arbre propre et une image identifiée par le commit. Conserver l’image précédente, sauvegarder les données concernées et vérifier la compatibilité des migrations avant de remplacer uniquement le service du site. Préserver les secrets, les volumes et les autres sites de la plateforme.
9. **Vérifier la production.** Contrôler la version réellement exécutée, la santé du conteneur, les réponses HTTPS et les parcours concernés sur le site déployé. Suivre [les contrôles d’exploitation](docs/operations.md) et vérifier bureau/mobile, clair/sombre et clavier lorsque l’interface est concernée. En cas d’échec, diagnostiquer et appliquer le retour arrière adapté ; ne pas présenter une fusion ou une CI verte comme un déploiement réussi. Documenter tout blocage réel et le signaler à Thibault.
10. **Vérifier la clôture de l’issue et rendre compte** avec les liens vers l’issue et la pull request, les tests réalisés, le résultat de la fusion, le commit/image réellement déployé, l’URL de production et les contrôles après déploiement. Une clôture automatique à la fusion ne suffit pas à terminer la demande : compléter l’issue avec le résultat du déploiement.

La fusion et le déploiement en production sont autorisés dans le cadre de ce workflow une fois leurs conditions remplies, sans demander une nouvelle confirmation. Toute évolution d’architecture reste soumise à l’accord explicite décrit ci-dessus.
