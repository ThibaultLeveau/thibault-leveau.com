# Documentation technique

Ce guide décrit le fonctionnement et l'exploitation de **new.thibault-leveau.com**, le site personnel de Thibault Leveau. Il accompagne les sources du dépôt : les procédures, paramètres et contrats HTTP évoluent avec le code.

Le site public organise quinze collections en huit pages : accueil, projets, parcours, expertise, services, journal, à propos et recherche Explorer, avec thèmes clair/sombre. L'administration privée sous `/admin` réunit le studio de contenus, un assistant LangChain/LangGraph, les préférences de rédaction, les réglages du fournisseur et un compte unique. La documentation reste publique sous `/documentation/`.

## Choisir son parcours

| Besoin | Point d'entrée |
| --- | --- |
| Exécuter le projet localement | [Installation et développement](getting-started.md) |
| Comprendre les services et les fichiers | [Architecture](architecture.md) |
| Modifier un paramètre | [Configuration](configuration.md) |
| Activer l'administration et utiliser l'assistant | [Administration et chat LLM](administration.md) |
| Faire évoluer une route | [Backend et contrat HTTP](backend.md) |
| Modifier le rendu ou le thème | [Frontend](frontend.md) et [design](design-system.md) |
| Vérifier une contribution | [Tests et intégration continue](testing.md) |
| Publier une version | [Déploiement](deployment.md) |
| Diagnostiquer un incident | [Exploitation](operations.md) et [dépannage](troubleshooting.md) |

## Repères

| Élément | Valeur |
| --- | --- |
| Domaine public | `https://new.thibault-leveau.com` |
| Documentation publique | `https://new.thibault-leveau.com/documentation/` |
| Dépôt | [ThibaultLeveau/thibault-leveau.com](https://github.com/ThibaultLeveau/thibault-leveau.com) |
| Branche principale | `main` |
| Python | 3.13 |
| Node.js | 24, uniquement nécessaire au développement et à la construction |
| Backend | FastAPI, lancé par Uvicorn |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Documentation | MkDocs Material |
| Exécution en production | Un conteneur applicatif derrière Caddy |

## Lecture des procédures

Les commandes s'exécutent depuis la racine du dépôt, sauf indication contraire. Les commandes Docker de production supposent un accès au serveur et au démon Docker. Les opérations sur le proxy et le DNS sont signalées dans la procédure de déploiement : elles concernent l'infrastructure partagée.

`build/`, `.venv/` et `frontend/node_modules/` sont des résultats locaux, non des sources à modifier. Une correction doit porter sur le code ou la configuration qui les génère, puis être reconstruite.

L'en-tête `X-Robots-Tag: noindex, nofollow` demande aux moteurs de ne pas indexer le site. Le contenu demeure public : ne placer aucun secret dans les pages, les exemples, le frontend ou les fichiers de configuration suivis par Git.

L’[assistant de contenus](assistant-design.md) prépare les quinze collections, pose les questions utiles et présente les changements avant leur enregistrement. Les modèles métier et les transactions restent communs aux agents et aux formulaires manuels.
