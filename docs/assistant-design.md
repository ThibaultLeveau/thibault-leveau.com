# Assistant de contenus et agents

Cette conception répond à l'[issue #12](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/12). **Thibault l'a explicitement approuvée (« J'accepte »), accord [consigné avant implémentation](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/12#issuecomment-6880648679).** L'implémentation et sa livraison sont suivies dans la [PR #13](https://github.com/ThibaultLeveau/thibault-leveau.com/pull/13). Le [guide administratif](administration.md#utiliser-lassistant-de-contenus) décrit son utilisation.

## Résultat attendu

Depuis l'accueil de l'administration, décrire une réalisation, un parcours ou une offre, répondre aux précisions utiles, relire les champs proposés et enregistrer les fiches correspondantes. Une demande peut créer plusieurs références et les associer au contenu principal, ou modifier seulement certains champs d'une fiche existante. Les formulaires manuels restent utilisables avec les mêmes règles métier.

L'assistant distingue les faits fournis, les reformulations éditoriales et les informations manquantes. Il demande une précision lorsque l'identité de la fiche, une association ou un fait nécessaire est incertain. Il peut préparer un brouillon incomplet quand les éléments absents sont facultatifs ; il ne transforme pas chaque champ vide en question obligatoire. Dates, diplômes, chiffres, niveaux de compétence, citations, consentements et licences ne doivent pas être inventés.

La génération n'enregistre aucun contenu métier. Le résultat présente les modifications, les champs laissés vides et les références utilisées. Une commande explicite applique le lot relu, puis confirme les fiches réellement enregistrées avec des liens vers leurs éditeurs. Les nouvelles fiches restent en brouillon. Une fiche déjà Prêt + Public est visible sur le site ; appliquer sa modification actualise sa projection publique.

## Inventaire de couverture

Inventaire produit à partir de `content/schemas.py` et `content/catalog.py` au commit `d81ed9d`. Les nombres correspondent aux champs de premier niveau, listes comprises ; les sous-champs de chaque ligne font également partie du périmètre. Les relations peuvent être scalaires ou répétables.

| Collection | Identifiant | Champs | Listes | Relations |
| --- | --- | --- | --- | --- |
| Projets | `projects` | 47 | 15 | 10 |
| Expériences | `experiences` | 35 | 11 | 6 |
| Compétences | `skills` | 22 | 5 | 3 |
| Technologies | `technologies` | 20 | 5 | 2 |
| Formations | `educations` | 29 | 6 | 5 |
| Certifications | `certifications` | 27 | 5 | 5 |
| Services | `services` | 38 | 14 | 6 |
| Articles | `posts` | 22 | 7 | 6 |
| Interventions et publications | `publications` | 29 | 7 | 6 |
| Témoignages | `testimonials` | 30 | 7 | 6 |
| Distinctions | `awards` | 22 | 6 | 5 |
| Mon profil | `profiles` | 23 | 6 | 2 |
| Organisations | `organizations` | 20 | 5 | 2 |
| Catégories et tags | `taxonomies` | 17 | 4 | 2 |
| Médias | `media` | 22 | 4 | 2 |

Les 403 emplacements de premier niveau incluent les champs communs à plusieurs collections. Ce décompte sert à contrôler la couverture ; il ne justifie pas de remplir un champ sans information. Les contrats de génération doivent être dérivés des modèles pour qu'une évolution du studio ne laisse pas silencieusement un champ inaccessible.

Le profil unique possède actuellement 23 champs, dont langues, intérêts, liens, lieux et médias. Une demande de « profil complet » peut aussi concerner les expériences, formations, compétences et offres : le plan doit expliciter ces fiches distinctes au lieu d'entasser leur contenu dans la biographie. Les agents ne créent pas de nouvelles pages ou de nouveaux champs absents du modèle.

Les médias couvrent métadonnées, URL externes et associations avec alternative, légende, transcription ou crédits fournis. Un fichier réel apporté par l'utilisateur réutilise le téléversement privé et ses contrôles existants. Aucun agent ne peut déclarer un fichier téléversé sans résultat de cette API, ni déduire une autorisation de diffusion d'une simple description.

## Architecture et impacts

LangChain et LangGraph fonctionnent dans le processus FastAPI existant, avec des versions verrouillées dans `uv.lock`. Les adaptateurs gardent OpenAI, Anthropic et Mistral et leurs réglages actuels. Les intégrations fournisseurs sont isolées derrière une interface testable ; une incompatibilité de modèle doit produire un message explicite. Les URL de destination, les clés chiffrées, l'absence de redirection et les limites réseau restent contrôlées par le serveur.

LangChain fournit les agents, outils et réponses structurées ; un graphe LangGraph organise les étapes et la délégation. Les mécanismes retenus sont documentés dans les guides officiels sur les [agents](https://docs.langchain.com/oss/python/langchain/agents), les [sorties structurées](https://docs.langchain.com/oss/python/langchain/structured-output) et l'[orchestration avec travailleurs](https://docs.langchain.com/oss/python/langgraph/workflows-agents). Le studio choisit explicitement `ToolStrategy` et des schémas Pydantic dérivés des modèles métier, puis distribue les travailleurs avec `Send` dans un `StateGraph`.

L'évolution ajoute des dépendances, des API privées et des tables dans la base SQLite existante. Elle entraîne plusieurs appels facturables et davantage de latence pour les demandes complexes. Les fiches pertinentes pour la demande seront transmises au fournisseur ; les notes privées non demandées et les fichiers binaires sont exclus du contexte envoyé. Il n'y a pas de service supplémentaire, de base vectorielle, de modification du proxy ou d'authentification nouvelle.

L'accord exigé par `AGENTS.md` est consigné dans l'issue, les [décisions techniques](decisions.md) et l'[architecture](architecture.md).

## Frontières du code

| Module | Responsabilité |
| --- | --- |
| `api/assistant.py` | Session, CSRF, validation HTTP, conversion des erreurs et limites d'accès |
| `assistant/contracts.py` | États, demandes, questions, plans, propositions, résultats et préférences typés |
| `assistant/registry.py` | Collections et champs autorisés, contrats dérivés du catalogue, attribution aux spécialistes |
| `assistant/prompts/` | Instructions système versionnées et règles de rédaction, indépendantes des routes |
| `assistant/models.py` | Adaptation LangChain des fournisseurs configurés, transport, capacités et budgets |
| `assistant/tools.py` | Outils de recherche et lecture des fiches et de leurs références, avec contexte borné |
| `assistant/graph.py` et `assistant/agents/` | Orchestration, spécialistes, consolidation et traitement des précisions |
| `assistant/proposals.py` | Construction, contrôle, différences, expiration et orchestration de l'application |
| `assistant/store.py` | Persistance des préférences et propositions, sans dupliquer les écritures métier |
| `content/` | Validation et transactions métier, étendues pour appliquer un lot atomique |
| `frontend/src/admin/assistant/` | Conversation, questions, relecture des champs et préférences |

Les modèles métier et les permissions restent indépendants de LangChain. Les agents ne reçoivent ni connexion SQLite, ni SQL arbitraire, ni outil shell. Le graphe reçoit ses dépendances explicitement pour être testé avec des modèles simulés. Ajouter un spécialiste ne doit pas exiger de modifier les routes ou de réécrire les règles de sauvegarde.

## Orchestration et clarification

```text
Message et préférences
        │
        ▼
Compréhension et recherche du contexte utile
        │
        ├── Faits insuffisants ou cible ambiguë → Questions → Réponse suivante
        │
        ▼
Plan typé avec fiches et champs concernés
        │
        ├── Demande simple → Spécialiste concerné
        └── Demande complexe → Sous-agents ciblés → Consolidation
                                                    │
                                                    ▼
                                      Validation métier et différences
                                                    │
                                                    ▼
                                           Proposition à relire
                                                    │
                                             Action utilisateur
                                                    ▼
                                   Revalidation et transaction atomique
```

Le coordinateur sélectionne les domaines utiles : identité/profil, parcours, expertise/référentiels, offres ou rédaction/publications. LangGraph peut lancer des travailleurs distincts pour les sections identifiées. Chaque travailleur reçoit un périmètre de champs et un contexte limités ; il retourne des données structurées ou des questions au coordinateur, sans écrire dans la base. Cette isolation s'appuie sur le principe des [sous-agents LangChain](https://docs.langchain.com/oss/python/langchain/multi-agent/subagents).

La consolidation traite explicitement les désaccords sur un même champ, les doublons et les relations. Le coordinateur regroupe les questions pour éviter que plusieurs spécialistes redemandent la même information. L'échec d'une branche ne doit pas produire une proposition présentée comme complète. Des limites sur le nombre de tâches, d'appels, d'outils, de tentatives, de travailleurs simultanés et sur la durée totale interdisent une récursion sans fin. Une réparation de sortie invalide reste bornée.

La conversation demeure en mémoire dans l'onglet. Les messages envoyés par le navigateur ne peuvent pas se faire passer pour des instructions système, des résultats d'outils ou une preuve d'enregistrement. Le contexte métier est relu côté serveur. Les documents et champs consultés sont des données, jamais une autorisation d'élargir les outils ou les droits.

## Propositions et écriture fiable

Une proposition validée conserve côté serveur un identifiant opaque, les opérations, les fiches sources et leurs versions, les valeurs avant/après, les dépendances entre nouvelles fiches, les questions résiduelles et sa durée de validité. L'API d'application reçoit l'identifiant et la révision de la proposition ; elle ne fait pas confiance à un lot de modifications arbitrairement renvoyé par le navigateur.

Les changements partiels sont appliqués à un instantané relu et validé. Une liste inchangée doit rester intacte ; ajouter une compétence ne remplace pas les autres. Les nouvelles références utilisent des identifiants locaux au lot, résolus par le serveur après contrôle de type, de portée et d'unicité. Les associations cycliques éventuelles demandent une préparation en deux phases dans une même transaction, avec validation de l'état final.

Avant toute écriture, contrôler toutes les versions concernées sous verrou transactionnel, y compris les références dont le sens peut avoir changé. Les incréments de version provoqués par des relations réciproques au sein du lot ne doivent pas être confondus avec une modification concurrente. Réutiliser les validations et écritures de `ContentStore` sans lancer une transaction indépendante par fiche. Toute erreur annule le lot entier.

Une nouvelle fiche est créée en brouillon. Une édition conserve son statut sauf décision explicitement présentée ; une fiche prête devenue incomplète demande le passage en brouillon dans la proposition. Les archives restent soumises à la restauration existante. Les différences de visibilité, de consentement, de listes et de notes privées doivent être aussi visibles que les modifications textuelles. La suppression définitive autonome n'est pas un outil de rédaction.

La répétition d'une même application retourne le résultat enregistré et ne recrée pas les fiches. Une proposition expirée, annulée, obsolète ou appartenant à une session révoquée ne peut pas être appliquée. Si une connexion est interrompue après l'enregistrement, le client doit pouvoir vérifier le résultat sans générer à nouveau du contenu. La conservation des propositions et reçus est bornée et documentée ; aucun historique de messages ni raisonnement interne n'est archivé.

## Personnalisation de la rédaction

« Agents et rédaction » est accessible dans les réglages existants. Proposer langue, ton, audience, technicité, longueur/détail, personne narrative et consignes complémentaires bornées. Les préférences globales peuvent être adaptées par famille de contenus, avec une action de réinitialisation. Le formulaire explique leur effet sur les générations suivantes.

Les préférences sont validées et persistées dans SQLite. Elles sont transmises au coordinateur et à chaque spécialiste, avec une priorité explicite aux demandes ponctuelles de l'utilisateur sur le style. Elles ne peuvent pas modifier les droits, les outils, les limites, les règles métier ou l'interdiction d'inventer des faits. Les prompts système complets restent versionnés dans le code.

## Interface et contrats

Le chat conserve une composition sobre. Il montre soit une réponse, soit des questions ciblées, soit un lot de modifications regroupées par fiche. Les détails affichent les libellés réels du catalogue, les valeurs avant/après et les éléments manquants. Le bouton d'application annonce le nombre de fiches concernées ; annuler ou préciser la demande n'efface pas les messages utiles. Après application, les liens ouvrent les éditeurs du studio.

Les nouvelles vues réutilisent les variables du [design system](design-system.md), la garde de saisie, les composants de formulaire et le thème existants. Les annonces de traitement et d'erreur, la navigation au clavier et le retour du focus doivent fonctionner sur bureau, mobile et à 320 pixels. Les détails de proposition se replient sans cacher les informations nécessaires à la décision. Une annulation ne doit pas être affichée comme réussie tant que l'exécution côté serveur reste active.

Les routes sont privées sous `/api/admin/assistant/` : tour conversationnel, lecture/application/abandon d'une proposition et lecture/écriture des préférences. Leur contrat documente authentification, origine/CSRF, limites de corps, erreurs, conflits, expiration et idempotence dans le [guide backend](backend.md). Les délais du navigateur et du backend doivent couvrir le budget total du graphe, en conservant une limite explicite. Aucun retour SPA générique ni nouvelle route de page n'est nécessaire.

## Migration et exploitation

`content/migrations/002.sql` ajoute les tables de préférences et propositions, sans modifier la migration livrée `001.sql`. Les nouvelles tables résident dans `admin.sqlite3` et sont incluses dans l'export de base existant. Vérifier l'initialisation depuis une base contenant compte, sessions, fournisseur, fiches et médias ; tester aussi sauvegarde, vérification et restauration avec le nouveau schéma.

L'image actuelle refuse une version de schéma future. Un retour arrière ne peut donc pas être annoncé compatible au seul motif que la migration est additive : il faut vérifier la compatibilité réelle ou restaurer la sauvegarde cohérente antérieure avec son image, en tenant compte des écritures effectuées depuis. Les procédures finales préciseront ce choix avant déploiement.

Les journaux techniques décrivent identifiant de requête, étape, durée, compte d'appels et catégorie d'erreur, sans messages, propositions brutes, clés ni raisonnement interne. Aucun export de traces vers LangSmith ou un autre service n'est activé. Une panne fournisseur ne doit pas empêcher l'édition manuelle du studio.

## Vérifications et livraison

Les validations couvrent le comportement complet :

- Contrats et registre : couvrir les 15 modèles, tous les champs et sous-champs, les valeurs exactes, les références et la préservation des données non ciblées.
- Graphes : chemins simple et délégué, clarification puis reprise, cohérence des spécialistes, sorties invalides, tentative d'injection, budgets, erreurs et annulation.
- HTTP et stockage : authentification/CSRF, génération sans mutation métier, application atomique, idempotence, versions concurrentes, expiration, révocation, doublons, références cycliques, médias et confidentialité.
- Préférences : persistance, validation, héritage, réinitialisation et effet observé dans les entrées de tous les spécialistes.
- Navigateur : projet avec nouveaux référentiels, profil délégué et précisions, service avec tarifs/FAQ, article et média, relecture/édition/application et ouverture des fiches enregistrées ; bureau/mobile, thèmes, contraste, focus et 320 pixels.
- Livraison : `make check`, `make test-e2e`, build Docker, Compose, auto-revue, CI finale, fusion, sauvegarde, déploiement depuis `main` propre avec tag de commit et contrôles de production.

Les modèles simulés donnent des tests reproductibles sans dépense API ; ils ne prouvent pas la qualité d'une génération réelle. Un essai réel borné avec le fournisseur configuré utilisera des informations synthétiques, sans appliquer de fiche de démonstration dans la production. Le compte rendu distinguera ces deux niveaux de vérification. L'issue reste ouverte jusqu'à la livraison complète et à la vérification du service déployé.

## Limites et extension du code

Le coordinateur produit au plus 12 tâches (une par fiche). Au-delà de huit champs sur une fiche, le graphe répartit ses champs par section du catalogue ; sinon un spécialiste suffit. Au plus 16 travailleurs sont admis, trois actifs simultanément. Une branche reçoit uniquement ses champs actuels, le plan et les messages nécessaires, et utilise les préférences de sa famille. Les questions sont regroupées avant toute proposition ; aucune branche partielle n'est appliquée seule.

Le tour est limité à 24 appels fournisseur réels, 48 lectures/outils comptabilisés, 250 000 caractères de contexte lu, 400 000 caractères d'entrée d'agent, 1,6 Mo par requête fournisseur, 2 Mio par réponse HTTP et 240 secondes au total. Chaque agent a une limite de récursion de 10 étapes ; les reprises de sortie structurée sont comprises dans le budget partagé. Les SDK n'effectuent aucune relance réseau automatique. Le modèle reçoit un maximum de 12 000 tokens de sortie par appel. Ces plafonds sont des limites de coût et de charge, pas une promesse de temps de réponse.

OpenAI passe par **Responses** (`store=false`, sans identifiant de conversation distante) : les modèles GPT-6 peuvent ainsi utiliser le raisonnement et les outils, conformément au [contrat de GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Les éléments de raisonnement chiffrés nécessaires aux appels suivants restent seulement en mémoire pendant l'exécution de l'agent. Anthropic et Mistral passent par leurs adaptateurs LangChain officiels. Le client HTTP injecté à Anthropic utilise `httpx2`, exigé par sa version de SDK verrouillée ; le point d'injection est couvert par les tests natifs. Les destinations restent fermées et aucun outil web fournisseur n'est activé.

Pour ajouter une collection, commencer par le domaine métier (`schemas`, catalogue et migration), puis compléter `Kind` et `FAMILIES` dans l'assistant. Les champs et sous-champs des contrats de spécialistes sont dérivés automatiquement : aucun prompt ne recopie les 403 champs. Pour faire évoluer une politique, modifier `assistant/prompts/`, incrémenter `POLICY_VERSION` et adapter les scénarios pertinents. Pour ajouter un outil, conserver ses droits de lecture et son budget, ou faire valider séparément toute évolution d'architecture ou de permissions.

Les champs omis sont conservés. Une liste émise remplace explicitement cette liste après relecture ; les instructions demandent de préserver ses lignes et sous-champs lors d'un ajout. `null` n'est autorisé que pour les champs réellement nullables. Le contrôle final réutilise `ContentStore` dans une simulation annulée, puis dans la transaction d'application. Les effets réciproques sur les autres fiches figurent aussi dans la relecture et les liens du reçu.
