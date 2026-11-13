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

Les icônes SVG de l'interface sont intégrées au code et marquées comme décoratives lorsque le bouton ou le lien possède déjà un nom accessible.

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
