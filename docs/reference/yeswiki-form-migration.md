# Migration des formulaires YesWiki → WikiOui : table de correspondance

Référence pour un **futur script de migration** d'un formulaire Bazar YesWiki vers un `Form` WikiOui ([`docs/forms.md`](../forms.md)). Sources : les configurations FormBuilder de YesWiki archivées dans [`fields/`](fields/) (notamment les `attributesMapping`) et le fichier de traductions [`fields/bazarjs_fr.inc.php`](fields/bazarjs_fr.inc.php).

## L'ancien format

Chez YesWiki, un formulaire est un bloc de texte : **une ligne par champ**, chaque ligne étant une suite d'éléments **positionnels séparés par `***`** (pas de JSON). L'index de position détermine l'attribut, selon un mapping qui **varie par type de champ** (le premier élément). Exemple :

```
texte***bf_titre***Titre***40***255*** ***text***1*** ***Aide du champ*** * *** * ***
```

WikiOui remplace tout cela par le descripteur **JSON** de `Form.schema` (attributs nommés, camelCase). Les tables ci-dessous donnent, type par type, la correspondance **index `***` → attribut YesWiki → attribut WikiOui**.

## Correspondances générales

- **Jeton de type (index 0)** : voir la colonne « Type YesWiki » de chaque table. Les jetons marqués *(à vérifier)* sont déduits des fichiers de référence, à confirmer sur un export réel avant d'écrire le script.
- **`name` (bf_xxx)** : conservé comme clé de `data`, mais normalisé au format identifiant WikiOui (kebab-case) — règle exacte à fixer dans le script (ex. `bf_titre` → `bf-titre` ou suppression du préfixe `bf_`).
- **`required`** : `1` → `true`, vide → `false`.
- **Attributs sans équivalent v0.3** (machineries absentes) : `read`/`write` (ACLs — pas d'auth), `searchable`, `semantic`, `queries`, `size`. Le script les **ignore** ; les réintroduire plus tard sera additif (clés JSON).
- Le champ **`title`** : YesWiki n'a pas de champ titre par défaut — le titre vient soit d'un champ `texte` désigné, soit du champ `titre` (titre automatique). Le script doit produire le champ `title` WikiOui correspondant.

## `texte` → `text`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `texte` *(à vérifier)* | `type: "text"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 3 | `size` | — | largeur : affaire du thème |
| 4 | `maxlength` | `maxLength` | |
| 5 | `value` | `defaultValue` | |
| 6 | `pattern` | `pattern` | |
| 7 | `subtype` (`text`/`number`/`range`/`url`/`password`/`color`) | `subtype` (`text`/`number`) | `url` → migrer en type `url` ; `range`/`password`/`color` → `text` + avertissement du script |
| 8 | `required` | `required` | |
| 9 | `searchable` | — | |
| 10 | `hint` | `hint` | |
| 11–12 | `read`/`write` | — | |
| 14 | `semantic` | — | |
| 15 | `placeholder` | `placeholder` | |

## `textelong` → `textarea`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `textelong` *(à vérifier)* | `type: "textarea"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 4 | `rows` | `rows` | |
| 5 | `value` | `defaultValue` | |
| 7 | `syntax` (`wiki`/`html`/`nohtml`) | `allowMdx` | `wiki` → `true` ; `html` (wysiwyg) → `false` + avertissement (backlog) ; `nohtml` → `false` |
| 8 | `required` | `required` | |
| 10 | `hint` | `hint` | |
| 15 | `placeholder` | `placeholder` | |

## `champs_mail` → `email`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `champs_mail` | `type: "email"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 4 | `seeEmailAcls` | — | ACLs |
| 6 | `replace_email_by_button` | — | exige un mailer (backlog) |
| 8 | `required` | `required` | |
| 9 | `send_form_content_to_this_email` | — | exige un mailer (backlog) |
| 10 | `hint` | `hint` | |

## `lien_internet` → `url`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `lien_internet` *(à vérifier ; fichier : `url.js`)* | `type: "url"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 3 | `displayvideo` | — | embed vidéo au backlog |
| 6 | `options` (composite `ratio\|maxwidth\|maxheight`) | — | embed vidéo au backlog |
| 7 | `class` (position vidéo) | — | idem |
| 8 | `required` | `required` | |
| 10 | `hint` | `hint` | |

## `jour` → `date`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `jour` *(à vérifier ; fichier : `date.js`)* | `type: "date"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 5 | `today_button` (` `/`today`) | `initTodayButton` | `today` → `true` |
| 8 | `required` | `required` | |
| 10 | `hint` | `hint` | |

## Champs à options : `liste`/`radio`/`checkbox` (+ variantes `…fiche`) → `list`/`radio`/`multiChoice`

Six jetons YesWiki (confirmés par `fields/commons/attributes.js`) pour trois types WikiOui × deux sources :

| Type YesWiki (index 0) | WikiOui |
| --- | --- |
| `liste` | `list` + options inline |
| `listefiche` | `list` + `sourceFormId` |
| `radio` | `radio` + options inline |
| `radiofiche` | `radio` + `sourceFormId` |
| `checkbox` | `multiChoice` + options inline |
| `checkboxfiche` | `multiChoice` + `sourceFormId` |

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 1 | `listeOrFormId` | `options` **ou** `sourceFormId` | id d'une **Liste** → le script convertit la Liste en options inline (un niveau) ; id **numérique de formulaire** → slug du formulaire migré |
| 2 | `label` | `label` | |
| 5 | `defaultValue` | `defaultValue` | |
| 6 | `name` | `name` | normalisé (⚠ position inhabituelle) |
| 7 | `subtype` (liste) / `fillingMode` (radio, checkbox : ` `/`tags`/`dragndrop`) | `fillingMode` | `dragndrop` → `dragAndDrop` |
| 8 | `required` | `required` | |
| 10 | `hint` | `hint` | |
| 15 | `queries` | — | formulaires liés par requête : backlog |

## `image` → `image`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `image` | `type: "image"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 3 | `thumb_height` | — | vignettes : l'API de redimensionnement à la volée les remplace |
| 4 | `thumb_width` | — | idem |
| 5 | `resize_height` | `resizeHeight` | |
| 6 | `resize_width` | `resizeWidth` | |
| 7 | `align` | — | l'affichage appartient au rendu/gabarit |
| 8 | `required` | `required` | |
| 10 | `hint` | `hint` | |
| 13 | `default_image` | — | |
| 14 | `maxsize` | — | limites par famille dans la config globale (ADR 0012) |

## `fichier` → `file`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `fichier` *(à vérifier ; fichier : `file.js`)* | `type: "file"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 6 | `readlabel` | — | le rendu affiche le nom du fichier |
| 7 | `authorizedExts` | — | config globale des familles |
| 8 | `required` | `required` | |
| 10 | `hint` | `hint` | |
| 14 | `maxsize` | — | config globale |

## `map` → `geolocation`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `map` *(à vérifier)* | `type: "geolocation"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 3 | *(vide)* | — | |
| 4 | `autocomplete_postalcode` | `postalCodeField` | |
| 5 | `autocomplete_town` | `townField` | |
| 6 | `autocomplete_other` (composite `geolocate\|street\|street1\|street2\|county\|state`) | à éclater : `geolocateButton` · `streetField` · `street1Field` · `street2Field` · `countyField` · `stateField` | le script découpe sur `\|` |
| 7 | `show_map_in_entry_view` | — | le rendu par défaut affiche toujours la carte |
| 8 | `required` | `required` | |
| 9 | `geometries` | — | formes multiples : backlog (marqueur seul en v0.3 ; avertir si ≠ `marker`) |
| 10 | `hint` | `hint` | |
| 13 | `max_geometries` | — | idem |

## `tags` → `tags`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `tags` | `type: "tags"` | |
| 1 | `name` | `name` | normalisé |
| 2 | `label` | `label` | |
| 10 | `hint` | `hint` | |

⚠ Les **valeurs** migrent différemment : les mots-clés d'une fiche YesWiki deviennent des **`Page.tags`** de la Page-fiche (fusion avec les tags du wiki), pas une clé de `data`.

## `labelhtml` → `customContent`

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `labelhtml` | `type: "customContent"` | |
| 1 | `content_saisie` | `entryContent` | contenu HTML/wiki → **MDX** : conversion de syntaxe à prévoir dans le script |
| 2 | *(vide)* | — | |
| 3 | `content_display` | `displayContent` | idem conversion |
| 4 | `useWikiSyntax` | — | toujours MDX chez WikiOui |

## `titre` → `title` (mode automatique)

| Index | YesWiki | WikiOui | Note |
| --- | --- | --- | --- |
| 0 | type = `titre` | `type: "title"` avec `automatic: true` | |
| 1 | `value` (template) | `template` | syntaxe source `{{bf_xxx}}` *(à vérifier)* → `{xxx}` (accolades simples, noms normalisés) |
| 2 | `label` | `label` | |

Un formulaire YesWiki **sans** champ `titre` : le script désigne le champ texte servant de titre (convention YesWiki : `bf_titre`) et le convertit en champ `title` WikiOui (`automatic: false`).

## Hors migration v0.3

Types YesWiki sans équivalent (le script les signale et les ignore) : `listefichesliees`, `utilisateur_wikini`, `acls`, `metadatas`, `inscriptionliste`, `reactions`, `collaborative_doc`, `bookmarklet`, `calc`, `openinghours`, `hidden`, `custom`, `tabs`/`tabchange`, `conditionschecking` (affichage conditionnel : backlog).
