# ComponentBuilder (spec WikiOui)

Le **ComponentBuilder** est l'interface de paramétrage autogénérée d'un composant (voir [`../CONTEXT.md`](../CONTEXT.md)) : la modale qui permet d'insérer le composant dans une page et de rééditer une occurrence existante — aperçu du rendu en haut, champs en dessous. Ce document spécifie comment elle est construite, à partir de deux sources :

- le **descripteur** : le fichier YAML co-localisé avec le composant (`modules/pages/wiki-components/button.yaml` à côté de `button.tsx` — chaque module porte le `wiki-components/` de son concept, ADR 0029), qui décrit les champs de la modale — types, visibilité conditionnelle, **valeurs d'omission** (`default`) et **préremplissages de création** (`initialValue`, `initialContent`) ;
- le **composant `.tsx`** lui-même, qui fournit l'aperçu (via le vrai pipeline de rendu). Il n'expose rien au builder : c'est un composant React ordinaire, client ou serveur (ADR 0013).

Le descripteur ne joue **jamais** sur l'autorisation de rendu (ADR 0002) : sa présence ajoute le composant au menu « Composants » de l'éditeur, rien d'autre.

Le format du descripteur s'inspire de l'Actions Builder de YesWiki ([`reference/yeswiki-actions-builder.md`](reference/yeswiki-actions-builder.md)) ; la table de traduction en fin de document récapitule tous les écarts.

## Le descripteur

**Un YAML = un composant.** Pas de groupes d'actions : le nom du composant vient du nom de fichier (`button.yaml` → `<Button>`), et ses champs vivent dans un bloc `properties`. Un composant **feuille** (`<Button … />`) s'arrête là ; un composant **wrapper**, qui comporte du contenu entre ses balises, déclare soit `initialContent:` pour un contenu libre, soit `children:` pour une liste de balises filles gérée par le builder (voir « Composants wrapper »). Ces deux modes sont exclusifs.

```yaml
label: Bouton                       # nom affiché dans le menu « Composants »
description: Créer un bouton cliquable
previewHeight: 100px                # hauteur de la zone d'aperçu de la modale
properties:
  text:
    label: Texte du bouton
    type: text
    initialValue: Mon bouton        # pré-remplissage à l'insertion (toujours écrit)
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

### Clés d'un champ

| Clé | Rôle |
| --- | --- |
| `label` | Libellé du champ (français en clair — l'i18n est au backlog) |
| `checkboxLabel` | Pour une `checkbox`, libellé placé à côté de la case lorsque `label` sert de titre au-dessus |
| `hint` | Indication affichée sous le champ |
| `type` | Widget : `text` · `number` · `url` · `icon` · `checkbox` · `list` · `radio` · `page-list` · `file-list` · `form-list` · `view-picker` · `form-field` · `field-rows` · `color-mapping` · `icon-mapping` · `map-view` · `acl` · `divider` |
| `prop` | Nom de la prop émise lorsqu'il diffère de la clé du champ |
| `options` | Pour `list` et `radio` : map `valeur: libellé` (la valeur est celle écrite dans la prop) |
| `icons` | Pour `view-picker` : map `valeur: icône Iconify` affichée sur chaque choix |
| `prefill` | Pour chaque choix, valeurs proposées aux champs frères encore à leur défaut |
| `default` | Valeur de référence de la **règle d'omission** ; doit égaler le défaut réel de la prop du composant (vérifié, voir « Vérification »). Absent = défaut vide |
| `initialValue` | Pré-remplissage à l'insertion ; la prop est **toujours** écrite, même inchangée |
| `family` | Pour `file-list` : restreint la combobox à une famille de fichiers (`image` · `pdf` · `other`) |
| `multiple` | Pour `form-list` et `form-field` : la prop contient plusieurs noms |
| `formFrom` | Pour les champs liés à un formulaire : champ frère qui fournit le ou les formulaires sources |
| `fieldTypes` | Types de champs de formulaire proposés |
| `pseudoFields` | Pseudo-champs proposés avec les champs réels |
| `withIcon` | Pour `field-rows` : chaque ligne peut aussi porter une icône |
| `fieldFrom` | Pour les mappings : champ frère dont les options deviennent les clés |
| `required` | Le champ doit être renseigné pour valider la modale |
| `advanced` | Masqué tant que « paramètres avancés » n'est pas déplié |
| `showif` | Visibilité conditionnelle (voir ci-dessous) |

Le type `divider` incruste un titre de section entre les champs (il ne génère aucune prop) ; combiné à `showif`, il remplace les sections conditionnelles des groupes YesWiki. Une `checkbox` affiche normalement `label` à côté de la case ; avec `checkboxLabel`, `label` devient le titre du champ et `checkboxLabel` le texte de la case. Le type `radio` présente les choix d'une prop chaîne sous forme de boutons radio. Le type `file-list` est une combobox des fichiers déjà uploadés (saisie libre acceptée, Entrée prend la suggestion surlignée), filtrable par famille de fichiers (le `file-list` d'`Image` ne propose que les images). Le type `icon` ouvre le sélecteur d'icônes Iconify (jeux embarqués déclarés dans `icons.sets` ; la prop stocke l'identifiant, ex. `lucide:settings`).

`prop` permet à plusieurs champs contextuels d'émettre la même prop. Par exemple, les champs `outlineColor` et `accentColor` de `<Accordion>` écrivent tous deux la prop `color`, mais leurs `showif` font qu'un seul est visible selon l'apparence choisie. `prefill` exprime une suggestion déclenchée par un choix : dans `<EntriesView>`, choisir la vue `agenda` propose `period: future`, uniquement si `period` est encore à son défaut ; une valeur déjà choisie par l'auteur n'est jamais écrasée.

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
| --- | --- |
| champ YAML ∉ props du composant | erreur — nom de prop erroné |
| prop obligatoire au runtime (requise en TS + sans défaut de déstructuration) sans `required` | erreur — obligatoire oublié |
| type du champ ≠ type de la prop | erreur — incompatibilité |
| `options` / `default` d'une `list` hors de l'union de la prop | erreur — valeur invalide |
| `default` YAML ≠ défaut de déstructuration du composant | erreur — dérive des défauts |
| type de `initialValue` ≠ type de la prop | erreur — pré-remplissage mal typé |
| `default` calculé au runtime (appel de fonction…) | **avertissement** — non vérifiable |

`default` est vérifié **en type et en dérive** (il pilote l'omission → il doit égaler le défaut du composant) ; `initialValue`, pré-remplissage toujours écrit, **en type seulement** — il a le droit de différer.

**Surfaçage uniforme, par `throw`** (pas de bandeau) : structurel comme signature `throw`ent un message clair, préfixé du **fichier et de la ligne** exacts — `modules/pages/wiki-components/button.yaml:20` pointe la clé fautive (le `type:`, le `default:`…) ; un constat de signature ajoute en plus la ligne du composant (`… (modules/pages/wiki-components/button.tsx:78)`). Le structurel tourne partout ; le signature en **dev** (chargement de l'éditeur) et au **build** (`prebuild`). En **dev**, l'overlay d'erreur Next s'affiche sur la page — le développeur voit *pourquoi*, corrige, sauve. Au **build**, le `prebuild` échoue. En **prod**, le structurel reste fail-fast, le signature est absent (`ts-morph` est une *devDependency* hors bundle ; un build vert garantit la cohérence). Le seul avertissement (`default` non vérifiable) part en `console.warn`, non bloquant. Le rendu correct, lui, reste couvert par l'aperçu live de la modale (vrai pipeline).

**Coût en dev, mémoïsé.** La vérification de signature (résolution de types ts-morph) coûte plusieurs secondes ; pour ne pas la payer à chaque chargement de l'éditeur, `modules/authoring/descriptors.ts` met le résultat en cache, invalidé par une empreinte du **contenu** des `.yaml`/`.tsx` de **tous** les `wiki-components/` (un par module qui en possède, ADR 0029). Le contenu plutôt qu'un couple mtime+taille : au nombre de fichiers concernés le coût est le même, et un `touch` cesse de passer pour une édition. Éditer un descripteur ou un composant re-déclenche donc la vérification sans redémarrage ; seul un changement dans une constante importée d'**en dehors** du dossier passe inaperçu (redémarrer le dev server dans ce cas rare).

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
- **Prop partagée** : plusieurs champs conditionnels peuvent écrire la même prop avec `prop:`. Quand un changement remplace un champ visible par un autre, le builder conserve la valeur courante si les `options` du nouveau champ l'acceptent ; sinon, celui-ci reprend son propre défaut.
- **Factorisation** : une condition partagée par plusieurs champs se factorise avec les ancres YAML natives (`&image` / `*image`).

## Composants wrapper

Un composant **wrapper** enveloppe du contenu entre ses balises (`<Tabs>…</Tabs>`, `<Menu>…</Menu>`), là où un composant **feuille** porte tout dans ses props (`<Button … />`). La règle qui tranche (ADR 0031) : le **contenu** — le MDX écrit par l'auteur — vit dans les enfants, la **config** dans les props. Un composant n'est donc wrapper que si ses enfants sont du contenu.

Un wrapper à descripteur s'édite de deux façons, selon qu'il déclare `initialContent:` ou `children:`. Un descripteur qui déclare les deux est refusé.

### Contenu libre (avec `initialContent:`)

Le builder ne gère que les **props** du wrapper ; la clé racine `initialContent:` fournit le MDX initial inséré entre les balises. L'auteur le modifie ensuite librement dans l'éditeur, et la réédition des props le **préserve octet pour octet**, composants imbriqués compris. La clé n'est jamais une prop React.

```yaml
label: Bloc dépliable
initialContent: Contenu du bloc dépliable à modifier
properties:
  title:
    label: Titre
    type: text
    required: true
```

### Liste d'enfants gérée (avec `children:`)

Quand on veut que l'interface graphique **crée et gère une liste de balises filles**, le wrapper déclare une section `children:` à côté de `properties`. Elle décrit l'**enfant répétable** : le composant qu'il émet, son libellé, et le bloc `properties` des props que le parent édite dans ce contexte. La balise fille correspond toujours à un composant du **registre de composants**. Elle peut avoir son propre descripteur lorsqu'elle est aussi insérable seule ; `children.properties` reste alors la surface contextuelle du parent, pas une copie de son builder autonome. Un enfant qui n'existe qu'à l'intérieur de son wrapper, comme `<Tab>`, n'a en revanche aucun descripteur propre. Exemple avec `<Tabs>`/`<Tab>` :

```yaml
label: Onglets
previewHeight: 300px
properties:
  display:
    label: Apparence
    type: list
    default: segmented
    options:
      segmented: Segments
      separated: Pastilles
      folder: Dossiers
      underline: Soulignement
  orientation:
    label: Orientation
    type: list
    default: horizontal
    options:
      horizontal: Horizontale
      vertical: Verticale
children:
  component: Tab
  label: Onglet
  collectionLabel: Onglets
  selection:
    prop: default
    initial: first
  singleChildWarning: Ce groupe ne contient qu'un onglet…
  anchorField: title
  initialContent: Contenu de l'onglet à modifier
  properties:
    title:
      label: Titre
      type: text
      initialValue: Titre de mon onglet
      required: true
    icon:
      label: Icône
      type: icon
```

| Clé de `children` | Rôle |
| --- | --- |
| `component` | Nom exact du composant enfant dans le registre, par exemple `Tab` ou `Collapsible` |
| `label` | Nom singulier d'un enfant dans l'interface |
| `collectionLabel` | Titre de la liste répétable |
| `selection` | Sélecteur facultatif de l’enfant ouvert au chargement (voir ci-dessous) |
| `singleChildWarning` | Conseil non bloquant affiché lorsqu'il ne reste qu'un enfant |
| `anchorField` | Champ de `children.properties` dont la valeur fournit l’ancre de l’enfant. Il doit être de type chaîne, requis, toujours visible et avoir un `initialValue` non vide. Les ancres doivent être uniques. |
| `initialContent` | MDX placé dans chaque enfant nouvellement créé, sans jamais remplacer son contenu existant |
| `properties` | Champs des props de l'enfant ; ils acceptent les mêmes clés et comportements que les champs du wrapper |

Le contenu d'un enfant n'est **pas** une prop : c'est le MDX écrit entre ses balises, dans l'éditeur. Le builder génère la structure, l'auteur remplit le contenu :

```mdx
<Tabs>
  <Tab title="Présentation" icon="lucide:info">
Contenu de la présentation…
  </Tab>
  <Tab title="Contact">
Contenu de contact…
  </Tab>
</Tabs>
```

Les `properties` du parent deviennent les réglages globaux ; celles de `children` deviennent les champs de chaque enfant. Le builder crée deux enfants à l’insertion, puis permet d’en ajouter, d’en réordonner et d’en supprimer. Le champ désigné par `anchorField` reçoit une valeur initiale numérotée (`Titre de mon onglet 1`, `Titre de mon onglet 2`), et `children.initialContent` fournit le contenu de chacun. À la réédition, les contenus existants sont préservés.

#### Sélection initiale (`children.selection`)

Ce bloc facultatif ajoute le choix de l’enfant ouvert au chargement. Sans lui, le builder gère la liste d’enfants sans proposer de sélection initiale. Lorsqu’il est présent, ses deux clés sont obligatoires :

| Clé | Rôle |
| --- | --- |
| `prop` | Nom de la propriété du **parent** qui reçoit l’ancre de l’enfant choisi, par exemple `default` pour `Tabs` et `Accordion` |
| `initial` | Comportement lorsque cette propriété est omise : `first` pour le premier enfant, `none` pour aucun enfant |

Les choix du sélecteur viennent des enfants présents. La valeur écrite dans le MDX est l’ancre issue de leur `anchorField` : avec `anchorField: title`, choisir l’onglet « Contact » écrit `default="contact"` sur `<Tabs>`.

- Avec **`initial: first`**, le premier enfant est sélectionné en l’absence de choix. Choisir le premier omet la propriété ; choisir un autre écrit son ancre. Le sélecteur ne propose pas « Aucun ».
- Avec **`initial: none`**, aucun enfant n’est sélectionné en l’absence de choix. Choisir un enfant écrit son ancre, même si c’est le premier. Choisir « Aucun » omet la propriété.

Le nom donné par `prop` doit correspondre à une propriété chaîne du composant parent, qui accepte d’être omise. Elle est déclarée uniquement dans `selection`, sans la répéter dans les `properties` du parent ou de l’enfant. `initial` doit refléter le comportement du composant : le YAML configure le builder, pas le rendu React. C’est pourquoi l’exemple `Tabs` utilise `first`, tandis qu’`Accordion` utilise `none`.

## Table de traduction YesWiki → WikiOui

| YesWiki (Actions Builder) | WikiOui |
| --- | --- |
| Un YAML = un *groupe* de plusieurs `actions` | Un YAML = **un composant** (nom dérivé du fichier) |
| Bloc `commons` partagé entre actions | Champs inlinés dans `properties` ; regex factorisées par ancres YAML |
| Sections titrées (`title`, `width` par action) | Type `divider` (avec `showif` au besoin) |
| `_t(AB_…)` + fichier de traduction PHP | Texte français en clair (i18n au backlog) |
| `{{button class="btn-primary pull-right"}}` | Props MDX dédiées : `<Button color="primary" float="right" />` |
| Type `class` + `subproperties` | Supprimé — chaque sous-propriété devient une prop de premier rang |
| Vocabulaire Bootstrap des classes | Remplacé par le vocabulaire Tailwind : `pull-right` → `float="right"` ; `btn-block` → `fullWidth` |
| `btn-default`, `btn-primary`, `btn-success`, `btn-info`, `btn-warning` | Même valeur de la prop `color` (`warning` remplace l’ancien libellé « attention ») |
| `btn-secondary-1`, `btn-secondary-2` | `color="secondary"` — les deux gris historiques convergent vers l’unique rôle shadcn/ui `secondary` |
| `btn-danger` | `color="destructive"` |
| `btn-link` | `color="transparent"` |
| `attach` : classes `position` (none/left/center/right) | Prop `align` d'`<Image>` (`none`/`left`/`center`/`right`) |
| `attach` : classes `effect-whiteborder` / `effect-lightshadow` / `effect-zoom` | Props booléennes d'`<Image>` : `whiteBorder` / `shadow` / `hoverZoom` |
| `attach` : `nofullimagelink` (négatif) | Prop `lightbox` d'`<Image>` (sens positif inversé) |
| `attach` : `displaypdf` (checkbox) | Le mini-choix post-upload route vers `<Pdf>` ou `<FileLink>` |
| `attach` : ratio `portrait`/`paysage`/`carre` | Valeurs anglaises de la prop `ratio` de `<Pdf>` : `portrait`/`landscape`/`square` |
| `default` (dans le YAML) | **Conservé dans le YAML** (ADR 0013) ; doit égaler le défaut réel de la prop du composant, vérifié par signature |
| `value` | Renommé `initialValue` (pré-remplissage toujours écrit) |
| `checkedvalue` / `uncheckedvalue` | Supprimés — une checkbox est une prop booléenne (`newWindow` / rien) |
| `showif: champ` (raccourci non-vide) | `champ: notNull` |
| `showif: { champ: notNull }` | `champ: notNull` (inchangé) |
| `showif: { champ: valeur-ou-regex }` (ambigu) | Valeur nue = égalité stricte ; regex explicite entre `/…/` |
| `nobtn` (bouton rendu comme lien) | Non repris — un bouton est un bouton, un lien est un lien ; on ne mélange pas les composants |
| `new-window` (liste à option unique, dans `class`) | Prop `newWindow` (checkbox) |
| `modal` / `modalbox-hover` (dans `class`) | Prop `modal` (`click` / `hover`) |
| Action fourre-tout `attach` (image + PDF + fichier) | Éclatée en trois composants : `Image`, `Pdf`, `FileLink` |
| Action `tabs` : `titles` + blocs `{{tab}}…{{end elem="tab"}}` | `<Tabs>` avec un `<Tab title="…">` par titre ; contenu MDX inline, appariement positionnel |
| Action `tabs` : `selectedtab=N` (1-based) | `default="<slug du Nᵉ onglet>"` (`1`/absent → premier, omis) |
| Action `tabs` : `btnsize` / `btncolor` / `bottom_nav` / `counter_on_bottom_nav` | Non repris |
| Action `nav` : `nav-links` (`link` page + `title`) | `<Tabs>` avec un `<Tab title="…">` par lien ; le contenu de la page liée est rapatrié dans l'onglet |
| Action `nav` : `class` (`nav-tabs`/`nav-pills`/`nav-justified`/`nav-stacked`) | `display` (`underline`/`segmented`) + `fullWidth` (justifié) + `orientation="vertical"` (stacked) |
| Action `nav` : `hideifnoaccess` | Non repris — onglet natif sans page liée |
| Action `panel` : `title` | Prop `title` de `<Collapsible>` |
| Action `panel` : `type="collapsible"` | `<Collapsible defaultOpen={true}>` |
| Action `panel` : `type="collapsed"` | `<Collapsible>` avec `defaultOpen` omis ou `false` |
| Action `panel` : `type="default"` ou absent | Titre Markdown et contenu ordinaire, sans `<Collapsible>` |
| Action `panel` : `panel-primary`, `panel-success`, `panel-info`, `panel-warning` | Même valeur sémantique de `color` sur `<Collapsible>` |
| Action `panel` : `panel-secondary-1`, `panel-secondary-2` | `color="secondary"` sur `<Collapsible>` |
| Action `panel` : `panel-danger` | `color="destructive"` sur `<Collapsible>` |
| Action `panel` : `panel-default` | `color="none"` avec `display="outline"` |
| Action `panel` : classes CSS inconnues | Pas de conversion automatique en `className` |
| Action `accordion` : `nb=N` | `<Accordion>` avec `N` enfants `<Collapsible>` gérés par le builder ; `nb` ne devient pas une prop |
| Action `accordion` : exemple répété de `panel` | Le titre devient la prop `title` de chaque `<Collapsible>` et son contenu reste du MDX entre ses balises |
| Action `accordion` : aucune option d'apparence | Props WikiOui propres à `<Accordion>` : symbole, apparence, disposition, couleur et niveau de titre uniformes |
| `onlyEdit` / `onlyAdd` (asymétries ajout/édition) | Non repris (pas de besoin pour l'instant) — tout builder insère **et** réédite |
| Type `form-field`, `needFormField` | Supprimés (bazar au backlog) |
| Type `color` | Non repris (aucun composant v0.2 ne l'utilise ; réintroductible) |
| `onlyForAdmins` | Supprimé (droits d'accès au backlog) |
| `icon` (nom Fontawesome sur un champ) | Non repris |
| `mapped` | Non repris |
| `position` (ordre dans le menu) | Non repris — menu trié alphabétiquement par `label` |
| `doclink` | Non repris — la documentation des composants vit dans l'aide-mémoire |
| `isWrapper` / `wrappedContentExample` | Remplacés par la clé racine `initialContent:` : elle signale un wrapper à contenu libre, fournit son MDX initial et celui-ci est ensuite préservé à la réédition (ADR 0031). |

### Cas particuliers de migration

**Réécriture des URLs (`nav`)** — chaque onglet `nav` était une page distincte, donc un lien wiki vers cette page doit pointer vers l'onglet après fusion :

1. Construire la carte `ancien-slug-page → (slug-page-hôte, slug-onglet)`, avec `slug-onglet = slugify(title)`.
2. Le contenu de chaque page-onglet devient le contenu de son `<Tab>`.
3. Réécrire tout lien wiki vers `ancien-slug-page` en `slug-page-hôte#slug-onglet` — même mécanique que « Changer l'adresse » (ADR 0016).
4. Retirer les pages-onglets une fois rapatriées.
