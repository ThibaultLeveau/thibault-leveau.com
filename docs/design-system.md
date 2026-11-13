# Design et accessibilité

## Intention

L'accueil repose sur la typographie, l'espace et quelques traits. Le nom de Thibault Leveau identifie le site ; « Bienvenue. » constitue son seul message principal. La première version ne comporte pas de cartes, de statistiques, de témoignages ou de contenu de présentation inventé.

La page conserve une composition lisible en clair et en sombre. Le point final bleu, le monogramme et les détails du cadre forment les accents visuels. Ils n'ajoutent aucun sens indispensable à la compréhension du contenu.

## Palette

Les variables CSS de `frontend/src/styles/app.css` constituent la source de vérité.

| Variable | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `--canvas` | `#f6f7f4` | `#171a1c` | Fond général |
| `--ink` | `#202523` | `#f0f1ed` | Texte principal |
| `--accent` | `#225ce2` | `#82a7ff` | Point, identité, focus |
| `--line` | `#dfe3dd` | `#323639` | Séparateurs et contours |
| `--hover` | `#e9ede7` | `#272c2f` | Fond du bouton au survol |
| `--frame` | `#e8ebe5` | `#22272a` | Cadre décoratif discret |

Une couleur de séparation volontairement discrète ne doit pas être réutilisée pour un texte ou un indicateur d'état indispensable. Vérifier le contraste de toute nouvelle paire texte/fond dans les deux thèmes.

## Typographie et rythme

Inter variable est hébergée avec le site ; les polices système assurent le repli. Le titre utilise une taille fluide `clamp()` pour s'adapter au viewport, un interlettrage resserré et une graisse intermédiaire. Le nom dans le header reste compact et lisible.

Les marges horizontales s'adaptent entre 24 et 96 pixels. Le header mesure 112 pixels sur grand écran et 88 pixels sur mobile. Le bouton de thème conserve une cible de 44 × 44 pixels. Les règles mobile ajustent le titre et les espacements pour éviter le débordement, notamment à 320 pixels de largeur.

Ne pas fixer la hauteur totale de la page : un zoom navigateur, une police de secours ou une traduction doit pouvoir augmenter le contenu sans le tronquer.

## Interaction et sémantique

- Le lien du nom revient à `/` et possède un nom accessible explicite.
- La navigation possède le libellé « Navigation principale ».
- Un lien « Aller au contenu » apparaît au focus clavier.
- Le bouton de thème annonce l'action : « Activer le thème sombre » ou « Activer le thème clair ».
- Le focus clavier utilise un contour bleu distinct du simple survol.
- Les SVG et traits purement décoratifs sont exclus de l'arbre d'accessibilité.

Les transitions restent brèves et limitées aux interactions. `prefers-reduced-motion: reduce` les désactive. Aucun mouvement automatique n'est nécessaire pour comprendre la page.

## Contrôles visuels

Tester le rendu en clair et en sombre sur grand écran, sur mobile et à 320 pixels. Vérifier que le titre, le nom et la commande restent entièrement visibles, que le focus n'est pas rogné et que l'interface ne possède pas de défilement horizontal.

Parcourir la page avec `Tab`, activer le bouton avec `Entrée`, zoomer à 200 %, puis bloquer temporairement la police pour vérifier le repli. Les tests Playwright couvrent les principaux parcours ; une revue visuelle reste nécessaire pour juger les espacements et la composition.

## Documentation

MkDocs Material possède une palette bleue, des modes clair/sombre et une typographie système. `docs/stylesheets/extra.css` ajuste le fond, les titres et les blocs de code. Les préférences de thème sont indépendantes de celles de l'accueil, afin de préserver le fonctionnement natif de la documentation.

Ne pas ajouter de Google Fonts au thème documentaire : `font: false` conserve les polices disponibles sur la machine et évite une requête externe pour les caractères.
