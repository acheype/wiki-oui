# Formulaires & fiches (spec WikiOui v0.3)

Reprise de la fonctionnalité **Bazar** de YesWiki : un **formulaire** définit une structure de champs ; une **fiche** est une instance saisie via ce formulaire. Décisions de fond dans les ADR [0014](adr/0014-formulaires-et-fiches.md) (modèle) et [0015](adr/0015-shared-field-renderer-zod.md) (renderer partagé + Zod) ; analyse préalable dans [`research/formulaires-fiches-architecture.md`](research/formulaires-fiches-architecture.md). La table de migration depuis l'ancien format YesWiki (`***`) est dans [`reference/yeswiki-form-migration.md`](reference/yeswiki-form-migration.md).

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
- en-tête : bouton Enregistrer aligné sur la rangée du champ Nom ; dessous, la ligne Identifiant — chip éditable en place dérivé du nom à la création (règle commune des identités), chip + petit bouton « Changer » à l'édition (dialogue de renommage ADR 0016, sans avertissement : les URLs `?id=` sont des écrans d'admin, l'accès normal passe par les composants des pages wiki) ;
- onglet/section **Gabarit** : éditeur CodeMirror existant (coloration MDX, barre d'outils, aide-mémoire) + **aperçu** rendu sur des valeurs d'exemple, via la mécanique d'aperçu existante ;
- onglet **Droits** : qui peut créer une fiche, et les droits de lecture et d'écriture qu'une fiche reçoit à sa naissance — voir [`permissions.md`](permissions.md) § Formulaire. Éditer la définition d'un formulaire y est réservé à son propriétaire ou à un administrateur ;
- **Enregistrer** valide le descripteur par le méta-schéma Zod + les règles croisées, avec messages ciblés.

### Validation à l'enregistrement du formulaire

- descripteur bien formé (méta-schéma Zod : types connus, paramètres cohérents) ;
- `name` de champs **uniques** ; `title` présent ; au plus **un** champ `tags` ;
- toute référence `{champ}` du titre automatique et du gabarit correspond à un champ existant (une coquille est refusée à la source) ;
- `slug` au format slug, unique.

## Titre & slug d'une fiche

- Le champ **`title`** (« Titre de la fiche ») est un texte obligatoire ; sa valeur donne le titre affiché et dérive le slug (voir Identités).
- **Mode titre automatique** (option du champ `title`) : le champ disparaît de la saisie ; le titre est **calculé** depuis un template mêlant texte libre et références `{champ}` (ex. `{prenom} {nom} (asso)`), **recalculé à chaque sauvegarde**. Le slug, dérivé du premier calcul, n'est jamais recalculé — seul « Changer l'adresse » (ADR 0016) peut le modifier.
- **Le titre calculé est stocké dans `data` comme toute valeur de champ** (ADR 0020) : il est écrit à la sauvegarde, jamais recalculé à la lecture. Le champ reste absent du schéma d'*entrée* (`deriveEntrySchema`) — le client ne soumet jamais un titre automatique, il est injecté côté serveur après validation.

### Toute fiche a un titre non vide

Invariant garanti par le schéma Zod en mode manuel (`min(1)`), par l'injection à l'écriture en mode automatique, et par la contrainte `Revision_entry_has_title` en base. Quand le gabarit produit une chaîne vide, la règle est tenue de deux façons selon l'interlocuteur disponible :

- **à la saisie ou à l'édition d'une fiche** → la sauvegarde est **refusée**, avec un message nommant les champs du gabarit (le champ Titre étant invisible en mode automatique, « le titre est vide » seul serait un cul-de-sac) ;
- **au recalcul de masse**, qui n'a personne à qui répondre → la fiche est **sautée** (elle garde son titre) et la confirmation le signale.

### Recalcul de masse à l'enregistrement du formulaire

Deux actions admin invalident les titres stockés : **modifier le gabarit** et **activer** le mode automatique. À l'enregistrement du formulaire, derrière une confirmation qui annonce les nombres (motif du renommage de champ, ADR 0017), chaque fiche dont le titre change effectivement gagne une **nouvelle révision** — l'historique reste en ajout seul, aucun titre saisi à la main n'est détruit, et une fiche dont le titre est inchangé n'écrit rien. **Désactiver** le mode automatique ne déclenche rien : le dernier titre calculé devient simplement une valeur éditable, pré-remplie par `initialEntryValues`.

À ne pas confondre avec le balayage de l'ADR 0017 : un renommage de champ retouche la représentation et parcourt donc **tout l'historique en place** ; un recalcul de titre change ce que la fiche dit et ne touche donc que **l'état courant**, par une nouvelle révision.

**Restauration** : restaurer une révision recalcule le titre automatique au lieu de le recopier — l'état courant suit toujours la définition courante du formulaire. Si le gabarit produit une chaîne vide pour cette fiche, le titre archivé est conservé (une fiche périmée ne bloque jamais sa propre restauration) et **l'utilisateur est averti**, comme le recalcul de masse signale les fiches qu'il saute.

## Saisie d'une fiche

Trois portes, un seul formulaire généré (renderer de champs partagé, `react-hook-form` + résolveur Zod + `<Form>` shadcn) :

1. **`<EntryForm id="{slug}" />`** inséré dans n'importe quelle page (descripteur YAML dédié ; son champ `id` utilise le nouveau type de descripteur **`form-list`**, un sélecteur des formulaires existants) ;
2. **`/fiches?nouvelle&formulaire={slug}`** (bouton « Nouvelle fiche ») ;
3. **`/{slug}/edit`** d'une fiche existante : le handler `edit` ouvre le formulaire généré **pré-rempli** depuis `data` (jamais CodeMirror).

La soumission valide côté client **et** côté serveur avec le **même schéma Zod dérivé** du descripteur, puis crée une `Revision` (`data` snapshot complet). Une création réussie **redirige vers la fiche créée** (`/{slug}`).

## Rendu d'une fiche (`show`)

Deux voies, selon `Form.template` :

- **Vide → rendu par défaut** auto-généré depuis le schéma : titre en `h1`, puis chaque champ rendu selon son type (image affichée — redimensionnée, url cliquable, email en `mailto:`, date localisée, options → libellés, valeur de champ sourcé formulaire → **lien wiki** vers la fiche cible, géolocalisation → carte + marqueur).
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
| `date` | Champ date | `initTodayButton` (datepicker shadcn, stockage ISO `yyyy-mm-dd`) |
| `list` | Liste déroulante | source d'options + `defaultValue` (voir ci-dessous) |
| `radio` | Boutons radio | source d'options + `defaultValue` + `fillingMode` (`normal` · `tags`) |
| `multiChoice` | Cases à cocher | source d'options + `defaultValue` + `fillingMode` (`normal` · `tags` · `dragAndDrop`) — valeur multiple (tableau) |
| `image` | Image | `resizeWidth` · `resizeHeight` — upload vers le pool `files/` (ADR 0012), affichage via l'API de redimensionnement |
| `file` | Upload de fichier | — pool `files/`, extensions/limites par la config globale des familles |
| `geolocation` | Géolocalisation | `streetField` · `street1Field` · `street2Field` · `postalCodeField` · `townField` · `countyField` · `stateField` (liaison aux champs adresse du formulaire) · `geolocateButton` (« depuis ma position ») — stocke `{lat, lng}` |
| `tags` | Mots-clés | — écrit dans **`Page.tags`** (fusion, voir ci-dessous) |
| `customContent` | Custom html/wiki | `entryContent` (MDX affiché dans le formulaire de saisie) · `displayContent` (MDX affiché dans la fiche) — rédigés par l'admin, rendus par le pipeline sandboxé |
| `title` | Titre de la fiche | `automatic` + `template` (mode titre automatique) |

### Champs à options : deux sources

`list`, `radio` et `multiChoice` tirent leurs options :

- **inline** : paires clé → libellé éditées dans le panneau du champ (clé dérivée du libellé, motif des identités) — un seul niveau ; l'éditeur de **listes partagées multi-niveaux** est au backlog ;
- **ou des fiches d'un formulaire** (`sourceFormId`) : chaque fiche du formulaire cible est une option — **valeur stockée = son slug** (tenue à jour par « Changer l'adresse », ADR 0016), libellé affiché = son titre courant. Au rendu de la fiche, la valeur devient un **lien wiki** vers la fiche cible ; une cible supprimée s'affiche en slug brut (dégradation gracieuse).

### Géolocalisation

Champ complet façon YesWiki : carte **Leaflet** (tuiles OSM) avec marqueur ajustable, géocodage **Nominatim** depuis les champs adresse du formulaire désignés par l'admin (`streetField`…), bouton « Géolocaliser depuis ma position » (géolocalisation navigateur). Formes multiples (lignes, polygones…) : backlog.

### Mots-clés = tags de Page

Le champ `tags` est le **widget de saisie des tags de la Page-fiche** : pré-rempli depuis `Page.tags`, sa sauvegarde met à jour `Page.tags` — non historisé, exactement la règle existante du domaine. Un seul vocabulaire de tags dans tout le wiki ; au plus un champ `tags` par formulaire.

### API de redimensionnement d'images

`GET /api/files/{nom}?w=…&h=…` : l'original du pool reste intact, la variante est calculée à la demande (**sharp**) et mise en **cache disque**. Service d'API réutilisable (le composant `<Image>` des pages pourra s'en servir).

## Composants intégrés ajoutés

| Composant | Rôle |
| --- | --- |
| `<FormsAdmin>` | L'écran d'administration des formulaires (page spéciale `formulaires`) |
| `<EntriesAdmin>` | Liste des fiches + saisie (page spéciale `fiches`) |
| `<EntryForm id>` | Formulaire de saisie inséré dans une page (descripteur YAML, type `form-list`) |
| `<EntriesView>` | Vues des fiches (v0.4) — spec [`entries-view.md`](entries-view.md) |

## Hors périmètre v0.3 (backlog)

Affichage conditionnel des champs (« montrer si… ») · listes partagées multi-niveaux · WYSIWYG pour `textarea` · embed vidéo du champ `url` · extras email (bouton contact, envoi de la fiche — exigent un mailer) · formes géométriques carto · `<EntriesView>` (v0.4, spec [`entries-view.md`](entries-view.md)) · ACLs par champ (exigent l'auth) · `searchable`/`semantic`/`queries`.

## Bibliothèques introduites

`zod` · `react-hook-form` + `@hookform/resolvers` · `dnd-kit` · `leaflet` + `react-leaflet` · `sharp`.
