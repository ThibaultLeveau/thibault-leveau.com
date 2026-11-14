# Studio de contenus

**Conception approuvée et implémentée dans la PR #9.** Cette conception répond à l'[issue #8](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/8). Thibault a explicitement approuvé l'architecture le 14 novembre 2026 (« Ok »), [accord consigné](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/8#issuecomment-6878880881), conformément à `AGENTS.md`. Le [guide d’administration](administration.md) décrit le parcours utilisateur ; les [contrats HTTP](backend.md#api-du-studio-de-contenus) et les [tests](testing.md) décrivent le comportement livré et ses contrôles.

## Intention et périmètre

Renseigner une information une seule fois, puis la relier aux réalisations qui l'illustrent. Une expérience décrit un poste ou une mission ; un projet décrit une réalisation ; un service décrit une prestation proposée. Une compétence décrit un savoir-faire, une technologie un outil. Ces distinctions évitent de confondre un employeur avec un client, un diplôme avec une certification, ou une responsabilité avec un résultat.

La demande porte sur la gestion privée de ces contenus. Le studio permet création, lecture, modification, duplication et archivage, ainsi que la gestion des médias. Le statut **Prêt** atteste une relecture éditoriale. Depuis l'[évolution publique approuvée](public-site-design.md), **Prêt + Public** publie la fiche et ses champs autorisés. Les autres fiches restent privées. L'indexation reste désactivée par défaut.

La saisie restera utilisable sans fournisseur LLM. Aucun contenu biographique, client, témoignage ou résultat ne sera inventé pour remplir la base. Les éventuels exemples de maquette seront explicitement fictifs.

## Recherche et choix

Les familles parcours, projets, compétences, formations, certifications, distinctions et références sont cohérentes avec [JSON Resume](https://jsonresume.org/schema). Ce schéma sert de contrôle de couverture ; nous ne reprenons ni son stockage JSON ni son principe où tous les champs sont facultatifs.

[Schema.org Service](https://schema.org/Service) distingue la prestation, son public, sa zone et les offres associées. Cela motive une fiche service avec des formules tarifaires, plutôt qu'un simple titre et un prix. [CreativeWork](https://schema.org/CreativeWork) et [EducationalOccupationalCredential](https://schema.org/EducationalOccupationalCredential) aident à distinguer contenu publié, auteur, médias, justificatif et organisme délivrant une qualification. Ces références ne constituent pas une promesse de compatibilité ou de données structurées publiques.

Le regroupement des champs en étapes et la validation à proximité des champs suivent les recommandations W3C sur les [formulaires longs](https://www.w3.org/WAI/tutorials/forms/multi-page/) et la [validation](https://www.w3.org/WAI/tutorials/forms/validation/). Les règles métier ci-dessous sont propres à ce site, pas une obligation de ces standards.

## Navigation latérale

Le premier menu conserve l'identité « Le studio » et les réglages en bas. Huit entrées de contenu évitent une liste de quinze liens au même niveau :

```text
Le studio
  Chat

Contenus
  Projets
  Parcours             → Expériences · Formations · Certifications · Distinctions
  Services
  Publications         → Articles · Interventions et publications externes
  Témoignages

Bibliothèque
  Référentiels         → Compétences · Technologies · Organisations · Catégories et tags
  Médias
  Mon profil

Réglages du site        → AI provider · Admin user
```

Les groupes à sous-vues ouvrent le second menu accolé existant. Une seule sous-navigation est ouverte à la fois. Le menu des réglages conserve son comportement. Les éditeurs de fiches utilisent la zone centrale, sans créer une troisième sidebar permanente.

Sur tablette, le rail d'icônes existant reste identifiable par ses noms accessibles ; une commande **Menu** expose les libellés complets. Sur téléphone étroit, cette commande rejoint une barre supérieure pour laisser toute la largeur au formulaire et ouvre la navigation complète. Les sous-vues peuvent occuper une rangée locale sous cette barre. Un panneau de navigation ouvert se ferme après le choix, par sa commande de fermeture ou par `Échap`, avec retour du focus. Le contenu derrière une navigation superposée est inerte. La navigation peut défiler sur un écran bas ; aucune rubrique ni déconnexion ne doit devenir inaccessible.

Chaque collection présente titre, contexte utile, état éditorial, éventuelle information manquante et date de modification. Recherche textuelle, filtre d'état et filtres métier pertinents (nature du projet, organisation, compétence) restent propres à la collection. Le tri est explicite : modification récente, titre ou chronologie. Les listes se transforment en lignes empilées sur mobile, sans tableau débordant. Les états vide, chargement, erreur et absence de résultat proposent l'action correspondante.

## Objets et champs

Les tables nommées ci-dessous structurent les données dans SQLite. Les sous-listes structurées sont ordonnées et éditables avec Ajouter, Retirer, Monter et Descendre ; le glisser-déposer ne peut pas être leur seul contrôle.

### Socle commun

Chaque fiche possède un identifiant stable, un type, un titre ou nom, un identifiant lisible (`slug`, unique par type et langue), un résumé court, une description longue, une langue de contenu (`fr` par défaut), un état éditorial, un ordre et une mise en avant facultative. Les dates de création/modification et la version sont gérées par le serveur. Le profil unique ne demande pas de slug à l'utilisateur.

Les contenus destinés à une future présentation disposent aussi d'un titre SEO, d'une description SEO, d'une image de partage et d'une URL canonique facultatifs. Les recommandations de longueur SEO sont indicatives, pas des blocages arbitraires. **Visibilité sur le site** distingue public et confidentiel, avec confidentiel par défaut ; associée au statut Prêt, elle autorise la projection publique. Des notes privées séparées ne sont jamais incluses dans l'aperçu de présentation.

Les liens sont des lignes nommées avec type (site, dépôt, démo, documentation, article, autre), URL et ordre. Les lieux ont un libellé, une ville, une région et un pays, avec mode sur site, hybride ou à distance ; une zone desservie n'impose pas une adresse personnelle. Les dates acceptent année, mois ou jour avec précision conservée, état en cours distinct et fin inconnue distincte. Ne pas inventer un 1er janvier pour représenter une année.

### Projets

| Groupe | Champs |
| --- | --- |
| Identité | Titre, slug, résumé, description complète, catégorie, étiquettes, langue |
| Contexte | Nature professionnelle, personnelle, associative ou académique ; caractère open source séparé ; problème initial, objectifs, public concerné, contraintes et confidentialité |
| Chronologie | Début et fin avec précision, en cours, phase prévue/en cours/terminée/en pause, lieux et mode de travail |
| Relations | Zéro à plusieurs expériences, rôle de chaque rattachement ; organisation porteuse et client facultatifs ; services illustrés ; formations associées pour un projet académique |
| Contribution | Mon rôle, périmètre de décision, taille d'équipe facultative, collaborations, responsabilités ordonnées, actions menées et livrables |
| Résultats | Résultats qualitatifs ; mesures facultatives avec libellé, valeur initiale, valeur finale, unité, période, contexte et preuve ; enseignements et suites |
| Expertise | Compétences mobilisées avec contexte ; technologies utilisées avec version facultative et usage (interface, API, données, déploiement, design…) |
| Preuves | Liens nommés, couverture, galerie ordonnée, vidéos, documents, légendes, texte alternatif et crédits ; témoignages reliés |
| Présentation | Mise en avant, ordre, aperçu, visibilité publique ou confidentielle, SEO et notes privées |

Une nature professionnelle n'impose pas un emploi salarié : une mission directe peut exister sans expérience liée. Un projet personnel peut n'avoir ni organisation, ni client, ni expérience. Plusieurs emplois successifs peuvent contribuer au même projet, sans dupliquer sa fiche. Le statut éditorial est indépendant de sa phase : un projet en cours peut être suffisamment documenté pour être **Prêt**.

### Expériences

Table `experiences` : intitulé du poste, organisation employeuse/porteuse, client facultatif, département, nature (salariat, indépendant, stage, alternance, bénévolat), type de contrat facultatif, début/fin/précision/en cours, rythme facultatif, lieux et mode de travail, résumé, description du contexte, responsabilités, réalisations, résultats, périmètre d'équipe, compétences, technologies, liens et médias.

La liste des projets rattachés se calcule depuis les relations, au lieu d'être recopiée dans la description. Une promotion correspond à une nouvelle expérience chez la même organisation, pour préserver intitulé et période. Une expérience bénévole utilise la même fiche avec sa nature, sans collection parallèle redondante.

### Compétences et technologies

| Objet | Champs et règles |
| --- | --- |
| `skills` | Nom, domaine, nature technique/méthode/transverse, description de ce que je sais faire, niveau facultatif avec libellé explicite, date de début de pratique et dernière utilisation facultatives, liens de référence, alias et ordre |
| `technologies` | Nom, famille (langage, framework, données, cloud, outil, plateforme), description, site/documentation officiels, logo facultatif, alias ; version et usage vivent sur la relation au projet ou à l'expérience |

Exemple de distinction, sans préremplir la base : « concevoir une API » est une compétence ; « FastAPI » est une technologie. Les fiches affichent leurs usages dans les projets, expériences, services et certifications. Un niveau autoévalué reste facultatif ; pas de pourcentage de maîtrise. Les années d'expérience ne sont pas additionnées automatiquement à partir de périodes qui peuvent se chevaucher.

### Formations et certifications

| Objet | Champs |
| --- | --- |
| `educations` | Intitulé, établissement réutilisable, type (diplôme, formation continue, cours, apprentissage personnel), domaine, niveau ou diplôme visé, début/fin/précision/en cours, durée facultative, résultat (suivie, obtenue, interrompue), description, programme, projets/travaux, compétences, lieux/modalité, liens et justificatifs |
| `certifications` | Nom, organisme délivrant, catégorie, référence/identifiant du justificatif facultatif, obtention, expiration ou « sans expiration » ou « inconnue », état obtenue/en préparation/révoquée, description, compétences attestées, lien de vérification, badge, justificatif privé et formation associée facultative |

L'expiration d'une certification obtenue se déduit de la date ; elle ne disparaît pas de l'historique. Une certification en préparation n'est jamais présentée comme obtenue. Un diplôme peut être représenté par une formation et son justificatif sans créer une certification en doublon.

### Offres de services

Table `services` : nom, proposition de valeur courte, description, problème traité, public visé, bénéfices attendus, périmètre inclus, exclusions, prérequis côté client, livrables détaillés, déroulement en étapes, durée indicative, modalités à distance/sur site/hybrides, zones desservies, langues, disponibilité et conditions pratiques.

Sous-listes : formules (`service_packages`), étapes, livrables et FAQ. Une formule possède nom, périmètre, mode tarifaire (sur devis, forfait, à partir de, heure, jour), montant et devise lorsque pertinents, unité et mention tarifaire saisie par l'administrateur. Les montants sont conservés sans arrondi binaire ; zéro est possible pour une prestation gratuite explicite, et « sur devis » n'est pas le prix zéro. Les modalités tarifaires sont des informations éditoriales, sans encaissement.

Relations : compétences promises, technologies pertinentes, projets servant de références, témoignages, images et documents. Action de contact : libellé et destination validée (adresse électronique ou URL HTTPS). Le bénéfice promis d'un service est séparé des résultats réellement constatés dans les projets. Les formules n'ouvrent pas une nouvelle section de sidebar : elles appartiennent à l'offre.

### Articles et autres publications

Un seul blog suffit : **Articles** est une collection de contenus, pas une table `blogs` supplémentaire sans usage.

| Objet | Champs |
| --- | --- |
| `posts` | Titre, slug, chapô, corps long en Markdown avec aperçu, auteur (profil), langue, couverture, catégorie, tags, dates éditoriales facultatives, sources/liens, galerie, projets/services/compétences associés, SEO, URL canonique pour une republication |
| `publications` | Type (conférence, podcast, interview, article externe, livre, autre), titre, résumé, description, rôle/auteurs, organisme ou événement, date, durée facultative, langue, lieu ou en ligne, URL de publication, identifiant DOI/ISBN facultatif, support, enregistrement, ressources et projets/compétences associés |

Les dates éditoriales des articles n'activent aucune planification. Une publication externe peut conserver la date de sa parution réelle. La durée de lecture est calculée sur le contenu et présentée comme estimation. Le Markdown conserve le texte source ; HTML brut, scripts et iframes ne sont pas exécutés, y compris dans l'aperçu.

### Témoignages, distinctions et profil

| Objet | Champs |
| --- | --- |
| `testimonials` | Citation exacte, nom d'affichage de l'auteur ou anonymat explicite, fonction, organisation, date, relation professionnelle, source, lien de preuve facultatif, portrait facultatif, état de l'autorisation de diffusion et note privée ; projets, expériences et services concernés |
| `awards` | Intitulé, organisme, date, catégorie/classement facultatif, description de la distinction, projet ou formation concernés, lien et justificatif |
| `profiles` | Fiche unique : nom d'affichage, titre professionnel, accroche, bio courte et longue, localisation de présentation, portrait, CV, liens sociaux, contact public facultatif, disponibilité, zones d'intervention, langues et niveaux, centres d'intérêt facultatifs |

Un témoignage conservé comme brouillon peut attendre une autorisation ; il ne peut être déclaré prêt pour une diffusion publique sans accord renseigné. Une donnée absente reste absente : pas d'avis de démonstration ni de références inventées. Les langues et intérêts sont de petites listes du profil, sans écrans de gestion autonomes.

### Organisations et taxonomies

`organizations` contient nom, nom d'affichage anonymisé si nécessaire, rôles cumulables (employeur, client, école, certificateur, éditeur, association), secteur facultatif, description, site, logo, lieux et notes privées. Une organisation peut jouer plusieurs rôles sans doublon. Ne pas créer de carnet de contacts ou CRM pour ce besoin.

`taxonomies` contient libellé, slug, description et portée (catégorie de projet, catégorie d'article, domaine de compétence ou tag). Les catégories spécialisées ne deviennent pas interchangeables par accident. Un tag transversal peut servir à plusieurs collections. Les technologies et compétences sont de vrais objets reliés, pas des tags libres.

### Médiathèque

`media_assets` contient un identifiant, titre interne, nature image/vidéo/document, source fichier/lien externe, nom d'origine, chemin interne généré ou URL, type MIME contrôlé, taille, empreinte, dimensions si image, durée renseignable si vidéo, auteur/crédit, origine/licence et notes privées. Les usages sont listés avant archivage ou suppression.

`entry_media` rattache un média à une fiche : rôle couverture/galerie/vidéo/pièce jointe/justificatif, ordre, légende, texte alternatif contextualisé ou choix décoratif, transcription et lien de sous-titres facultatifs. L'alternative appartient à l'usage : une même capture n'a pas toujours le même sens selon la fiche. Le choix suit l'[arbre W3C pour les alternatives textuelles](https://www.w3.org/WAI/tutorials/images/decision-tree/).

Les couvertures et galeries sont facultatives. Si une image informative est utilisée dans une fiche prête, son alternative est nécessaire. Un justificatif confidentiel reste une pièce privée, même si la fiche qui le référence est destinée à une future présentation publique. Une vidéo peut être téléversée ou renseignée par URL ; un lien externe n'est ni téléchargé par le serveur ni intégré dans une iframe automatique.

## Relations et organisation en base

Une table `content_entries` porte les champs communs des fiches et un type immuable. Les tables métier ci-dessus portent les champs spécifiques, avec une relation un-à-un vers cette entrée. Les références entre objets pointent sur leur table métier, pour empêcher de relier une certification à la place d'une expérience. Les petits champs structurés sont typés ; aucun formulaire ne demande du JSON brut.

| Relation | Cardinalité et comportement |
| --- | --- |
| Organisation → expériences / formations / certifications | Une organisation peut être réutilisée dans plusieurs fiches ; le rôle de la relation est explicite |
| Projets ↔ expériences | Plusieurs-à-plusieurs via `project_experiences` ; aucune relation obligatoire pour un projet autonome |
| Projets ↔ formations | Plusieurs-à-plusieurs ; une réalisation académique conserve sa fiche complète |
| Fiches ↔ compétences | `entry_skills` avec contexte d'usage ; unicité de la paire, usages affichés dans la fiche compétence |
| Projets / expériences ↔ technologies | `entry_technologies` avec version et usage ; relations autorisées contrôlées par type |
| Services ↔ projets / témoignages | Références explicitement choisies, pas tous les projets utilisant une compétence |
| Articles / publications ↔ projets / services / compétences | Liens éditoriaux explicites ; pas de copie des descriptions liées |
| Témoignages ↔ projets / expériences / services | Un même témoignage réutilisable, citation et autorisation conservées une fois |
| Fiches ↔ médias / tags | Associations ordonnées avec clés étrangères ; métadonnées propres à l'usage |
| Fiche → liens / responsabilités / résultats / lieux | Sous-objets possédés par la fiche ; lignes typées et ordonnées |
| Service → formules / étapes / livrables / FAQ | Sous-objets de l'offre, sans cycle ni collection autonome |

Les tables d'association métier explicites portent leurs contraintes d'unicité et clés étrangères. Les tables transversales (`entry_links`, `entry_locations`, `entry_skills`, `entry_technologies`, `entry_media`, `entry_tags`, responsabilités, résultats) valident les types d'entrée permis. L'entrée et sa spécialisation sont créées/modifiées dans une transaction. Il ne s'agit pas d'un constructeur de types modifiables depuis l'interface.

Activer les clés étrangères SQLite à chaque connexion. Un retrait de relation ne supprime pas l'objet référencé. L'archivage préserve les données et montre les usages ; toute suppression définitive d'un objet référencé est refusée avec les fiches concernées. Une purge de fiche sans référence enlève ses seules sous-lignes, jamais les médias ou référentiels partagés. Les éléments archivés sont visibles dans un filtre dédié et restaurables.

Les recherches normalisent la casse et les accents. Les noms similaires déclenchent une suggestion de réutilisation ; seule l'unicité réelle (slug par type/langue, paire de relation) bloque. Pas de fusion automatique de deux clients ou de deux compétences homonymes.

## Éditeur de fiche

Les projets ont six sections accessibles dans l'ordre ou directement : **Essentiel**, **Contexte et dates**, **Contribution et résultats**, **Compétences et stack**, **Liens et médias**, **Relecture**. Sur grand écran, une barre locale donne accès à chaque section, dont la relecture. Sur mobile, les sections se replient en une navigation compacte au-dessus du formulaire et la relecture rejoint le flux. Les autres entités reprennent cette structure avec leurs propres sections et moins de champs.

Le haut de page indique la fiche, son état et les changements non enregistrés. **Enregistrer le brouillon** reste disponible depuis toutes les sections ; **Vérifier la fiche** révèle les erreurs bloquantes et les conseils facultatifs. Une erreur conduit à la section et au champ concernés, même s'ils étaient masqués. L'aperçu présente le contenu prévu pour affichage, sans notes privées ni boutons factices de publication.

La sélection d'une compétence, organisation ou expérience propose les objets existants avec recherche et contexte. **Créer une organisation** ouvre une saisie courte puis revient au projet en conservant ses champs. Les relations sélectionnées ont un nom, un retrait explicite et un accès à leur fiche ; ne pas afficher un champ d'identifiant numérique.

Une première sauvegarde explicite crée le brouillon ; les sections conservent leurs valeurs en mémoire jusqu'à la sauvegarde. Aucun autosave silencieux n'est annoncé. Un changement de rubrique, une déconnexion ou un rechargement avertit des modifications non enregistrées ; rester, enregistrer ou abandonner sont des choix distincts. Une erreur réseau conserve les valeurs et propose de réessayer. À expiration de session, la reconnexion dans l'onglet restaure le brouillon en mémoire après authentification, sans le placer dans `localStorage` ni le montrer sur l'écran de connexion. Fermer l'onglet sans sauvegarder peut perdre les changements ; l'interface doit le dire.

Deux onglets ne doivent pas écraser silencieusement leurs éditions : chaque sauvegarde transmet la version lue ; une version dépassée reçoit un conflit et permet de conserver la saisie avant rechargement. La duplication produit un nouveau brouillon, un nouveau slug et retire les métadonnées de relecture ; elle conserve les relations choisies et avertit de leur réutilisation.

## Qualité de saisie

### Brouillon et état prêt

**Brouillon** exige seulement un nom/titre et la validité structurelle des valeurs fournies. Il accepte une fiche incomplète. **Prêt** ajoute les champs réellement nécessaires au type. **Archivé** conserve la fiche et ses références ; la restauration repasse en brouillon pour une nouvelle relecture.

| Fiche | Minimum pour passer à Prêt |
| --- | --- |
| Projet | Titre, nature, résumé, récit, phase, mon rôle, au moins une responsabilité, début connu ou explicitement inconnu ; résultat qualitatif ou quantitatif pour un projet terminé, ou absence motivée |
| Expérience | Intitulé, nature, organisation ou anonymisation renseignée, période connue ou absence motivée, résumé et responsabilités |
| Compétence / technologie | Nom, domaine/famille, description ; niveau, logo et preuves facultatifs |
| Formation | Intitulé, type, établissement ou apprentissage personnel explicite, période ou absence motivée, domaine et état |
| Certification | Nom, organisme, état ; obtention et validité renseignées si obtenue, ou dates explicitement inconnues ; justificatif facultatif |
| Service | Nom, public visé, bénéfice, description du périmètre, livrable, mode de réalisation et action de contact ; tarif explicite ou sur devis |
| Article | Titre, slug, chapô, corps, auteur et langue ; couverture facultative |
| Publication externe | Titre, type, rôle, résumé, date connue ou explicitement inconnue, lien ou référence bibliographique |
| Témoignage | Citation, auteur/anonymat, contexte ; autorisation renseignée si diffusion publique envisagée |
| Distinction | Intitulé, organisme, date connue ou explicitement inconnue et description |
| Organisation / taxonomie | Nom et rôle/portée ; site, logo et description facultatifs |
| Profil | Nom d'affichage, titre professionnel et bio courte ; contact public facultatif |

Un contrôle de complétude expose une liste lisible d'informations manquantes, pas un score artificiel. Les conseils facultatifs (« ajouter une preuve », « préciser la stack ») ne bloquent pas un projet sans code ou sous confidentialité. Un champ non applicable peut être identifié comme tel lorsque c'est utile, plutôt que rempli avec des données fausses.

### Invariants

- Dates calendaires réelles ; fin non antérieure au début lorsque les précisions permettent de le conclure. Une date partielle décrit un intervalle ; si les intervalles se chevauchent, ne pas inventer une comparaison au jour près. « En cours » exclut une date de fin. Une expiration connue ne précède pas l'obtention.
- Longueurs bornées et annoncées : titres/noms 160 caractères, résumés 500, corps longs 100 000, URL 2 048, 100 lignes maximum par sous-liste. La limite globale JSON de 256 Kio reste applicable et doit produire un message compréhensible. Ces plafonds sont techniques ; la relecture propose des conseils de concision distincts.
- Liens HTTP/HTTPS seulement, sauf action de contact explicitement électronique ; rejeter URL avec identifiants, schémas exécutables et caractères de contrôle. Ne pas tester une URL en la faisant télécharger par le backend.
- Montants non négatifs, devise et unité cohérentes ; un pourcentage n'est jamais déduit sans valeurs et contexte suffisants. Les métriques qualitatives et quantitatives restent distinctes.
- Relations existantes, de bon type, non dupliquées ; informer avant de relier une fiche archivée. Une référence confidentielle ne se retrouve pas implicitement dans l'aperçu public.
- Images informatives accompagnées d'une alternative, rôle décoratif explicite ; transcription/sous-titres proposés pour les vidéos, crédits et autorisations renseignables selon leur contexte.
- Validation identique côté FastAPI et interface. Messages français reliés au champ, récapitulatif accessible et focus sur la première erreur ; aucun détail brut de base ou contenu sensible renvoyé dans l'erreur.

## Architecture proposée et impacts

### Périmètre approuvé

Étendre la base SQLite actuelle avec le modèle métier et des migrations versionnées ; stocker les médias dans `/app/data/media` sur le volume `admin_data` ; ajouter les API privées de contenu et de fichiers dans FastAPI ; étendre les sauvegardes au couple base/fichiers. React reste l'éditeur et FastAPI l'autorité de validation/persistance.

L'URL de page reste `/admin` avec vues internes, sans nouveau routeur ni repli SPA. Les routes de fichiers restent sous `/api/admin/` pour utiliser le cookie existant. Les protections session/origine/CSRF sont réutilisées. MkDocs, le service Compose unique et Caddy conservent leurs responsabilités. Les nouvelles fonctionnalités ne modifient pas la disponibilité du chat ni l'initialisation du compte.

Les modules sont `personal_site/content/` pour schémas, migrations, stockage et fichiers, `api/content.py` pour les contrats privés, et `frontend/src/admin/content/` pour collections, éditeurs et contrôles partagés. Les mécanismes techniques communs ne doivent pas masquer les différences entre une fiche projet et une offre. Les dépendances nécessaires au Markdown sûr, au multipart et à la validation des images seront minimales, verrouillées et documentées ; aucun CMS ou éditeur hébergé.

### API privée

| Contrat | Fonction |
| --- | --- |
| `GET /api/admin/content/{collection}` | Liste paginée, recherche, filtres et tri sur champs autorisés, sans corps longs ni notes privées dans les résumés |
| `POST /api/admin/content/{collection}` | Création d'un brouillon validé ; collection issue d'une liste fermée |
| `GET /api/admin/content/{collection}/{id}` | Détail typé, relations, version et informations de relecture |
| `PUT /api/admin/content/{collection}/{id}` | Sauvegarde atomique de la fiche et des sous-listes avec version attendue |
| `POST …/{id}/check` | Contrôle de complétude sans transition d'état |
| `POST …/{id}/transition` | Passage prêt/brouillon/archivé avec validation et version attendue |
| `DELETE …/{id}` | Suppression définitive explicite d'une fiche archivée sans références, avec version attendue |
| `POST /api/admin/content/media/upload` | Téléversement borné ; contrôle avant persistance, résultat avec identifiant du média |
| `GET /api/admin/content/media/{id}/file` | Lecture privée autorisée du fichier, sans chemin fourni par le client |

Les routes spécialisées de médias et du catalogue précèdent les routes paramétrées. Le profil utilise les contrats communs avec une unicité en base. Aucun identifiant SQL libre n’est accepté : les noms de tables proviennent du registre fermé des modèles. Réponses : `401` session absente, `403` origine/CSRF, `404` inconnu, `409` conflit/référence/slug, `413` taille, `422` champs invalides, `503` administration désactivée. Les erreurs de champs contiennent un chemin et un code stable sans recopier la valeur refusée. Une fiche prête modifiée est revalidée ; la sauvegarde doit proposer le retour en brouillon si elle devient incomplète.

### Médias et sécurité

Les garde-fous sont adaptés à une administration unique et s'appuient sur les [recommandations OWASP pour les téléversements](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) : formats autorisés, vérification du contenu, noms générés, limites et stockage séparé des fichiers publics.

Limites : JPEG/PNG/WebP jusqu'à 10 Mio par image, PDF jusqu'à 20 Mio, MP4/WebM jusqu'à 100 Mio, enveloppe totale de 1 Gio configurable. Images décodées avec limite de pixels, formats actifs (HTML/SVG) refusés, pièces PDF servies en téléchargement. Les noms d'origine sont des métadonnées ; le chemin de stockage est généré par le serveur. Le fichier devient visible uniquement après validation et enregistrement cohérent. Les échecs et annulations nettoient les temporaires. L'absence d'analyse antivirus ou de transcodage est une limite documentée, pas une prétendue garantie sur les fichiers.

Le middleware conserve la limite JSON de 256 Kio. Seul le téléversement binaire possède un traitement en flux, une limite propre à sa route, une authentification/origine/CSRF vérifiée avant consommation complète et un quota sérialisé. Les autres routes conservent leur limite. Aucun téléchargement serveur d'URL, aucune exécution de média ni intégration externe automatique. La CSP permettra seulement les sources locales nécessaires à l'aperçu (`blob:` si utilisé), sans autoriser scripts ou iframes distants.

Les fichiers restent hors des répertoires statiques. Les routes administratives exigent une session ; les routes publiques sont sans cache et vérifient média Prêt + Public et usage public avant chaque accès. Les notes et contacts confidentiels restent en base sans chiffrement applicatif supplémentaire ; sauvegardes et permissions du volume doivent donc les protéger. Seule la clé fournisseur conserve son chiffrement actuel. Une page de contenu ne transmet rien au fournisseur LLM.

### Migrations, sauvegardes et retour arrière

Ajouter un registre de migrations de contenu. Le premier changement ajoute des tables sans réécrire le compte, les sessions ou les réglages. Une migration s'exécute transactionnellement ; version inconnue plus récente ou échec de migration arrête le démarrage avec une erreur utile. Les tests partent aussi d'une base du schéma actuel contenant un compte et une clé chiffrée, pas uniquement d'une base vide.

Sauvegarder la base et les médias comme un ensemble cohérent avec manifeste (version de schéma, commit, fichiers et empreintes). Pour cette instance unique, privilégier une courte fenêtre sans écritures pendant l'export, plutôt qu'une copie de fichiers vivants non coordonnée. La procédure SQLite seule est réservée aux bases antérieures au studio. Les commandes `export`, `verify` et `restore` sont décrites dans [Exploitation](operations.md#sauvegarde-du-studio-base-et-medias). Vérifier intégrité SQLite, clés étrangères, fichiers référencés et restauration sur une instance isolée. Conserver `SITE_SECRET_KEY` séparément et révoquer les sessions restaurées.

Le retour arrière ne supprime pas les nouveaux contenus. Une ancienne image n'accède pas aux nouvelles tables ; toute migration ultérieure incompatible demande une sauvegarde compatible avant restauration. L'espace disque, le temps de sauvegarde et les bornes de téléversement sont les principaux nouveaux coûts d'exploitation. Pas de nouveau service, réseau, bucket ou authentification.

## Vérification de l’implémentation

| Périmètre | Preuve attendue |
| --- | --- |
| Demande originale | Projet personnel autonome et projet professionnel lié à une expérience, avec dates, descriptions, responsabilités, résultats, stack, compétences, lieux, liens, image et vidéo persistés après redémarrage |
| Autres fiches | Création, relecture, modification, duplication et archivage des objets retenus ; service avec formule/livrable/FAQ, article long, certification expirée et en préparation |
| Relations | Usages inverses cohérents, rejet des mauvais types et références absentes, retrait sans destruction du référentiel, refus de purge si utilisé |
| Saisie | Brouillon incomplet accepté, valeurs incohérentes refusées, erreurs dans une autre section accessibles, modifications non enregistrées et conflit de deux onglets |
| Sécurité | Toutes les routes privées sans session, CSRF/origine, texte/Markdown hostile, URL interdite, upload trop gros ou trompeur, traversée de chemin, fichier privé inaccessible sans session |
| Persistance | Migration depuis la base existante, redémarrage, restauration base + fichiers, absence de régression compte/clé/chat |
| Interface | Clavier complet, focus, contrastes mesurés, clair/sombre à 1440, 390 et 320 px, zoom 200 %, erreurs, chargement et formulaires longs sans débordement |
| Livraison | `make check`, `make test-e2e`, construction Docker, auto-revue documentée, CI du commit final, protections respectées, PR fusionnée et issue clôturée |

Les pages d'architecture, d'administration, de contrats backend, de configuration, d'exploitation et de tests complètent cette conception. La CI et la revue finale conditionnent la fusion et la clôture de l'issue #8.
