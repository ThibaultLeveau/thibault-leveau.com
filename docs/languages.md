# Site et collections bilingues

Le site public et les quinze collections disposent de versions françaises et anglaises. La langue de l’interface administrative reste indépendante de la version éditoriale que vous modifiez. La documentation MkDocs reste en français.

## Choisir la langue du site

Le sélecteur **Français / English** est disponible dans l’en-tête, sur ordinateur et mobile. Il conserve la page, la recherche, les filtres et l’ancre. Les pages possèdent des URL explicites `/fr` et `/en`, par exemple `/en/projets` ; les slugs et identifiants des fiches sont partagés. Les anciennes URL restent des points d’entrée vers la même page.

L’URL explicite prime sur le cookie fonctionnel `site_language` (un an, `SameSite=Lax`, `Secure` en HTTPS). Sans ces choix, **Réglages du site → Langue → Site public** détermine la langue par défaut. Le réglage administratif est global et s’applique aussi à la connexion. Les champs de réglage sont versionnés : une sauvegarde périmée renvoie `409`.

FastAPI produit le `lang` HTML, `Content-Language`, le titre, la description, la canonique et les alternatives `hreflang`. Une fiche n’annonce que ses versions disponibles. Une traduction absente, en brouillon ou périmée affiche le contenu d’origine avec une indication et un lien vers l’original ; les textes portent leur langue effective. Les critères **Prêt + Public**, le consentement et l’anonymat continuent de s’appliquer dans les deux langues.

## Modifier une collection

L’éditeur propose deux boutons de version, avec les états **À traduire**, **Brouillon**, **Validée** ou **À actualiser**. La version d’origine conserve le formulaire complet. L’autre version présente les textes traduisibles et permet de consulter chaque texte d’origine. Les dates, montants exacts, devises, codes, consentements, relations, fichiers et structures de listes sont communs : ils se modifient dans la version d’origine.

Les titres, résumés, descriptions, textes métier, SEO, libellés, contextes de relations, textes alternatifs, légendes et transcriptions sont traduisibles selon un registre fermé. Les notes privées, identifiants, URL et preuves restent partagés. Les noms propres peuvent être conservés tels quels dans une traduction.

**Enregistrer le brouillon** conserve une traduction sans la publier. Dans **Relecture**, **Enregistrer et valider la traduction** rend cette version disponible lorsque la fiche d’origine est prête et publique. Relire tous les champs avant cette validation : une version manquante utilise les textes d’origine comme point de départ, avec une indication explicite. Le changement de version protège les modifications non enregistrées, comme toute autre navigation dans le studio.

Une modification des textes ou faits de la version d’origine marque les traductions **À actualiser**. Les changements de visibilité, de mise en avant, d’ordre ou d’URL ne les invalident pas. Leurs textes scalaires restent éditables ; une ligne de liste modifiée ou déplacée ne réutilise pas le texte de son ancienne position. Le champ indique alors le retour au texte d’origine. Les anciens textes dissociés restent consultables dans l’éditeur et la proposition avant remplacement ; ils restent en base jusqu’à la prochaine sauvegarde explicite de cette variante. Une duplication conserve les traductions comme brouillons à actualiser ; l’archivage, les fichiers et les relations restent communs.

## Génération et traduction par l’IA

Avant chaque envoi du chat, un dialogue demande **Quelle version voulez-vous modifier ?**. Ce choix explicite prime sur la langue des préférences rédactionnelles. Les réponses et explications de l’assistant suivent la langue de l’administration ; les contenus proposés ciblent la version choisie. Une modification partielle d’une variante manquante ou périmée reste un brouillon.

Après une sauvegarde manuelle ou l’application d’une proposition IA, une section propose de générer l’équivalent dans l’autre langue. **Plus tard** permet de continuer sans appel au fournisseur. La traduction utilise les textes enregistrés et le fournisseur configuré ; les notes privées et les faits partagés ne sont pas envoyés par ce parcours. La consigne nomme explicitement la langue cible ; seuls les textes réellement enregistrés dans cette version sont fournis comme contexte existant, sans y mélanger le repli sur la langue source. Aucun appel IA n’a lieu lors de la lecture publique.

Le résultat est une proposition avec comparaison des textes existants et proposés. Rien n’est remplacé avant **Enregistrer les fiches**. Le serveur valide les champs, les limites et la version de la fiche lors de la préparation puis de l’application. Toute modification concurrente invalide la proposition entière. L’application est atomique et idempotente ; les règles de session, origine, CSRF, expiration, annulation et limites du fournisseur sont celles de l’assistant existant. Une traduction complète appliquée est validée ; sa visibilité dépend toujours de la fiche d’origine.

## Contrats

| Route | Comportement |
| --- | --- |
| `GET/PUT /api/admin/languages` | Réglages globaux `public_language`, `admin_language`, `version` ; écriture protégée. |
| `GET /api/public/language?area=public` ou `admin` | Code par défaut de la zone, sans configuration privée. |
| `GET /api/admin/content/{kind}/{id}?language=en` | Variante et métadonnées `localization` : origine, états et champs traduisibles. Sans paramètre : version d’origine. |
| `PUT /api/admin/content/{kind}/{id}` | `entry`, `version`, `language` facultative, `as_draft`. La version protège l’ensemble de la fiche et ses deux langues. |
| `POST /api/admin/assistant/turn` | `language` obligatoire, `fr` ou `en`, en plus du contrat conversationnel existant. |
| Même route avec `translation` | `{kind, entry_id, version, source_language}` ; la langue cible est `language`. Produit une proposition, sans écrire le contenu. |
| `GET /api/public/home`, `/entries`, `/entries/{kind}/{id}` | Paramètre `language=fr` ou `en`, projection publique localisée et liens préfixés. |

Les résumés publics exposent `language`, `translation_available` et `source_url`. Les fiches ajoutent `available_languages`. Aucun état administratif, texte privé ni champ de traduction interne n’est exposé. Les codes de requête sont fermés ; les réponses dynamiques restent `no-store`. Le contexte de langue est isolé par requête.

## Stockage et performance

La migration additive **3 → 4**, approuvée dans l’[issue #20](https://github.com/ThibaultLeveau/thibault-leveau.com/issues/20#issuecomment-6917635569), ajoute `content_localizations` et `content_localized_values` dans SQLite. Une variante contient des valeurs textuelles par chemin contrôlé, un état, une empreinte de la source et des empreintes de lignes. Elle ne duplique ni identité de fiche ni relations. Les champs nouveaux restent partagés jusqu’à leur ajout explicite au registre `content/localization.py`.

La recherche et le tri utilisent les titres/résumés localisés dans une projection SQL paginée ; les corps longs restent chargés sur les fiches. Les textes supplémentaires des cartes sont chargés par lot, jamais par champ. Les traductions éditoriales sont conservées en base et incluses dans les sauvegardes avec les médias.

Les interfaces utilisent des clés explicites i18next/react-i18next, avec parité des catalogues FR/EN, pluriels et interpolation sans HTML. `Intl` formate dates, nombres et montants. Vite construit un asset avec empreinte par catalogue et charge seulement la langue active avant le premier rendu. Le cache immuable sert ces assets ; les catalogues déjà chargés restent en mémoire. Une petite ressource bilingue affiche un bouton de reprise si le téléchargement échoue. Un changement administratif charge le catalogue avant d’enregistrer le réglage.

Les messages et métadonnées de schéma backend utilisent les catalogues de `backend/src/personal_site/locales/`. Leur traduction n’altère jamais directement les valeurs éditoriales. Voir les [tests](testing.md), la [migration](operations.md#migration-des-collections-bilingues-schema-3-vers-4) et le [déploiement](deployment.md#livraison-des-collections-bilingues).
