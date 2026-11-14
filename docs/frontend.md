# Frontend

## Composition

Le frontend utilise React et TypeScript, compilés par Vite. Tailwind CSS est intégré à la construction avec son plugin Vite ; les choix visuels communs sont centralisés dans `src/styles/app.css`.

```text
index.html
├── theme-init.js       choix du thème avant le premier rendu
└── main.tsx
    └── ThemeProvider
        └── App
            ├── lien d'évitement « Aller au contenu »
            ├── SiteHeader
            │   ├── nom et monogramme
            │   └── ThemeToggle
            └── HomePage
                └── h1 « Bienvenue. »
```

L'accueil ne charge pas de contenu distant et ne dépend pas de l'API de santé pour s'afficher. Il ne contient ni routeur client, ni gestionnaire d'état global supplémentaire, ni texte biographique.

Pour `/admin`, `App` charge `AdminPage` à la demande avec `React.lazy`, dans le même `ThemeProvider`. Le bundle administratif est distinct de celui de l'accueil. Le chat, les réglages et les quinze collections du studio sont gérés par état React, sans bibliothèque de routage supplémentaire.

## Organisation des composants

| Élément | Responsabilité |
| --- | --- |
| `App` | Structure générale et point d'accès au contenu principal |
| `SiteHeader` | Navigation principale, lien vers `/` et commande de thème |
| `ThemeToggle` | Bouton accessible et icône correspondant à l'action proposée |
| `HomePage` | Titre d'accueil et détails graphiques décoratifs |
| `ThemeProvider` | État React, préférence système et persistance |
| `theme.ts` | Type `Theme`, clé de stockage, validation et accès au contexte |
| `app.css` | Palette, police locale, typographie, espacements et variantes responsive |
| `pages/AdminPage.tsx` | Session et conservation temporaire du brouillon pendant une reconnexion |
| `pages/AdminWorkspace.tsx` | Navigation latérale, thème, réglages et composition du studio |
| `admin/content/` | Collections, éditeurs, références, dialogues, médias et aperçu Markdown |
| `styles/content.css` | Studio responsive, formulaires et états dans les deux thèmes |
| `admin/LoginForm.tsx` | Connexion et état d'erreur |
| `admin/SettingsForms.tsx` | Fournisseur, modèle, clé et modification du compte |
| `admin/ChatPanel.tsx` | Conversation temporaire, envoi, attente, erreurs et limites |
| `admin/api.ts` | Appels relatifs, cookie, CSRF et erreurs HTTP |
| `styles/admin.css` | Palette administrative, menus, formulaires, chat et variantes mobiles |

Les icônes SVG de l'interface sont intégrées au code et marquées comme décoratives lorsque le bouton ou le lien possède déjà un nom accessible.

## État privé et interactions

Au montage, `/api/admin/session` détermine si l'écran doit afficher la connexion ou l'espace authentifié. Les requêtes utilisent `credentials: same-origin` et `cache: no-store`. Le cookie reste inaccessible au JavaScript ; le jeton CSRF est conservé uniquement dans l'état React et envoyé avec les mutations. Une réponse 401 ramène à la connexion.

Les formulaires affichent leurs erreurs, désactivent leurs commandes pendant l'enregistrement et annoncent les succès. Le champ de clé est vide après sauvegarde ; il n'est jamais initialisé avec une clé reçue. Le formulaire du compte exige le mot de passe actuel et vérifie la confirmation du nouveau. Une mise à jour réussie ferme l'espace courant.

Le chat reste monté mais masqué pendant les réglages et la consultation des contenus afin de conserver la conversation lors d'une navigation interne. Un changement de fournisseur ou de modèle change sa clé React et réinitialise son état. Les textes sont rendus avec l'échappement React, sans HTML ni Markdown exécutable. En cas d'échec, le message non abouti redevient un brouillon. Un rechargement efface l'historique ; aucun message, identifiant ou secret n'est enregistré dans `localStorage`.

Les modèles fermés du backend fournissent les champs, limites, options et sections via `/content/catalog`. `Fields.tsx` rend les contrôles partagés ; les modèles métier restent définis dans le code, sans constructeur de schémas ni saisie JSON. Les formulaires ont un état local et une sauvegarde explicite. Les tableaux ordonnés disposent de commandes clavier ; les sélecteurs de référence montrent des noms et proposent une recherche.

`Editor.tsx` conserve les champs après erreur et place le focus sur une erreur serveur. Un garde de navigation présente trois choix pour une saisie modifiée. Le brouillon de l'onglet est conservé par `AdminPage` pendant une reconnexion et n'est pas rendu sur l'écran de connexion. Il est abandonné explicitement lors d'une sortie confirmée. Les réponses versionnées évitent l'écrasement concurrent.

[react-markdown](https://github.com/remarkjs/react-markdown) rend l'aperçu avec `skipHtml`, URL HTTP/HTTPS contrôlées et images distantes remplacées par leur alternative. Aucun plugin HTML brut n'est installé. Les médias locaux sont lus par l'API sous session ; les références confidentielles et preuves privées sont exclues de l'aperçu. Le téléversement binaire utilise XMLHttpRequest pour la progression et l'annulation, sans dépendance multipart ni `blob:` dans la CSP.

Sur tablette, le rail se complète par Menu ; sur téléphone, ce bouton ouvre la navigation et le formulaire occupe toute la largeur. Le panneau rend le contenu derrière lui `inert`, conserve le clavier dans la navigation, se ferme par `Échap` et rend le focus à une commande visible. Les dialogues utilisent `<dialog>.showModal()` et le comportement modal natif du navigateur.

## Cycle du thème

Le thème visible est `light` ou `dark`, appliqué à `document.documentElement.dataset.theme`. Le choix explicite utilise la clé locale **`personal-site-theme`**.

1. Le script public `theme-init.js` s'exécute avant les feuilles de style et le bundle React.
2. Il utilise une valeur persistée valide, sinon la préférence système `prefers-color-scheme`.
3. `ThemeProvider` initialise le même état au montage.
4. Un clic bascule immédiatement le thème et tente de mémoriser le résultat.
5. Tant qu'aucun choix explicite n'existe, les changements de préférence système sont suivis.

Une valeur de stockage invalide est ignorée. Si le navigateur bloque `localStorage`, les lectures et écritures sont protégées : le thème système fonctionne et un choix reste actif en mémoire pendant la page. Il ne peut alors pas être garanti après rechargement.

Les événements de stockage synchronisent les onglets d'une même origine. Supprimer la clé fait reprendre la préférence système. La documentation Material gère sa propre préférence sous son préfixe ; elle ne lit pas cette clé.

Le script précoce et le provider contiennent nécessairement une petite logique commune. Une évolution de la clé, des valeurs ou du comportement doit modifier les deux et conserver le test qui bloque le bundle React pour vérifier l'initialisation précoce.

## Styles et ressources

Inter est servie par `/fonts/inter-variable.woff2`, avec sa licence dans `public/fonts/LICENSE.txt`. `font-display: swap` permet d'afficher le texte avec une police de secours pendant son chargement. Les ressources de `public/` gardent leur nom à la construction ; elles sont donc revalidées côté HTTP.

Vite émet les bundles nommés avec une empreinte dans `build/web/assets/`. L'application est construite pour la racine `/`, tandis que MkDocs occupe `/documentation/` avec sa propre configuration.

## Développement et compilation

```bash
npm --prefix frontend run dev
npm --prefix frontend run check
npm --prefix frontend run build
```

`check` vérifie TypeScript et ESLint sans tolérer les avertissements. `build` vérifie les types puis écrit la sortie de production dans `build/web/`. Les dépendances de production ne nécessitent pas de serveur Node.js après compilation.

Le proxy de développement transmet `/api` au backend local. Ne pas remplacer les URL relatives par une adresse publique codée en dur dans les composants : les mêmes appels doivent fonctionner en local et derrière Caddy.

## Faire évoluer l'accueil

Conserver une hiérarchie sémantique avec un seul titre principal, des liens réels pour la navigation et des boutons pour les actions. Un nouveau contenu ne doit pas dépendre d'un survol pour être accessible au tactile. Les paramètres visuels et critères de vérification figurent dans le [guide de design](design-system.md).

## Assistant et préférences de rédaction

`ChatPanel` conserve en mémoire l'historique, un UUID de conversation, l'UUID du tour en cours et les médias joints. Il envoie uniquement des messages `user`/`assistant` à `/api/admin/assistant/turn`, attend au plus 250 secondes et affiche les questions regroupées ou la proposition. L'annulation appelle le serveur et attend sa confirmation. Les notes privées sont exclues par défaut ; le contrôle explicite s'applique au tour suivant.

Les composants de `admin/assistant/` isolent la relecture (`ProposalCard`), les médias (`Attachments`), les préférences (`PreferencesForm`) et leurs types. `ProposalCard` s'appuie sur le catalogue pour afficher libellés, options, listes et références ; le texte reste échappé. Il applique seulement l'identifiant et la révision serveur, affiche le reçu et ouvre les éditeurs. Une interruption réseau demande de vérifier le reçu avant de réessayer. Les propositions antérieures sont désactivées lorsqu'une demande les remplace.

`Attachments` réutilise `ReferencePicker` et `content/upload.ts`, partagé avec le studio. Son libellé accessible distingue le téléversement pour la demande de celui de la médiathèque. Un fichier envoyé devient immédiatement une fiche média privée ; seules ses métadonnées rejoignent le contexte des agents.

`PreferencesForm` réutilise la garde de navigation et le dialogue du studio. Les réglages globaux et familiaux sont enregistrés avec leur version ; un conflit propose de recharger sans écraser silencieusement la saisie. `styles/assistant.css` réutilise les variables existantes pour les comparaisons, détails repliables, questions, contrôles et mises en page mobiles, dans les deux thèmes.
