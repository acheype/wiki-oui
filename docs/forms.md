# Formulaires & fiches (spec WikiOui v0.3)

Reprise de la fonctionnalité **Bazar** de YesWiki : un **formulaire** définit une structure de champs ; une **fiche** est une instance saisie via ce formulaire. Décisions de fond dans les ADR [0014](adr/0014-forms-and-entries.md) (modèle) et [0015](adr/0015-shared-field-renderer-zod.md) (renderer partagé + Zod) ; analyse préalable dans [`research/formulaires-fiches-architecture.md`](research/formulaires-fiches-architecture.md). La table de migration depuis l'ancien format YesWiki (`***`) est dans [`reference/yeswiki-form-migration.md`](reference/yeswiki-form-migration.md).

## Le modèle en deux phrases

**Un formulaire n'est pas une page** : c'est une définition (entité `Form` en base, écrite à l'exécution via le FormBuilder). **Une fiche est une page** : `Page.formId` renseigné, contenu porté par un snapshot JSON `data` sur la `Revision` (au lieu du MDX `content`) — slug, URL, révisions, restauration, tags et suppression sont la machinerie existante.

```prisma
model Form {
  id        String   @id @default(uuid(7)) @db.Uuid  // technical PK, never shown
  slug      String   @unique   // the user-facing "id", immutable after creation
  name      String
  schema    Json                // field descriptor, written by the FormBuilder
  template  String?             // optional MDX template for entry rendering
  createdAt DateTime @default(now())
  ownerName String?
  entries   Page[]
}

model Page {
  // … existing fields …
  formId String? @db.Uuid      // null = MDX page ; set = entry of this form
  form   Form?   @relation(fields: [formId], references: [id], onDelete: Cascade)
}

model Revision {
  // … existing fields …
  content String?              // MDX snapshot — MDX pages (becomes nullable)
  data    Json?                // field-values snapshot — entries
  // invariant: exactly one of (content, data) is set, per the page's nature
}
```

- **Supprimer un formulaire supprime ses fiches** (cascade), derrière une confirmation « Attention » explicite qui annonce le nombre de fiches emportées.
- **Pas d'historisation du `Form`** : enregistrer écrase (comme les tags de page). Les *fiches*, elles, restent historisées par les `Revision` existantes.
- **Migration de schéma = dégradation gracieuse** : `data` est un snapshot par révision ; clé orpheline ignorée à l'affichage mais préservée, champ nouveau vide jusqu'à la prochaine édition. Pas de versionnage du schéma.

## Identités (règle commune : dérivé, éditable en place, figé)

Trois identifiants suivent le même motif — **dérivé automatiquement, figé au premier enregistrement** — et la même présentation avant l'enregistrement : une ligne « Identifiant\* » avec un **chip éditable en place** (clic sur le chip ou son crayon → input au même endroit, valeur sélectionnée ; Entrée ou perte de focus referme), dérivé jusqu'à modification par l'utilisateur, re-dérivé s'il est **laissé vide** à la perte de focus. Pour une fiche, la ligne se place sous le champ Titre (en fin de formulaire quand le titre est automatique) :

| Objet | Dérivé de | Figé quand |
| --- | --- | --- |
| `Form.slug` (« l'id » du formulaire) | `name` du formulaire | premier enregistrement du formulaire |
| `name` d'un champ (clé dans `data`, cible des `{champ}`) | `label` du champ, unique dans le formulaire | premier enregistrement du formulaire |
| slug d'une fiche | valeur du champ titre (ou titre automatique) | première sauvegarde de la fiche |

En cas de **collision** du slug de fiche (avec une page ou une autre fiche) : message explicite invitant à personnaliser l'identifiant — jamais de suffixe automatique silencieux.

Nuance depuis ADR 0016/0017 : « figé » signifie *plus jamais dérivé* — mais tout identifiant en base reste renommable par une action explicite qui réécrit toutes les références, historique compris : « Changer l'adresse » (fiche), « Changer » sur l'identifiant du formulaire (immédiat) et sur celui d'un champ (différé à l'enregistrement, ADR 0017). Règle d'UI commune : un identifiant **pas encore en base** est un chip éditable en place (ci-dessus) ; un identifiant **en base** est un chip + bouton « Changer » ouvrant la modale de renommage. Seul le `name` du champ `title` est réellement immuable (littéral, cible des gabarits).

## Écrans

Deux nouvelles **pages spéciales** seedées (non supprimables, éditables), dont le contenu par défaut appelle un composant intégré — même philosophie que `page-rapide-haut` :

| Page | Composant | États d'URL |
| --- | --- | --- |
| `formulaires` | `<FormsAdmin>` | `/formulaires` (liste) · `?nouveau` (builder vide) · `?id={slug}` (édition) |
| `fiches` | `<EntriesAdmin>` | `/fiches` (toutes les fiches) · `?formulaire={slug}` (celles d'un formulaire) · `?nouvelle&formulaire={slug}` (saisie) |

- L'entrée **Formulaires** est ajoutée au contenu seedé de `page-rapide-haut` (roue crantée).
- Les composants sont **clients**, lisent l'état dans l'URL (`useSearchParams()` — F5, bouton retour et liens directs fonctionnent) et chargent leurs données par **Server Actions, y compris en lecture** (aménagement du triptyque de `CONTEXT.md`).
- **Liste des formulaires** : filtre par nom **au clavier direct** — taper n'importe où sur la page remplit le champ de filtre sans avoir à le cliquer. Actions par ligne : éditer, supprimer (confirmation cascade), « Nouvelle fiche » (→ `/fiches?nouvelle&formulaire={slug}`). Chacune **disparaît** pour qui n'a pas le droit correspondant : éditer et supprimer sont au propriétaire du formulaire ou à un administrateur, « Nouvelle fiche » suit le `createEntry` du formulaire, et « Nouveau formulaire » le `createForm` du wiki — voir [`permissions.md`](permissions.md) § Formulaire et § Qui peut créer un formulaire.
- Les handlers de page de ces pages spéciales (`/formulaires/edit`…) restent ceux du MDX de la page hôte — assumé.

## Le FormBuilder

L'interface de construction d'un formulaire, sur le modèle du ComponentBuilder mais pour un descripteur **JSON en base** (pas un YAML du repo) :

- **Palette** des types de champs → **drag & drop** (dnd-kit) vers le canvas, réordonnancement inclus ;
- clic sur un champ du canvas → **panneau de paramétrage** (les paramètres du type, générés par le renderer de champs partagé — ADR 0015) ;
- champ **`title` présent par défaut** dans tout nouveau formulaire, non supprimable (voir « Titre & slug ») ;
- en-tête : bouton Enregistrer aligné sur la rangée du champ Nom ; dessous, la ligne Identifiant — chip éditable en place dérivé du nom à la création (règle commune des identités), chip + petit bouton « Changer » à l'édition (dialogue de renommage ADR 0016, sans avertissement : les URLs `?id=` sont des pages système d'admin, l'accès normal passe par les composants des pages wiki) ;
- onglet/section **Gabarit** : éditeur CodeMirror existant (coloration MDX, barre d'outils, aide-mémoire) + **aperçu** rendu sur des valeurs d'exemple, via la mécanique d'aperçu existante ;
- onglet **Accès** : qui peut créer une fiche, et l'accès en lecture et en écriture qu'une fiche reçoit à sa naissance — voir [`permissions.md`](permissions.md) § Formulaire. Éditer la définition d'un formulaire y est réservé à son propriétaire ou à un administrateur ;
- **Enregistrer** valide le descripteur par le méta-schéma Zod + les règles croisées, avec messages ciblés.

### Validation à l'enregistrement du formulaire

- descripteur bien formé (méta-schéma Zod : types connus, paramètres cohérents) ;
- `name` de champs **uniques** ; `title` présent ;
- toute référence `{champ}` du titre automatique et du gabarit correspond à un champ existant (une coquille est refusée à la source) ;
- `slug` au format slug, unique.

## Titre & slug d'une fiche

- Le champ **`title`** (« Titre de la fiche ») est un texte obligatoire ; sa valeur donne le titre affiché et dérive le slug (voir Identités).
- **Mode titre automatique** (option du champ `title`) : le champ disparaît de la saisie ; le titre est **calculé** depuis un template mêlant texte libre et références `{champ}` (ex. `{prenom} {nom} (asso)`), **recalculé à chaque sauvegarde**. Le slug, dérivé du premier calcul, n'est jamais recalculé — seul « Changer l'adresse » (ADR 0016) peut le modifier.
- **Le titre calculé est stocké dans `data` comme toute valeur de champ** (ADR 0020) : il est écrit à la sauvegarde, jamais recalculé à la lecture. Le champ reste absent du schéma d'*entrée* (`deriveEntrySchema`) — le client ne soumet jamais un titre automatique, il est injecté côté serveur après validation.
- **`data` est écrit dans l'ordre des champs du formulaire** (`orderedEntryData()`, `lib/form-descriptor.ts`) — `title` n'est pas forcé en tête, il prend la place que l'auteur du formulaire lui a donnée dans le canvas. Un confort à l'inspection directe de la base, la garantie utile étant celle que tient `/{slug}/raw` en la reconstruisant à la lecture ([`permissions.md`](permissions.md) § `/{slug}/raw`) : `Revision.data` est du `jsonb`, qui ne préserve pas l'ordre d'écriture.
- **`metadata` est le seul identifiant de champ refusé à l'enregistrement** (`formAuthoringIssues()`, `lib/form-descriptor.ts`) : c'est la clé où `/{slug}/raw` range ses six champs de métadonnées à côté des valeurs d'une fiche ([`permissions.md`](permissions.md) § `/{slug}/raw`) — un champ qui la porterait entrerait en collision avec elle. `content` et `form-id` n'ont pas besoin de la même règle (`getRawContent()` distingue une page d'une fiche par `formId`/`form`, et `form-id` vit dans `metadata`, pas parmi les champs), ni `title`, déjà réservé par le méta-schéma au seul champ de type Titre.

### Toute fiche a un titre non vide

Invariant garanti par le schéma Zod en mode manuel (`min(1)`), par l'injection à l'écriture en mode automatique, et par la contrainte `Revision_entry_has_title` en base. Quand le gabarit produit une chaîne vide, la règle est tenue de deux façons selon l'interlocuteur disponible :

- **à la saisie ou à l'édition d'une fiche** → la sauvegarde est **refusée**, avec un message nommant les champs du gabarit (le champ Titre étant invisible en mode automatique, « le titre est vide » seul serait un cul-de-sac) ;
- **au recalcul de masse**, qui n'a personne à qui répondre → la fiche est **sautée** (elle garde son titre) et la confirmation le signale.

### Recalcul de masse à l'enregistrement du formulaire

Deux actions admin invalident les titres stockés : **modifier le gabarit** et **activer** le mode automatique. À l'enregistrement du formulaire, derrière une confirmation qui annonce les nombres (motif du renommage de champ, ADR 0017 ; celle de « Appliquer aux fiches existantes » quand l'enregistrement part de ce bouton, [`permissions.md`](permissions.md)), chaque fiche dont le titre change effectivement gagne une **nouvelle révision** — l'historique reste en ajout seul, aucun titre saisi à la main n'est détruit, et une fiche dont le titre est inchangé n'écrit rien. **Désactiver** le mode automatique ne déclenche rien : le dernier titre calculé devient simplement une valeur éditable, pré-remplie par `initialEntryValues`.

À ne pas confondre avec le balayage de l'ADR 0017 : un renommage de champ retouche la représentation et parcourt donc **tout l'historique en place** ; un recalcul de titre change ce que la fiche dit et ne touche donc que **l'état courant**, par une nouvelle révision.

**Restauration** : restaurer une révision fusionne d’abord les champs selon les droits actuels, puis recalcule une seule fois le titre automatique au lieu de le recopier — l'état courant suit toujours la définition courante du formulaire. Si le gabarit produit une chaîne vide pour cette fiche, le titre archivé est conservé (une fiche périmée ne bloque jamais sa propre restauration) et **l'utilisateur est averti** à partir de ce même calcul final, comme le recalcul de masse signale les fiches qu'il saute.

## Saisie d'une fiche

Trois portes, un seul formulaire généré (renderer de champs partagé, `react-hook-form` + résolveur Zod + `<Form>` shadcn) :

1. **`<EntryForm id="{slug}" />`** inséré dans n'importe quelle page (descripteur YAML dédié ; son champ `id` utilise le nouveau type de descripteur **`form-list`**, un sélecteur des formulaires existants) ;
2. **`/fiches?nouvelle&formulaire={slug}`** (bouton « Nouvelle fiche ») ;
3. **`/{slug}/edit`** d'une fiche existante : le handler `edit` ouvre le formulaire généré **pré-rempli** depuis `data` (jamais CodeMirror).

La soumission valide côté client **et** côté serveur avec le **même schéma Zod dérivé** du descripteur, puis crée une `Revision` (`data` snapshot complet). Une création réussie **redirige vers la fiche créée** (`/{slug}`).

## Rendu d'une fiche (`show`)

Deux voies, selon `Form.template` :

- **Vide → rendu par défaut** auto-généré depuis le schéma : titre en `h1`, puis chaque champ rendu selon son type (image affichée — redimensionnée, url cliquable, email en `mailto:`, date et heure en français (voir § Date / heure et Période), options → libellés, valeur de champ sourcé formulaire → **lien wiki** vers la fiche cible, géolocalisation → carte + marqueur).
- **Renseigné → gabarit MDX** : les `{champ}` sont substitués par les valeurs de la fiche **avant compilation**, puis le résultat passe par le **pipeline MDX existant** (sandbox ADR 0002, composants du registre). La règle « titre = premier `#` » vaut au niveau du gabarit rendu (`# {title}`).

**Échappement** : les valeurs injectées sont du **texte brut** — celui qui remplit une fiche ne peut ni injecter de composants ni casser la mise en page. Deux exceptions, toutes deux **décidées par l'admin du formulaire** : le contenu d'un champ `customContent` (c'est son rôle), et un `textarea` dont l'admin a activé `allowMdx`.

**Valeur absente** (vieille fiche, champ optionnel vide) → chaîne vide, silencieusement.

## Les types de champs

Tronc commun à tous les types : `label` · `name` (voir Identités) · `required` · `hint` · `placeholder` (types texte-like). Écartés de la v0.3 (machineries absentes — voir table de migration) : ACLs `read`/`write`, `searchable`, `semantic`, `queries`, `size`.

| Type | Palette (FR) | Paramètres spécifiques |
| --- | --- | --- |
| `text` | Texte court | `subtype` (`text` · `number`) · `maxLength` · `pattern` (avancé) · `defaultValue` |
| `textarea` | Texte long | `rows` · `defaultValue` · `allowMdx` (la valeur est rendue comme MDX — opt-in admin) |
| `email` | Email | — (validation email, rendu `mailto:`) |
| `url` | Url | — (validation URL, rendu lien cliquable) |
| `datetime` | Date / heure | `format` · `optionalTime` (voir ci-dessous) |
| `datetimeRange` | Période | `format` · `optionalTime` — une seule valeur `{ start, end }` (voir ci-dessous) |
| `list` | Liste déroulante | source d'options + `defaultValue` (voir ci-dessous) |
| `radio` | Boutons radio | source d'options + `defaultValue` + `fillingMode` (`normal` · `tags`) |
| `multiChoice` | Cases à cocher | source d'options + `defaultValue` + `fillingMode` (`normal` · `tags` · `dragAndDrop`) — valeur multiple (tableau) |
| `image` | Image | `resizeWidth` · `resizeHeight` — upload vers le pool `files/` (ADR 0012), affichage via l'API de redimensionnement |
| `file` | Upload de fichier | — pool `files/`, extensions/limites par la config globale des familles |
| `geolocation` | Géolocalisation | `streetField` · `street1Field` · `street2Field` · `postalCodeField` · `townField` · `countyField` · `stateField` (liaison aux champs adresse du formulaire) · `geolocateButton` (« depuis ma position ») — stocke `{lat, lng}` |
| `tags` | Mots-clés | — liste de mots libres, stockée dans `data` (voir ci-dessous) |
| `customContent` | Custom html/wiki | `entryContent` (MDX affiché dans le formulaire de saisie) · `displayContent` (MDX affiché dans la fiche) — rédigés par l'admin, rendus par le pipeline sandboxé |
| `title` | Titre de la fiche | `automatic` + `template` (mode titre automatique) |

### Date / heure et Période

Deux types partagent les mêmes réglages et le même widget de saisie : `datetime` saisit un instant, `datetimeRange` saisit une **Période**, un début et une fin dans un seul champ.

**Réglages de l'auteur** (panneau du champ) :

| Réglage | Libellé | Valeurs |
| --- | --- | --- |
| `format` | Saisir | `datetime` (Date et heure, **défaut**) · `date` (Date) · `time` (Heure) — contrôle segmenté |
| `optionalTime` | Heure facultative | visible en mode `datetime` seulement, cochée par défaut. Aide : « Le contributeur peut cocher « Toute la journée » au lieu de saisir une heure. » Pour une Période, l'aide ajoute : « La case vaut pour le début et la fin. » |

**Saisie** :

- La date se choisit dans un sélecteur de date. Il n'y a pas de bouton « Aujourd'hui » : le sélecteur marque déjà le jour courant.
- L'heure est un champ à deux cases, `hh : mm`. Chaque case se tape au clavier et ouvre son menu en dessous : les heures (00 à 23) sous l'heure, les quarts d'heure (00, 15, 30, 45) sous les minutes. Une heure complète passe aux minutes (`9` donne `09`). Les flèches ↑ et ↓ changent d'une heure ou d'un quart d'heure. Une minute hors quart d'heure se tape (`18:20`), elle n'est jamais refusée.
- Le menu des heures s'ouvre sur 09 quand l'heure est vide. Dans la fin d'une Période sur un seul jour, il s'ouvre sur la première heure possible, grise les heures antérieures au début et affiche la durée de chaque option (`1h30`).
- Sur un écran tactile, le champ heure est le sélecteur natif de l'appareil.
- Avec `optionalTime`, la case « Toute la journée » (décochée par défaut) masque l'heure. Case décochée, l'heure est **requise** : une heure absente veut toujours dire « toute la journée ». Une Période n'a qu'une case, qui vaut pour ses deux bornes.
- Période : la saisie part d'**un seul jour**, le cas le plus courant. Les cases « Toute la journée » et « Sur plusieurs jours » viennent en premier, car elles changent les champs qui suivent.
  - Un jour : une date (un clic), puis « de [heure] à [heure] ».
  - « Sur plusieurs jours » : un calendrier de période, avec la plage en surbrillance. Un premier clic déplace toute la période en gardant sa durée (la fin suit le début). Un second clic, facultatif, fixe le dernier jour ; les jours antérieurs au premier sont grisés et le survol prévisualise la période. Une fiche dont les deux dates diffèrent s'ouvre dans ce mode. Décocher la case ramène la fin au jour du début.
  - Le même jour, la fin ne reste jamais derrière le début : une fin sans heure reçoit le début + 1h, et une fin que le début dépasse se décale avec lui en gardant la durée, tant qu'elle reste dans la journée.

**Valeurs stockées** : des chaînes ISO en **heure locale, sans fuseau**. `18h30` veut dire 18h30 pour tout lecteur, où qu'il soit.

| Mode | Valeur |
| --- | --- |
| Date et heure | `yyyy-mm-ddTHH:mm`, ou `yyyy-mm-dd` si « Toute la journée » est cochée |
| Date | `yyyy-mm-dd` |
| Heure | `HH:mm` |

Une heure absente n'est jamais écrite `00:00`. Une Période est un objet `{ "start": …, "end": … }` sous le `name` du champ, chaque borne au format du mode.

**Validation d'une Période** :

- Un champ Période renseigné a ses deux bornes. Facultatif, il peut rester vide, jamais à moitié rempli. Obligatoire, il exige les deux bornes.
- Sans heure : début ≤ fin (une période d'un jour est valide).
- Avec heures, ou en mode Heure : début strictement avant fin. Une plage horaire qui passe minuit (`22:00` → `02:00`) est refusée : l'auteur choisit alors le mode Date et heure.

**Affichage** (rendu par défaut, gabarit, titre automatique, vues de fiches) :

| Valeur | Texte |
| --- | --- |
| Date et heure | `3 novembre 2026 à 18h30` |
| Date | `3 novembre 2026` |
| Heure | `18h30` — une heure pleine s'écrit sans minutes : `12h` |
| Période sur plusieurs jours | `du 3 au 5 novembre 2026` ; avec heures : `du 3 novembre 2026 à 18h30 au 5 novembre 2026 à 12h` |
| Période sur un jour | `3 novembre 2026, de 18h30 à 22h` |
| Période en mode Heure | `de 9h à 12h30` |

Les parties communes aux deux bornes sont factorisées (`du 3 au 5 novembre 2026`). Dans un gabarit ou un titre automatique, `{champ}` produit ce texte ; il n'y a pas d'accès aux bornes (`{champ.start}`).

**Changer le mode d'un champ** : à l'enregistrement du formulaire, les valeurs sont converties quand la conversion n'invente aucune donnée. Sinon, elles sont gardées, comme pour un champ devenu obligatoire. Le FormBuilder annonce l'impact avant d'enregistrer, sur le modèle du recalcul des titres.

| Changement | Effet sur les fiches | Annonce |
| --- | --- | --- |
| Date et heure → Date | l'heure est retirée | « 12 fiches perdront leur heure. » |
| Date → Date et heure, heure facultative | aucun : les valeurs deviennent « toute la journée » | — |
| Date → Date et heure, heure obligatoire, ou « Heure facultative » décochée | valeurs gardées ; l'heure est demandée à la prochaine modification | « 5 fiches n'ont pas d'heure. Elle sera demandée à leur prochaine modification. » |
| une date → Heure, ou Heure → une date | la valeur est vidée | « 12 fiches perdront leur valeur. » |

### Champs à options : deux sources

`list`, `radio` et `multiChoice` tirent leurs options :

- **inline** : paires clé → libellé éditées dans le panneau du champ (clé dérivée du libellé, motif des identités) — un seul niveau ; l'éditeur de **listes partagées multi-niveaux** est au backlog ;
- **ou des fiches d'un formulaire** (`sourceFormId`) : chaque fiche du formulaire cible est une option — **valeur stockée = son slug** (tenue à jour par « Changer l'adresse », ADR 0016), libellé affiché = son titre courant. Au rendu de la fiche, la valeur devient un **lien wiki** vers la fiche cible ; une cible supprimée s'affiche en slug brut (dégradation gracieuse).

### Géolocalisation

Champ complet façon YesWiki : carte **Leaflet** (tuiles OSM) avec marqueur ajustable, géocodage **Nominatim** depuis les champs adresse du formulaire désignés par l'admin (`streetField`…), bouton « Géolocaliser depuis ma position » (géolocalisation navigateur). Formes multiples (lignes, polygones…) : backlog.

### Mots-clés ≠ tags de Page

Le champ `tags` est un **champ de fiche ordinaire** : sa valeur vit dans le snapshot `data` comme toute autre, elle est historisée avec les révisions, elle se restreint en lecture comme en écriture, et un formulaire peut en porter autant qu'il a de sortes de mots-clés. Il ne partage avec les **tags de la Page** (ADR 0007) que le widget de saisie et l'allure : les tags classent une page dans tout le wiki et ne sont pas historisés ; les mots-clés d'une fiche sont un de ses champs. Rien ne passe de l'un à l'autre.

Une fiche naît malgré tout avec un tag de Page : le nom de son formulaire, posé une fois à la création (`createEntryPage`). C'est le seul défaut qui ait un sens quel que soit le formulaire — il reste modifiable comme tout tag de Page.

### API de redimensionnement d'images

`GET /api/files/{nom}?w=…&h=…` : l'original du pool reste intact, la variante est calculée à la demande (**sharp**) et mise en **cache disque**. Service d'API réutilisable (le composant `<Image>` des pages pourra s'en servir).

## Composants intégrés ajoutés

| Composant | Rôle |
| --- | --- |
| `<FormsAdmin>` | La page système d'administration des formulaires (page spéciale `formulaires`) |
| `<EntriesAdmin>` | Liste des fiches + saisie (page spéciale `fiches`) |
| `<EntryForm id>` | Formulaire de saisie inséré dans une page (descripteur YAML, type `form-list`) |
| `<EntriesView>` | Vues des fiches (v0.4) — spec [`entries-view.md`](entries-view.md) |

## Hors périmètre v0.3 (backlog)

Affichage conditionnel des champs (« montrer si… ») · listes partagées multi-niveaux · WYSIWYG pour `textarea` · embed vidéo du champ `url` · extras email (bouton contact, envoi de la fiche — exigent un mailer) · formes géométriques carto · `<EntriesView>` (v0.4, spec [`entries-view.md`](entries-view.md)) · ACLs par champ (exigent l'auth) · `searchable`/`semantic`/`queries`.

## Bibliothèques introduites

`zod` · `react-hook-form` + `@hookform/resolvers` · `dnd-kit` · `leaflet` + `react-leaflet` · `sharp`.
