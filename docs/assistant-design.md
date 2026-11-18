# Assistant de contenus et agents

Cette conception répond à l'[issue #12](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/12). **Thibault l'a explicitement approuvée (« J'accepte »), accord [consigné avant implémentation](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/12#issuecomment-6880648679).** Sa première livraison est suivie dans la [PR #13](https://github.com/ThibaultLeveau/thibault-leveau.com/pull/13). L'[issue #22](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/22) étend cette conception aux travaux durables sans plafond total de fiches, après la réponse « Je suis d'accord » de Thibault, [consignée avant implémentation](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/22#issuecomment-6991171778). Le [guide administratif](administration.md#utiliser-lassistant-de-contenus) décrit son utilisation.

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
| `assistant/jobs.py` | Cycle de vie des exécutions, commandes coordonnées, pause/reprise/arrêt et erreurs nettoyées |
| `assistant/job_store.py` | Travaux, apports de faits, tâches/sections, lots et reçus durables en SQLite |
| `assistant/job_steps.py` | Planification incrémentale, vagues de sous-agents, préparation des lots et associations différées |
| `assistant/job_context.py` | Lecture paginée des faits et recherche des tâches, sous les budgets de contexte existants |
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

La consolidation traite explicitement les désaccords sur un même champ, les doublons et les relations. Le coordinateur regroupe les questions pour éviter que plusieurs spécialistes redemandent la même information. L'échec d'une branche ne doit pas produire une proposition présentée comme complète. Les limites d'appels, d'outils, de tentatives, de travailleurs simultanés et de durée s'appliquent à chaque étape. Une réparation de sortie invalide reste bornée ; la suite d'une demande importante passe par le travail durable décrit ci-dessous.

La conversation courante demeure en mémoire dans l'onglet. Le travail durable conserve le brief et les faits utiles à sa reprise, avec leur permission sur les notes privées, sans devenir un historique général de chat. Les messages envoyés par le navigateur ne peuvent pas se faire passer pour des instructions système, des résultats d'outils ou une preuve d'enregistrement. Le contexte métier est relu côté serveur. Les documents et champs consultés sont des données, jamais une autorisation d'élargir les outils ou les droits.

## Travaux durables et progression

Une demande dont le plan doit continuer sur une autre page ou dont les sections dépassent le budget du parcours direct devient un travail durable. L'interface permet aussi de demander ce suivi dès l'envoi. Le coordinateur émet une page de tâches et un curseur de continuation ; les pages suivantes sont demandées au fur et à mesure. Les tâches possèdent des identités stables, indépendantes de l'onglet et de la session à l'origine du travail.

```text
Brief et faits utiles persistés
          │
          ▼
Page de tâches → Sections ciblées → Vagues de sous-agents
          ▲                              │
          │                              ▼
   Page suivante                 Résultats persistés
          │                              │
          └────────────── Lot à relire ◄──┘
                               │
                       Enregistrement explicite
                               │
                               ▼
               Reçu durable et références résolues
```

Le responsable d'exécution de FastAPI réserve les étapes et conserve leurs transitions. Une coupure HTTP ou un rechargement ne détruit ni le travail ni ses lots ; l'interface les retrouve par les API paginées. Une révocation de session conserve les travaux du compte mais interdit d'utiliser l'ancien jeton. Un redémarrage rend les étapes interrompues reprenables. La reprise ne réapplique jamais un lot enregistré.

Les compteurs distinguent tâches planifiées, préparées et enregistrées, ainsi que les lots en attente de relecture. Le total peut rester inconnu pendant la planification. Un travail n'est terminé que lorsque toutes ses tâches et dépendances sont résolues et ses lots appliqués. Une pause, une question, un quota fournisseur ou un conflit préserve les étapes déjà terminées ; la reprise est explicite lorsqu'une intervention est nécessaire. Le nombre de lots n'est pas limité par la purge des propositions ordinaires.

Les apports supplémentaires sont des segments bornés. Le contexte commun contient le brief initial, le dernier apport et le curseur de planification ; les outils en lecture seule donnent accès aux autres faits par pages de quatre segments et aux tâches par pages de huit. Chaque étape récupère ainsi le contexte utile sans renvoyer l'historique complet du travail ni un tableau de taille croissante au fournisseur. Cette organisation permet de poursuivre après plus de 40 interactions ou 50 lots. Elle ne supprime pas les limites d'une fiche, d'un fichier, du disque ou du fournisseur.

Le travail conserve ses préférences de rédaction, sa langue et son autorisation de notes privées initiales. Avant chaque nouvel appel, le serveur vérifie la session et l'empreinte du fournisseur, du modèle et de la clé ; un changement suspend les appels. La reprise exige les réglages initiaux et une session valide, qui remplace l'ancienne session d'exécution. Ce contrôle ne déchiffre ni ne transmet une ancienne clé conservée dans le travail : celui-ci n'en possède pas.

## Propositions et écriture fiable

Une proposition validée conserve côté serveur un identifiant opaque, les opérations, les fiches sources et leurs versions, les valeurs avant/après, les dépendances entre nouvelles fiches, les questions résiduelles et sa durée de validité. L'API d'application reçoit l'identifiant et la révision de la proposition ; elle ne fait pas confiance à un lot de modifications arbitrairement renvoyé par le navigateur.

Les changements partiels sont appliqués à un instantané relu et validé. Une liste inchangée doit rester intacte ; ajouter une compétence ne remplace pas les autres. Les nouvelles références utilisent des identifiants locaux au lot, résolus par le serveur après contrôle de type, de portée et d'unicité. Les associations cycliques éventuelles demandent une préparation en deux phases dans une même transaction, avec validation de l'état final.

Avant toute écriture, contrôler toutes les versions concernées sous verrou transactionnel, y compris les références dont le sens peut avoir changé. Les incréments de version provoqués par des relations réciproques au sein du lot ne doivent pas être confondus avec une modification concurrente. Réutiliser les validations et écritures de `ContentStore` sans lancer une transaction indépendante par fiche. Toute erreur annule le lot entier.

Une nouvelle fiche est créée en brouillon. Une édition conserve son statut sauf décision explicitement présentée ; une fiche prête devenue incomplète demande le passage en brouillon dans la proposition. Les archives restent soumises à la restauration existante. Les différences de visibilité, de consentement, de listes et de notes privées doivent être aussi visibles que les modifications textuelles. La suppression définitive autonome n'est pas un outil de rédaction.

La répétition d'une même application retourne le résultat enregistré et ne recrée pas les fiches. Une proposition expirée, annulée ou obsolète ne peut pas être appliquée. Les propositions ordinaires sont liées à leur session ; les lots durables sont accessibles au compte après reconnexion, avec un nouveau jeton valide. Si une connexion est interrompue après l'enregistrement, le client peut vérifier le résultat sans générer à nouveau du contenu. Les reçus durables ne partagent ni l'expiration ni la purge des propositions de conversation ; ils restent jusqu'à suppression explicite du travail. Aucun raisonnement interne n'est archivé.

### Références entre lots

Une tâche déjà appliquée est référencée par l'identifiant réel de sa fiche. Une référence vers une tâche encore à préparer reste une dépendance explicite ; elle ne peut pas être remplacée silencieusement par une liste vide. Les références locales au lot conservent leur contrôle transactionnel existant.

Les cycles qui traversent plusieurs lots demandent deux temps : préparer et faire relire les brouillons, puis préparer les associations après application de toutes les tâches de contenu. Un seul lot d'associations reste en attente à la fois ; son enregistrement permet la préparation du suivant. Chaque application est explicite et atomique pour son lot ; il n'y a pas de transaction globale qui annulerait automatiquement des lots déjà enregistrés. Les versions des fiches sont relues avant les associations différées. Un conflit interrompt leur application et laisse visible le travail restant.

## Personnalisation de la rédaction

« Agents et rédaction » est accessible dans les réglages existants. Proposer langue, ton, audience, technicité, longueur/détail, personne narrative et consignes complémentaires bornées. Les préférences globales peuvent être adaptées par famille de contenus, avec une action de réinitialisation. Le formulaire explique leur effet sur les générations suivantes.

Les préférences sont validées et persistées dans SQLite. Elles sont transmises au coordinateur et à chaque spécialiste, avec une priorité explicite aux demandes ponctuelles de l'utilisateur sur le style. Elles ne peuvent pas modifier les droits, les outils, les limites, les règles métier ou l'interdiction d'inventer des faits. Les prompts système complets restent versionnés dans le code.

## Interface et contrats

Le chat conserve une composition sobre. Il montre soit une réponse, soit des questions ciblées, soit un lot de modifications regroupées par fiche. Les détails affichent les libellés réels du catalogue, les valeurs avant/après et les éléments manquants. Le bouton d'application annonce le nombre de fiches concernées ; annuler ou préciser la demande n'efface pas les messages utiles. Après application, les liens ouvrent les éditeurs du studio.

Les nouvelles vues réutilisent les variables du [design system](design-system.md), la garde de saisie, les composants de formulaire et le thème existants. Les annonces de traitement et d'erreur, la navigation au clavier et le retour du focus doivent fonctionner sur bureau, mobile et à 320 pixels. Les détails de proposition se replient sans cacher les informations nécessaires à la décision. Une annulation ne doit pas être affichée comme réussie tant que l'exécution côté serveur reste active.

Les routes sont privées sous `/api/admin/assistant/` : tour conversationnel, propositions, préférences et travaux. Les listes de travaux et de lots sont paginées ; les commandes permettent apport de faits, pause, reprise, arrêt et suppression. Leur contrat documente authentification, origine/CSRF, limites de corps, erreurs, conflits, expiration et idempotence dans le [guide backend](backend.md). Le parcours direct attend son résultat dans la requête ; le suivi durable consulte une exécution qui continue côté serveur. Aucun retour SPA générique ni nouvelle route de page n'est nécessaire.

## Migration et exploitation

`content/migrations/002.sql` a ajouté les tables de préférences et propositions ; `005.sql` ajoute les travaux durables sans modifier les migrations livrées. Ces tables résident dans `admin.sqlite3` et sont incluses dans l'export de base existant. Vérifier la migration depuis une base de schéma 4 contenant compte, sessions, fournisseur, fiches et médias ; tester aussi sauvegarde, vérification et restauration avec le schéma 5.

L'image actuelle refuse une version de schéma future. Un retour arrière ne peut donc pas être annoncé compatible au seul motif que la migration est additive : il faut vérifier la compatibilité réelle ou restaurer la sauvegarde cohérente antérieure avec son image, en tenant compte des écritures effectuées depuis. Les procédures finales préciseront ce choix avant déploiement.

Les journaux techniques décrivent identifiant de requête, étape, durée, compte d'appels et catégorie d'erreur, sans messages, propositions brutes, clés ni raisonnement interne. Aucun export de traces vers LangSmith ou un autre service n'est activé. Une panne fournisseur ne doit pas empêcher l'édition manuelle du studio. La suppression volontaire d'un travail retire son brief, ses apports, résultats techniques et reçus ; elle préserve les fiches enregistrées. Les copies déjà incluses dans les sauvegardes privées suivent leur propre cycle de conservation.

## Vérifications et livraison

Les validations couvrent le comportement complet :

- Contrats et registre : couvrir les 15 modèles, tous les champs et sous-champs, les valeurs exactes, les références et la préservation des données non ciblées.
- Graphes : chemins simple et délégué, clarification puis reprise, cohérence des spécialistes, sorties invalides, tentative d'injection, budgets, erreurs et annulation.
- Travaux : 13 puis 100 fiches, plus de 16 sections, plus de 50 lots et 40 interactions ; concurrence réellement bornée, pagination, dépendances entre lots, cycles, absence d'écriture automatique, reprise après coupure/rechargement/reconnexion/redémarrage et idempotence durable.
- HTTP et stockage : authentification/CSRF, génération sans mutation métier, application atomique, idempotence, versions concurrentes, expiration, révocation, doublons, références cycliques, médias et confidentialité.
- Préférences : persistance, validation, héritage, réinitialisation et effet observé dans les entrées de tous les spécialistes.
- Navigateur : projet avec nouveaux référentiels, profil délégué et précisions, service avec tarifs/FAQ, article et média, relecture/édition/application et ouverture des fiches enregistrées ; bureau/mobile, thèmes, contraste, focus et 320 pixels.
- Livraison : `make check`, `make test-e2e`, build Docker, Compose, auto-revue, CI finale, fusion, sauvegarde, déploiement depuis `main` propre avec tag de commit et contrôles de production.

Les modèles simulés donnent des tests reproductibles sans dépense API ; ils ne prouvent pas la qualité d'une génération réelle. Un essai réel borné avec le fournisseur configuré utilisera des informations synthétiques, sans appliquer de fiche de démonstration dans la production. Le compte rendu distinguera ces deux niveaux de vérification. L'issue reste ouverte jusqu'à la livraison complète et à la vérification du service déployé.

## Limites et extension du code

Le coordinateur produit des pages de 12 tâches maximum (une par fiche), puis poursuit le travail tant que le plan a une suite. Au-delà de huit champs sur une fiche, le graphe répartit ses champs par section du catalogue ; sinon un spécialiste suffit. Une demande dépassant le parcours direct passe au travail durable : les travailleurs continuent par vagues, avec trois appels simultanés maximum, sans plafond global de 16 travailleurs. Une branche reçoit uniquement ses champs et faits utiles et utilise les préférences de sa famille. Les questions sont regroupées avant la proposition du lot concerné.

Le budget d'une étape est limité à 24 appels fournisseur réels, 48 lectures/outils comptabilisés, 250 000 caractères de contexte lu, 400 000 caractères d'entrée d'agent, 1,6 Mo par requête fournisseur, 2 Mio par réponse HTTP et 240 secondes. Chaque agent a une limite de récursion de 10 étapes ; les reprises de sortie structurée sont comprises dans le budget partagé de l'étape. Les SDK n'effectuent aucune relance réseau automatique. Le modèle reçoit un maximum de 12 000 tokens de sortie par appel. Pour le parcours direct, l'étape correspond au tour ; dans un travail durable, chaque page de planification et chaque section spécialisée ont leur propre budget. Le sémaphore de trois appels est partagé entre les travaux et les tours de l'assistant. Un lot conserve une taille maximale de 2 Mio ; si nécessaire, la préparation réduit son nombre de fiches, sans réduire le nombre total demandé. Ces plafonds bornent coût et charge par étape, sans promettre une durée totale ni des crédits fournisseur illimités.

OpenAI passe par **Responses** (`store=false`, sans identifiant de conversation distante) : les modèles GPT-6 peuvent ainsi utiliser le raisonnement et les outils, conformément au [contrat de GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Les éléments de raisonnement chiffrés nécessaires aux appels suivants restent seulement en mémoire pendant l'exécution de l'agent. Anthropic et Mistral passent par leurs adaptateurs LangChain officiels. Le client HTTP injecté à Anthropic utilise `httpx2`, exigé par sa version de SDK verrouillée ; le point d'injection est couvert par les tests natifs. Les destinations restent fermées et aucun outil web fournisseur n'est activé.

Pour ajouter une collection, commencer par le domaine métier (`schemas`, catalogue et migration), puis compléter `Kind` et `FAMILIES` dans l'assistant. Les champs et sous-champs des contrats de spécialistes sont dérivés automatiquement : aucun prompt ne recopie les 403 champs. Pour faire évoluer une politique, modifier `assistant/prompts/`, incrémenter `POLICY_VERSION` et adapter les scénarios pertinents. Pour ajouter un outil, conserver ses droits de lecture et son budget, ou faire valider séparément toute évolution d'architecture ou de permissions.

Les champs omis sont conservés. Une liste émise remplace explicitement cette liste après relecture ; les instructions demandent de préserver ses lignes et sous-champs lors d'un ajout. `null` n'est autorisé que pour les champs réellement nullables. Le contrôle final réutilise `ContentStore` dans une simulation annulée, puis dans la transaction d'application. Les effets réciproques sur les autres fiches figurent aussi dans la relecture et les liens du reçu.

## Choix de version et traduction

Le dialogue avant chaque génération impose `language: fr|en`, indépendamment de la langue administrative et des préférences familiales. `assistant/translation.py` prépare une traduction des textes enregistrés avec une sortie structurée fermée et sans outils de contexte. Les faits partagés et notes privées sont exclus de cette demande. Le résultat réutilise la proposition, le diff, les contrôles de version et l’application atomique ; aucune traduction n’est publiée à la lecture. Voir les [contrats bilingues](languages.md#contrats).
