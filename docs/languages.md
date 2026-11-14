# Langues des interfaces

Dans **Réglages du site → Langue**, deux sélecteurs règlent séparément la langue du **site public** et celle de **l’administration**, connexion comprise. Les choix disponibles sont **Français** et **English**. Enregistrer applique immédiatement le choix administratif et affiche la confirmation dans cette langue. Les nouvelles visites et les rechargements utilisent les choix enregistrés ; un autre onglet déjà ouvert garde sa langue jusqu’au rechargement.

Ces réglages sont globaux au site, conservés dans SQLite et initialisés à `fr` / `fr`. Ils ne dépendent ni du navigateur, ni du thème. Les options portent leur nom natif pour rester identifiables. Les modifications non enregistrées déclenchent la protection de navigation habituelle. Un conflit entre deux onglets est signalé et impose de recharger les réglages avant une nouvelle sauvegarde.

## Ce qui est traduit

Navigation, pages, boutons, formulaires, aides, états vides, dialogues, erreurs applicatives, chat et propositions, libellés du catalogue, options et statuts, textes accessibles, titres et descriptions fixes des pages : tous les textes d’interface contrôlés par le code possèdent une version française et anglaise. Les dates, nombres, montants et pluriels suivent la langue de l’interface. La connexion utilise la langue administrative même avant authentification. L’attribut HTML `lang` et l’en-tête `Content-Language` correspondent à la zone visitée.

Les contenus éditoriaux ne sont pas traduits : titres, résumés, corps, noms, relations, métadonnées personnalisées, texte alternatif des médias et messages rédigés restent tels qu’enregistrés. Un contenu français peut donc apparaître dans une interface anglaise. La langue de rédaction de l’assistant, réglée dans **Agents et rédaction**, reste indépendante. Ses nouveaux messages d’accompagnement et de clarification suivent la langue administrative par défaut, sauf demande explicite dans la conversation ; les anciens messages restent inchangés. Le suffixe d’une nouvelle copie est localisé lors de la duplication, sans modifier l’original. Les URL existantes et les slugs sont conservés. La documentation MkDocs reste en français.

## Contrats et sécurité

| Route | Usage |
| --- | --- |
| `GET /api/admin/languages` | Lire `public_language`, `admin_language`, `version` avec une session valide. |
| `PUT /api/admin/languages` | Enregistrer les deux codes et la version lue ; session, origine et jeton CSRF exigés. |
| `GET /api/public/language?area=public` | Lire uniquement `{"language":"fr"}` ou `{"language":"en"}` pour le site public. |
| `GET /api/public/language?area=admin` | Même réponse minimale pour la connexion et le développement Vite. |

Les codes sont strictement limités à `fr` et `en`, les champs supplémentaires sont refusés. Une version périmée donne `409`, sans écraser le choix plus récent. Les réponses dynamiques sont `no-store`. Les routes anonymes n’exposent aucune configuration privée. Lorsque l’administration est désactivée, les deux interfaces utilisent le français.

FastAPI injecte la bonne langue dans le document HTML avant le premier affichage. En développement Vite, le démarrage lit le code public ; si cette lecture échoue, le français sert de repli. Le contexte de langue des API est isolé par requête pour éviter qu’une requête publique ne change la langue d’une requête administrative concurrente.

## Ajouter ou maintenir des traductions

Le frontend utilise i18next et react-i18next avec des clés explicites dans `frontend/src/i18n/locales/fr.json` et `en.json`. Les messages sont interpolés sans HTML et React assure leur échappement. Traduire une phrase complète et utiliser les formes de pluriel, plutôt que concaténer des fragments dépendant du nombre. Les formats de nombres et dates utilisent `Intl`.

Le backend conserve ses textes dans `backend/src/personal_site/locales/`. `schema-keys.json` associe uniquement les métadonnées fixes des modèles à des clés de traduction ; aucune traduction automatique ne s’applique aux valeurs éditoriales. Les tests contrôlent la parité des catalogues, les variables interpolées et la couverture des formulaires. Le contrôle frontend détecte les textes JSX non extraits.

La [migration et le retour arrière](operations.md#migration-des-langues-schema-2-vers-3) nécessitent une sauvegarde avant déploiement. Les [tests](testing.md) couvrent les deux langues et leur indépendance, la persistance, les protections d’accès, le responsive et les deux thèmes.
