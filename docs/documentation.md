# Maintenir la documentation

## Sources et rendu

Chaque page Markdown de `docs/` est construite par MkDocs Material. `mkdocs.yml` définit le nom du site, la langue, la navigation, la recherche, les palettes et les validations. Le CSS complémentaire réside dans `docs/stylesheets/extra.css`.

```bash
make docs
```

La prévisualisation est accessible à `http://127.0.0.1:8001/documentation/`. Pour produire uniquement la version distribuable :

```bash
uv run --frozen --group docs mkdocs build --strict
```

La sortie `build/documentation/` est ignorée par Git et copiée dans l'image applicative. Ne jamais corriger directement ces fichiers : une prochaine construction écraserait la modification.

## Préfixe et liens

`site_url` vaut `https://new.thibault-leveau.com/documentation/`. Ce préfixe est nécessaire aux URL canoniques et à la prévisualisation. La configuration respecte le comportement décrit dans la [référence MkDocs](https://www.mkdocs.org/user-guide/configuration/#site_url).

Les liens entre pages utilisent leur nom de source Markdown :

```markdown
[Configuration](configuration.md)
[Paramètres applicatifs](configuration.md#parametres-applicatifs)
```

MkDocs les transforme en chemins de pages construits. Préférer ces liens aux URL commençant par `/`, qui peuvent sortir accidentellement de `/documentation/`. Les URL externes doivent être complètes et pointer vers leur destination utile.

Les titres génèrent les ancres. Renommer un titre peut donc casser les liens qui le visent. La validation des ancres est activée pour détecter cette situation pendant la construction stricte.

## Ajouter ou modifier une page

1. Modifier ou créer le fichier Markdown sous `docs/`.
2. Ajouter la page à `nav` dans `mkdocs.yml` si elle est nouvelle.
3. Relier la page aux guides concernés avec des liens relatifs.
4. Vérifier les commandes et paramètres contre le code actuel.
5. Construire avec `--strict`, puis ouvrir la page à son URL imbriquée.
6. Vérifier la recherche si des termes importants ou une nouvelle page ont été ajoutés.

Toutes les pages doivent avoir un titre principal unique et une progression claire. Les exemples shell doivent indiquer leur répertoire de départ, leur objectif et les conséquences d'une commande qui modifie la production.

## Validation stricte

Les anomalies de navigation, pages manquantes, ancres absentes et liens locaux non reconnus sont configurées en avertissements. `strict: true` et `mkdocs build --strict` transforment ces avertissements en échec de construction.

Cette vérification porte sur les sources documentaires. Elle ne garantit pas la disponibilité d'un lien Internet, ni le fonctionnement de la recherche JavaScript derrière le proxy. Les tests navigateur vérifient le chargement de la documentation sous son préfixe, la navigation depuis une page imbriquée et un résultat de recherche sur « FastAPI ».

## Recherche et thème

Le plugin de recherche produit un index local que le navigateur utilise sans API distante. Le français est la langue configurée. La recherche doit fonctionner après publication de la page et de ses assets dans le même répertoire construit.

Material gère son thème indépendamment du site React. `font: false` désactive le chargement automatique des polices Google, conformément à la [configuration des polices de Material](https://squidfunk.github.io/mkdocs-material/setup/changing-the-fonts/#autoloading).

## Conventions éditoriales

Documenter les comportements observables, leurs conditions et les limites utiles. Ne pas annoncer qu'un déploiement ou un test a réussi sans résultat correspondant. Les décisions durables vont dans [Décisions techniques](decisions.md), les commandes d'exploitation dans [Exploitation](operations.md) et les symptômes dans [Dépannage](troubleshooting.md).

Une modification de route, de variable, de port, de politique de cache ou de commande doit mettre à jour son guide dans la même contribution. Conserver les versions exactes des bibliothèques dans les fichiers de verrouillage ; les pages indiquent les familles d'outils et les versions de runtime requises.
