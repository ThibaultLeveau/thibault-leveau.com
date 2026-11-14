# Présentation publique des collections

**Conception approuvée et implémentée.** Cette conception répond à l'[issue #14](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/14). Thibault a explicitement répondu « Je valide cette architecture et cette règle de publication ». Cet [accord est consigné avant implémentation](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/14#issuecomment-6881977535), conformément à `AGENTS.md`. Les vérifications et la livraison sont suivies dans l’issue.

## Intention

Permettre à un visiteur de comprendre le profil de Thibault, de découvrir ses réalisations, de vérifier son expertise et de trouver un moyen de contact. Les quinze collections alimentent une expérience éditoriale cohérente ; leur organisation interne n'impose pas quinze entrées dans le menu.

Le site reprend la police Inter locale, la palette minérale, l'accent bleu et le mécanisme clair/sombre du [guide de design](design-system.md). La composition s'appuie sur la typographie, les espaces, les médias réellement renseignés et des liens entre contenus. Les pages adoptent des présentations adaptées : projets visuels, chronologie de parcours, catalogue d'expertise, offres structurées et lecture longue.

Aucun intitulé professionnel, résultat, client, témoignage, nombre ou photographie de réalisation n'est inventé. En l'absence de profil public, le nom du propriétaire reste l'identité du site et une introduction neutre présente ses rubriques. Une collection vide conserve une page utile et des liens vers les autres rubriques.

## Arborescence et parcours

| Page | URL | Rôle et présentation |
| --- | --- | --- |
| Accueil | `/` | Présentation du profil, sélection de projets, aperçu de l'expertise, derniers écrits et contact renseigné |
| Projets | `/projets` | Grille visuelle, recherche, catégories et technologies ; détails du contexte, de la contribution et des résultats |
| Parcours | `/parcours` | Chronologie des expériences ; rubriques formations, certifications et distinctions directement accessibles |
| Expertise | `/expertise` | Compétences regroupées par domaine, technologies et liens vers leurs usages publics |
| Services | `/services` | Offres lisibles, audience, livrables, déroulement, formules, questions fréquentes et contact |
| Journal | `/journal` | Articles et interventions, filtres de type, recherche, dates exactes et lecture longue |
| À propos | `/a-propos` | Profil, langues, centres d'intérêt, disponibilité, témoignages autorisés et contact |
| Explorer | `/explorer` | Recherche transversale, filtre par collection et résultats paginés avec liens directs |

Le nom du site revient à l'accueil. Le menu principal donne accès à Projets, Parcours, Expertise, Services, Journal et À propos. Explorer dispose d'un accès nommé et identifiable dans le header et le pied de page. Sur mobile, un bouton Menu ouvre une navigation complète, utilisable au clavier et refermable par Échap ; le focus revient au déclencheur.

Les fiches sont accessibles par des URL explicites et partageables sous leur rubrique. Le contrat conserve un identifiant stable en complément du slug pour distinguer les langues et ne pas confondre deux titres. Un slug obsolète redirige vers l'adresse actuelle seulement après vérification de la visibilité. Un identifiant inconnu ou privé produit une véritable réponse HTTP 404, sans révéler son titre.

Les recherches et filtres utilisent les paramètres d'URL : retour arrière, rechargement et partage conservent le contexte. Les changements de filtre réinitialisent la pagination. Un lien « Effacer les filtres » et un message de résultat explicite évitent les impasses. La pagination reste utilisable au clavier ; aucun défilement infini n'est nécessaire.

### Couverture des quinze collections

| Collection du studio | Point d'entrée principal | Présentation et relations publiques |
| --- | --- | --- |
| Projets | Projets, sélection d'accueil | Couverture réelle, résumé, rôle, dates, contexte, actions, livrables, résultats, liens, galerie, expériences et services associés |
| Expériences | Parcours | Chronologie, employeur ou alias, nature, dates, contribution, compétences et projets reliés |
| Compétences | Expertise | Domaines, descriptions et niveau facultatif explicitement autoévalué ; preuves d'usage |
| Technologies | Expertise | Famille, description et liens officiels ; projets et expériences concernés |
| Formations | Parcours | Établissement, diplôme/type, période, programme et travaux associés |
| Certifications | Parcours | Organisme, état réel, obtention, validité et lien de vérification ; aucune certification en préparation présentée comme obtenue |
| Services | Services | Valeur, public visé, périmètre, étapes, livrables, tarifs exacts, FAQ, références et appel au contact |
| Articles | Journal | Liste éditoriale, extrait, auteur public, dates, Markdown sûr et sommaire de lecture |
| Interventions et publications | Journal | Type, événement, rôle, date, organisme public, référence et accès à la publication |
| Témoignages | À propos et contenus associés | Citation exacte, attribution autorisée ou anonymat, contexte ; consentement contrôlé par le serveur |
| Distinctions | Parcours | Prix, organisme public, date et réalisations distinguées |
| Profil | Accueil, À propos | Profession, accroche, biographie, langues, intérêts, localisation et contact explicitement publics |
| Organisations | Fiches associées, Explorer | Nom ou alias autorisé, secteur et site ; liens vers les contenus publics de cette organisation |
| Catégories et tags | Filtres, Expertise, Explorer | Domaines de compétences, catégories de projets/articles et tags ; parcours vers les contenus correspondants |
| Médias | Couvertures, galeries, pièces jointes, Explorer | Images, vidéos, documents et crédits autorisés, avec alternative et légende liées à l'usage |

Les organisations, catégories et médias restent accessibles par Explorer même lorsqu'ils n'ont pas de rubrique de premier niveau. Les médias respectent en plus la condition d'usage public décrite ci-dessous. Les usages inverses ne mentionnent que des fiches publiques et ne dévoilent jamais le nombre d'usages privés.

## Direction visuelle

### Accueil et pages de collection

Une introduction typographique ample donne le sujet de la page ; un texte court aide à choisir la suite. Le rythme alterne des contenus visuels et des lignes éditoriales pour éviter une succession uniforme de cartes. Les filtres se trouvent près des résultats, avec un libellé toujours visible. Une couverture manquante donne une composition typographique sobre, sans fausse capture de projet.

L'accueil met en avant uniquement les contenus réellement sélectionnés ou disponibles. Les nombres affichés proviennent des résultats publics. Les pages de collection montrent leurs états vide, chargé, en cours de chargement, sans résultat et en erreur ; une erreur réseau propose de réessayer.

### Fiches et lecture

Les projets utilisent une introduction comprenant le rôle, la période et la stack, puis des sections contexte, réalisation et résultats. Le parcours préfère une ligne temporelle et des blocs d'informations hiérarchisés. Les services rendent les formules comparables et les FAQ repliables avec des contrôles natifs accessibles. Les articles disposent d'une largeur de lecture d'environ 65 caractères et d'un sommaire quand plusieurs titres le justifient.

Les relations apparaissent au bon endroit : compétences et technologies à proximité de la contribution ; témoignages à proximité des références ; suggestions de lecture ou projets liés après le contenu. Les blocs vides sont omis. Les dates partielles conservent leur précision, les prix n'utilisent pas de calcul binaire et les états de certification distinguent préparation, obtention, révocation et expiration.

### Responsive et accessibilité

- Grilles et colonnes se replient sans défilement horizontal jusqu'à 320 px ; marges et tailles de titre sont fluides.
- Les deux thèmes reprennent les variables existantes ; le texte secondaire doit conserver un contraste d'au moins 4,5:1.
- Un seul `h1`, titres hiérarchisés, lien d'évitement, `aria-current`, noms de contrôles explicites, focus visible et cibles tactiles de 44 px.
- Recherche annoncée par une zone d'état, erreurs contextualisées, images alternatives et aucun sens transmis uniquement par couleur ou survol.
- Transitions discrètes ; préférence de réduction des animations respectée ; aucun mouvement indispensable à la lecture.
- Menu mobile vérifié au clavier, fermeture par Échap, contenu arrière inerte et restitution du focus.

## Publication et confidentialité

### Condition commune

Une fiche est publiable si et seulement si son statut est **Prêt** (`ready`) et sa visibilité **public**. L'accord de cette conception transforme donc la « diffusion envisagée » en diffusion effective : les fiches qui satisfont déjà ces deux conditions deviennent accessibles au déploiement. Les aides et libellés du studio expliquent cette conséquence lors de la saisie et du passage Prêt.

Un retour en brouillon, un archivage ou le choix privé retire la fiche des réponses suivantes. La publication ne change pas les droits d'écriture du studio. Les brouillons restent modifiables et les validations existantes du passage Prêt restent applicables.

### Projection des données

Le backend construit une réponse publique avec des champs explicitement autorisés, indépendante du contrat privé. Il ne suffit pas de retirer les champs dans React. Les notes privées, notes d'autorisation, contraintes/confidentialité de projet, état interne, version de travail, erreurs de complétude, chemins de stockage et données de compte ne font jamais partie de la réponse.

Toute référence, catégorie, relation inverse, vignette et métadonnée est soumise au même filtre. Un témoignage exige `consent=granted` ; l'anonymat retire les éléments qui permettraient de récupérer l'identité masquée, y compris par le titre, le slug, les métadonnées et la recherche. Une organisation disposant d'un alias public ne révèle pas son nom confidentiel par un lien, un slug ou une relation. Le contrat et les tests publics couvrent ces projections.

La recherche porte uniquement sur les champs effectivement publics. Réutiliser aveuglément l'index privé `search_text` pourrait révéler une correspondance sur un nom anonymisé ; ce cas est à exclure. Les décomptes et facettes doivent appliquer la même projection que leurs résultats.

### Médias

Un média doit être prêt/public **et** utilisé par au moins une fiche prête/publique avec un rôle autre que `private_proof`. L'accès à son fichier, son aperçu, sa fiche et sa présence dans Explorer applique cette règle. Les fichiers ne sont pas copiés dans le répertoire statique public. FastAPI vérifie la permission à chaque requête, y compris les téléchargements directs et les requêtes partielles de vidéo.

Les images locales conservent leurs dimensions connues, leurs alternatives d'usage et un chargement différé hors du premier écran. Les documents se téléchargent avec un nom public contrôlé ; les vidéos ne démarrent pas automatiquement. Les ressources externes peuvent être présentées comme liens explicites, sans appel serveur vers une URL fournie ni iframe automatique. Les crédits et licences publics sont conservés.

Les API et fichiers dynamiques conservent une politique `no-store` pour éviter de servir une ancienne version après retrait. La dépublication empêche les accès ultérieurs via le site ; elle ne peut pas rappeler un fichier qu'un visiteur a déjà téléchargé.

## Architecture retenue

La pile reste React/Vite, FastAPI, SQLite, MkDocs, Compose et Caddy. Aucune nouvelle dépendance de routage, aucun service, aucun réseau ni migration n'est ajouté. La configuration d'indexation reste inchangée.

| Partie | Responsabilité |
| --- | --- |
| `content/` | Sélection SQL bornée des fiches éligibles, projection publique, relations filtrées et autorisation des médias |
| `api/` | Contrats de lecture `/api/public/*`, validation des filtres et pagination, réponses et erreurs sans données privées |
| `delivery.py` | Routes de pages explicitement autorisées et validation de visibilité des fiches avant distribution du HTML ; véritables 404 |
| `public/` et composants publics React | Composition des rubriques, listes, fiches, recherche, navigation et états de l'interface |
| `styles/` | Styles publics isolés, variables existantes, thèmes et responsive |
| MkDocs | Guide de publication, contrats, architecture approuvée, design et exploitation |

Les liens HTML assurent navigation, ouverture dans un nouvel onglet, rechargement et historique. React lit les chemins distribués par FastAPI ; l'administration conserve son chargement séparé. Le serveur ne transforme pas un chemin arbitraire en page React valide.

Les listes utilisent des résumés et une pagination bornée ; les corps longs et les galeries sont chargés sur les fiches. Les requêtes doivent éviter de relire tous les champs et relations de toutes les collections pour construire une page. Les facettes, totaux et sélections d'accueil restent limités aux données visibles. Lorsque le studio est désactivé, le site conserve son enveloppe publique et ses états vides sans initialiser de base ni de compte.

## Vérification et livraison

| Exigence | Preuve attendue avant clôture |
| --- | --- |
| Architecture | Accord explicite consigné dans l'issue avant implémentation ; documentation des choix effectifs |
| Quinze collections | Tests HTTP et navigateur couvrant chaque famille et ses points d'entrée publics |
| Confidentialité | Fiches privées, brouillons et archives absents des listes, recherches, totaux, métadonnées, relations et accès directs |
| Anonymat et médias | Témoignage sans consentement exclu, identités masquées non recherchables, preuve privée et média retiré inaccessibles |
| Navigation | Liens directs, retour arrière, filtres/tri/pagination et 404 vérifiés sur la sortie construite |
| Présentation | Revue visuelle à 1440, 390 et 320 px, clair/sombre, zoom 200 %, clavier, focus et contrastes |
| Performances | Listes bornées, corps longs non chargés en catalogue, images dimensionnées, bundles public/administratif séparés |
| Régressions | `make check`, `make test-e2e`, construction Docker et validation Compose |
| Production | Sauvegarde vérifiée, image précédente conservée, CI finale/revue, fusion, commit/image exécuté et HTTPS/parcours réellement contrôlés |

Les données de démonstration servent exclusivement aux tests et à la revue de conception isolée. Aucun contenu fictif n'est créé dans la base de production. Une maquette ne vaut pas preuve du fonctionnement de la future API ; une CI verte ne vaut pas preuve du déploiement.
