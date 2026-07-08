# Les liens internes du wiki sont relatifs (par slug), pas absolus

Un lien vers une autre page du wiki est stocké en **relatif, par le slug de la page** (ex. `[texte](ma-page)`), jamais avec le domaine (`https://monsite.fr/ma-page`).

## Contexte

Le contenu (et donc les liens) est stocké en base sous forme de MDX. Si les liens internes contenaient le domaine, changer le nom de domaine du wiki obligerait à réécrire toutes les données.

## Décision

- Un lien dont la cible est un slug (pas de schéma, pas de `//`) est un **lien wiki** interne, rendu via `<Link href="/{slug}">`.
- Un lien avec `http(s)://` est **externe**, rendu en `<a>` (avec les attributs `target`/`rel` issus de remark-attributes).
- Le champ « nom de la page ou URL » de la modale de lien **autocomplète** sur les slugs existants, tout en laissant saisir une URL externe.

## Conséquences

- Le nom de domaine du wiki peut changer sans toucher aux données.
- Le rendu doit distinguer lien wiki vs externe (heuristique : présence d'un schéma). Le composant lien custom porte aussi le comportement `{.modal}` (ouvrir la page cible dans un `Dialog`).
