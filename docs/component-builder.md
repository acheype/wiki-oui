# ComponentBuilder (spec WikiOui)

Le **ComponentBuilder** est l'interface de paramétrage autogénérée d'un composant (voir [`../CONTEXT.md`](../CONTEXT.md)) : la modale qui permet d'insérer le composant dans une page et de rééditer une occurrence existante — aperçu du rendu en haut, champs en dessous. Ce document spécifie comment elle est construite, à partir de deux sources :

- le **descripteur** : le fichier YAML co-localisé avec le composant (`components/wiki/button.yaml` à côté de `button.tsx`), qui décrit les champs de la modale — types, visibilité conditionnelle et **valeurs par défaut** ;
- le **composant `.tsx`** lui-même, qui fournit l'aperçu (via le vrai pipeline de rendu). Il n'expose rien au builder : c'est un composant React ordinaire, client ou serveur (ADR 0013).

Le descripteur ne joue **jamais** sur l'autorisation de rendu (ADR 0002) : sa présence ajoute le composant au menu « Composants » de l'éditeur, rien d'autre.

Le format du descripteur s'inspire de l'Actions Builder de YesWiki ([`reference/yeswiki-actions-builder.md`](reference/yeswiki-actions-builder.md)) ; la table de traduction en fin de document récapitule tous les écarts.

## Le descripteur

**Un YAML = un composant.** Pas de groupes d'actions : le nom du composant vient du nom de fichier (`button.yaml` → `<Button>`), et tous les champs vivent dans un seul bloc `properties`.

```yaml
label: Bouton                       # nom affiché dans le menu « Composants »
description: Créer un bouton cliquable
previewHeight: 100px                # hauteur de la zone d'aperçu de la modale
properties:
  text:
    label: Texte du bouton
    type: text
    value: Mon bouton               # pré-remplissage à l'insertion (toujours écrit)
  link:
    label: Lien web ou nom d'une page de ce wiki
    hint: Si lien web, n'oubliez pas le "https://"
    type: page-list
    required: true
  color:
    label: Couleur
    type: list
    default: primary                # référence de la règle d'omission
    options:
      default: Défaut
      primary: Primaire
      success: Succès
  newWindow:
    label: Ouvrir dans une nouvelle fenêtre
    type: checkbox
    default: false
    advanced: true                  # masqué derrière « paramètres avancés »
```

Chaque clé de `properties` **est** une prop du composant `.tsx` (camelCase anglais). Le ComponentBuilder génère du MDX : `<Button text="Mon bouton" link="ma-page" color="success" newWindow />`.

### Attributs d'un champ

| Clé | Rôle |
|---|---|
| `label` | Libellé du champ (français en clair — l'i18n est au backlog) |
| `hint` | Indication affichée sous le champ |
| `type` | `text` · `number` · `url` · `icon` · `checkbox` · `list` · `page-list` · `file-list` · `divider` |
| `options` | Pour `list` : map `valeur: libellé` (la valeur est celle écrite dans la prop) |
| `default` | Valeur de référence de la **règle d'omission** ; doit égaler le défaut réel de la prop du composant (vérifié, voir « Vérification »). Absent = défaut vide |
| `value` | Pré-remplissage à l'insertion ; la prop est **toujours** écrite, même inchangée |
| `family` | Pour `file-list` : restreint la combobox à une famille de fichiers (`image` · `pdf` · `other`) |
| `required` | Le champ doit être renseigné pour valider la modale |
| `advanced` | Masqué tant que « paramètres avancés » n'est pas déplié |
| `showif` | Visibilité conditionnelle (voir ci-dessous) |

Le type `divider` incruste un titre de section entre les champs (il ne génère aucune prop) ; combiné à `showif`, il remplace les sections conditionnelles des groupes YesWiki. Le type `file-list` est une combobox des fichiers déjà uploadés (saisie libre acceptée), filtrable par famille de fichiers (le `file-list` d'`Image` ne propose que les images). Le type `icon` ouvre le sélecteur d'icônes Iconify (jeux embarqués déclarés dans `icons.sets` ; la prop stocke l'identifiant, ex. `lucide:settings`).

### Insertion et réédition : toujours symétriques

Tout composant à descripteur est **insérable** depuis le menu « Composants » et **rééditable** sur n'importe quelle occurrence — y compris écrite à la main. Il n'existe pas d'asymétrie déclarable (pas d'équivalent aux `onlyEdit`/`onlyAdd` de YesWiki, sans besoin identifié pour l'instant) : le round-trip est sûr par construction (idempotence, props inconnues préservées), et le type `file-list` rend utilisables à froid les builders qui référencent un fichier. Une prop connue portant une expression (`width={maVariable}`) n'a pas de valeur affichable dans un champ : le champ repart de son défaut et l'expression est abandonnée à la régénération — elle ne rendait rien de toute façon, le bac à sable ne laissant passer que les littéraux (ADR 0002), et c'est justement la valeur que l'auteur vient corriger. Une prop **inconnue** garde son expression telle quelle : c'est du JSX valide que le descripteur ne décrit pas. Les autres portes d'entrée — bouton **Uploader**, bouton **Ajouter un lien** — ne sont que des raccourcis qui ouvrent le même builder pré-rempli. Dans l'éditeur, la réédition s'offre par le motif des outils ancrés (ADR 0005) : curseur dans la balise → crayon flottant → builder en mode édition.

### Les défauts vivent dans le YAML (ADR 0013)

Chaque champ déclare son `default` dans le descripteur ; le composant n'exporte plus rien. Il garde ses propres défauts inline (déstructuration), qui servent son rendu ; le `default` du YAML sert le builder. La cohérence des deux est **vérifiée** (voir « Vérification »), pas imposée par un contrat de compilation.

```yaml
color:
  label: Couleur
  type: list
  default: primary          # référence de la règle d'omission
  options: { … }
```
```tsx
// button.tsx : le même défaut, côté composant — c'est ce que le vérificateur croise
function Button({ color = "primary" }: ButtonProps) { … }
```

- **Règle d'omission** : à la génération, toute prop égale à son `default` est omise du MDX. À la ré-édition (mapping inverse), une prop absente du code s'affiche dans la modale avec son `default`.
- **Idempotence** : ouvrir la modale sur un composant existant et valider sans rien changer régénère un code identique.
- **Props inconnues préservées** : une prop écrite à la main et absente du descripteur (ex. `className`) est recopiée telle quelle à la régénération.
- Un champ **sans** `default` (ex. `text`, `link`) a un défaut vide (`undefined`) : sa prop n'est écrite que si l'auteur la renseigne.

### Vérification du descripteur

Deux familles de checks, **complémentaires** — la signature ne remplace qu'*un seul* ancien check structurel (« champ ∈ défauts exportés » devient « champ ∈ props »).

**Structurels** — le YAML est-il auto-cohérent, sans regarder le composant : type de champ connu ; `default` d'une `list` ∈ ses `options` ; cibles de `showif` existantes et regex valides ; `family` connue ; `emits` valide.

**Signature** — le YAML colle-t-il au composant ? On parse la *source* du `.tsx` (jamais on ne l'importe, pour rester indifférent à `"use client"` ; le projet TS est chargé pour résoudre types importés, unions et défauts — un défaut est tracé jusqu'à un littéral : direct, constante, propriété d'objet, importés compris). **Uniquement pour les émetteurs de balise** (les émetteurs `markdown-link` n'ont que les structurels), et on **saute les champs `divider`** :

| Détecte | Constat |
|---|---|
| champ YAML ∉ props du composant | erreur — nom de prop erroné |
| prop obligatoire au runtime (requise en TS + sans défaut de déstructuration) sans `required` | erreur — obligatoire oublié |
| type du champ ≠ type de la prop | erreur — incompatibilité |
| `options` / `default` d'une `list` hors de l'union de la prop | erreur — valeur invalide |
| `default` YAML ≠ défaut de déstructuration du composant | erreur — dérive des défauts |
| type de `value` ≠ type de la prop | erreur — pré-remplissage mal typé |
| `default` calculé au runtime (appel de fonction…) | **avertissement** — non vérifiable |

`default` est vérifié **en type et en dérive** (il pilote l'omission → il doit égaler le défaut du composant) ; `value`, pré-remplissage toujours écrit, **en type seulement** — il a le droit de différer.

**Surfaçage uniforme, par `throw`** (pas de bandeau) : structurel comme signature `throw`ent un message clair, préfixé du **fichier et de la ligne** exacts — `components/wiki/button.yaml:20` pointe la clé fautive (le `type:`, le `default:`…) ; un constat de signature ajoute en plus la ligne du composant (`… (components/wiki/button.tsx:78)`). Le structurel tourne partout ; le signature en **dev** (chargement de l'éditeur) et au **build** (`prebuild`). En **dev**, l'overlay d'erreur Next s'affiche sur la page — le développeur voit *pourquoi*, corrige, sauve. Au **build**, le `prebuild` échoue. En **prod**, le structurel reste fail-fast, le signature est absent (`ts-morph` est une *devDependency* hors bundle ; un build vert garantit la cohérence). Le seul avertissement (`default` non vérifiable) part en `console.warn`, non bloquant. Le rendu correct, lui, reste couvert par l'aperçu live de la modale (vrai pipeline).

### `showif` : visibilité conditionnelle

Un map `champ: condition` ; plusieurs entrées = **ET** logique. La condition s'écrit :

```yaml
showif:
  ratio: portrait        # valeur nue → égalité stricte (valeur stringifiée)
  displaypdf: true       # booléen YAML : état d'une checkbox
  caption: notNull       # mot-clé → champ non vide
  legend: null           # null YAML → champ vide
  file: /\.(png|jpg)$/   # entre /…/ → expression régulière (recherche)
```

Une valeur littérale ambiguë (le texte `notNull`, une valeur commençant par `/`) s'écrit en forme regex : `/^notNull$/`. Une regex invalide échoue au chargement.

- **Réactivité** : les champs apparaissent/disparaissent en direct pendant la saisie.
- **Masqué = vide** : un champ masqué n'émet jamais sa prop dans le MDX généré, et compte comme vide pour les `showif` qui pointent sur lui (le masquage cascade).
- **Factorisation** : une condition partagée par plusieurs champs se factorise avec les ancres YAML natives (`&image` / `*image`).

## Cible de sérialisation

Par défaut, un builder émet la **balise JSX** de son composant (`<Button … />`) et sait la re-parser. Un descripteur peut déclarer une autre cible avec la clé `emits` ; la seule alternative est le lien markdown :

```yaml
# components/wiki/wiki-link.yaml
emits: markdown-link      # émet [texte](cible){{ target: '…' }} au lieu de <WikiLink …/>
```

Le menu « Composants » ne liste que les descripteurs qui émettent des balises de composant ; `wiki-link` a ses portes dédiées (bouton « Ajouter un lien », bouton flottant d'édition de lien). Le moteur — champs, `advanced`, `showif`, aperçu, mapping inverse, idempotence — est identique dans les deux cas.

## Table de traduction YesWiki → WikiOui

| YesWiki (Actions Builder) | WikiOui |
|---|---|
| Un YAML = un *groupe* de plusieurs `actions` | Un YAML = **un composant** (nom dérivé du fichier) |
| Bloc `commons` partagé entre actions | Champs inlinés dans `properties` ; regex factorisées par ancres YAML |
| Sections titrées (`title`, `width` par action) | Type `divider` (avec `showif` au besoin) |
| `_t(AB_…)` + fichier de traduction PHP | Texte français en clair (i18n au backlog) |
| `{{button class="btn-primary pull-right"}}` | Props MDX dédiées : `<Button color="primary" float="right" />` |
| Type `class` + `subproperties` | Supprimé — chaque sous-propriété devient une prop de premier rang |
| Vocabulaire Bootstrap des classes | Remplacé par le vocabulaire Tailwind : `pull-right` → `float="right"` ; `btn-block` → `fullWidth` |
| `btn-default`, `btn-primary`, `btn-secondary-1`… | Valeurs de la prop `color` : `default`, `primary`, `secondary-1`, `secondary-2`, `success`, `info`, `warning` (ex-attention), `danger`, `link` |
| `attach` : classes `position` (none/left/center/right) | Prop `align` d'`<Image>` (`none`/`left`/`center`/`right`) |
| `attach` : classes `effect-whiteborder` / `effect-lightshadow` / `effect-zoom` | Props booléennes d'`<Image>` : `whiteBorder` / `shadow` / `hoverZoom` |
| `attach` : `nofullimagelink` (négatif) | Prop `lightbox` d'`<Image>` (sens positif inversé) |
| `attach` : `displaypdf` (checkbox) | Le mini-choix post-upload route vers `<Pdf>` ou `<FileLink>` |
| `attach` : ratio `portrait`/`paysage`/`carre` | Valeurs anglaises de la prop `ratio` de `<Pdf>` : `portrait`/`landscape`/`square` |
| `default` (dans le YAML) | **Conservé dans le YAML** (ADR 0013) ; doit égaler le défaut réel de la prop du composant, vérifié par signature |
| `value` | Conservé, même sémantique (pré-remplissage toujours écrit) |
| `checkedvalue` / `uncheckedvalue` | Supprimés — une checkbox est une prop booléenne (`newWindow` / rien) |
| `showif: champ` (raccourci non-vide) | `champ: notNull` |
| `showif: { champ: notNull }` | `champ: notNull` (inchangé) |
| `showif: { champ: valeur-ou-regex }` (ambigu) | Valeur nue = égalité stricte ; regex explicite entre `/…/` |
| `nobtn` (bouton rendu comme lien) | Non repris — un bouton est un bouton, un lien est un lien ; on ne mélange pas les composants |
| `new-window` (liste à option unique, dans `class`) | Prop `newWindow` (checkbox) |
| `modal` / `modalbox-hover` (dans `class`) | Prop `popup` (`click` / `hover`) |
| Action fourre-tout `attach` (image + PDF + fichier) | Éclatée en trois composants : `Image`, `Pdf`, `FileLink` |
| `onlyEdit` / `onlyAdd` (asymétries ajout/édition) | Non repris (pas de besoin pour l'instant) — tout builder insère **et** réédite |
| Type `form-field`, `needFormField` | Supprimés (bazar au backlog) |
| Type `color` | Non repris (aucun composant v0.2 ne l'utilise ; réintroductible) |
| `onlyForAdmins` | Supprimé (droits d'accès au backlog) |
| `icon` (nom Fontawesome sur un champ) | Non repris |
| `mapped` | Non repris |
| `position` (ordre dans le menu) | Non repris — menu trié alphabétiquement par `label` |
| `doclink` | Non repris — la documentation des composants vit dans l'aide-mémoire |
| `isWrapper` / `wrappedContentExample` | Non repris en v0.2 — l'édition des composants wrapper (ex. `<Menu>`) est au backlog, avec préservation des enfants à la réédition |
