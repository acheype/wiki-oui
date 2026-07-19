# EntriesView — vues des fiches (spec WikiOui v0.4)

Reprise de la famille d'actions **bazar** de YesWiki (`bazarliste`, `bazarcard`, `bazarcarto`…) en **un seul composant** : `<EntriesView>` affiche les fiches d'un ou plusieurs formulaires selon neuf vues au choix. Décisions d'architecture dans les ADR [0018](adr/0018-entries-view-descriptor-driven.md) (builder par descripteur étendu) et [0019](adr/0019-structured-props-literal-expressions.md) (props structurées en expressions littérales). Références YesWiki : [`reference/bazarliste.yaml`](reference/bazarliste.yaml) et [`reference/actionsbuilder_fr.inc.php`](reference/actionsbuilder_fr.inc.php) ; la table de traduction en fin de document recense **tous** les écarts de nommage (elle servira à la migration YesWiki → WikiOui).

## Le composant en deux phrases

Une balise, neuf vues : `<EntriesView form="associations" view="grid" … />` charge les fiches par Server Action puis rend la vue choisie, entièrement interactive côté client (recherche, filtres, tri instantanés). La distinction YesWiki « rendu statique / dynamique » disparaît : tout est toujours « dynamique », aucun paramètre ne la porte.

## Le builder

Entrée « **Fiches** » du menu Composants (description : « Affiche les fiches d'un formulaire : liste, grille, tableau, carte, calendrier… »). L'ordre des sections va du *quoi* vers le *comment* :

1. **En tête, hors section** — le·s formulaire·s, puis la vue :
   - « **Formulaire** » : le `form-list` existant. Dessous, un bouton fantôme « **+ Ajouter les fiches d'un autre formulaire** » fait apparaître un second sélecteur (retirable par ×), et ainsi de suite — le cas mono-formulaire (95 %) voit l'UI simple, le multi est un geste d'ajout, pas un mode. Dès 2 formulaires, le libellé passe au pluriel et le pseudo-champ `$form` s'active.
   - « **Vue** » : un **sélecteur en tuiles** (3×3, icône + nom, tuile active surlignée), l'aperçu au-dessus basculant en direct. Défaut : **Liste** (la seule vue sans prérequis de champ).
2. **Affichage** — les paramètres propres à la vue choisie (`showif` sur `view`) + « Lors du clic, afficher la fiche » quand la vue le porte.
3. **Recherche et filtres** — barre de recherche, puis **Filtres disponibles**.
4. **Tri** — tri par défaut, puis tris proposés aux visiteurs.
5. **Sélection des fiches** — les restrictions admin : période sur un champ date, nombre maximal.

Les réglages pointus restent dans leur section, marqués `advanced`. Hauteur d'aperçu : `450px`.

**Aperçu** : le rendu réel sur les **vraies fiches** du formulaire choisi. Sans formulaire choisi ou sans fiches : **fiches d'exemple générées** depuis le schéma (3–6 fiches factices, valeurs plausibles par type de champ — noms, dates proches, images de substitution, points géo dispersés), bandeau discret « Aperçu sur des données d'exemple » (le motif de l'aperçu du gabarit du FormBuilder).

## Multi-formulaires et pseudo-champs

- **Union par `name`** : les sélecteurs de champ proposent l'union des champs des formulaires choisis, dédoublonnée par `name` (libellé : celui du premier formulaire porteur, badge listant les porteurs si partiel). Fiche dont le formulaire n'a pas le champ → valeur vide, silencieusement (règle du domaine).
- **Pseudo-champs** : des champs synthétiques proposés aux côtés des vrais, préfixés `$` (aucune collision possible avec un `name`) :

| Pseudo-champ | Valeur | Proposé dans |
|---|---|---|
| `$form` | le formulaire de la fiche (multi-formulaires seulement) | filtres, couleur/icône, colonnes |
| `$owner` | `Page.ownerName` | zones secondaires, colonnes, tri |
| `$createdAt` | `Page.createdAt` | zones secondaires, colonnes, tri, champs date |
| `$editedAt` | `current.createdAt` (dernière édition) | zones secondaires, colonnes, tri, champs date |

## Les neuf vues

`view` : `list` · `grid` · `table` · `map` · `calendar` · `agenda` · `directory` · `carousel` · `gallery`. Écartés : GoGocarto (abandon), Blog, Timeline, Liste de liens, Carte-et-tableau (backlog — Carte-et-tableau se recompose en posant deux `<EntriesView>`).

### Liste (`list`) — les fiches en lignes dépliables

| Prop | Libellé | Notes |
|---|---|---|
| `expandable` | Déplier les fiches dans la liste | checkbox, **coché par défaut** — clic sur la ligne = déplie la fiche en place (rendu réel : gabarit ou rendu par défaut, non paramétrable) |
| `openOnClick` | Ouvrir les fiches au clic | checkbox, visible seulement si `expandable` décoché (**exclusifs**) ; alors le clic applique `entryDisplay` |
| `titleField` / `subtitleField` | Zone de titre / de sous-titre | défauts : champ titre / vide |

Décoché des deux côtés = liste inerte (simple listing). Pas de zones Visuel/Badge en Liste (fidèle à YesWiki).

### Grille (`grid`) — les fiches en cartes (ex-« Blocs »)

| Prop | Libellé | Notes |
|---|---|---|
| `visualField` | Zone visuelle | champ image, affiché dans la carte |
| `titleField` / `subtitleField` | Zone de titre / de sous-titre | défauts : champ titre / vide |
| `textField` | Zone de texte | tronquée pour préserver la forme de la carte |
| `footerField` | Zone de pied | |
| `badgeField` | Badge | en surimpression du visuel, coin haut-droit (ex-« zone flottante ») |
| `columnCount` | Nombre de colonnes | défaut 3 — un *maximum*, la grille responsive retombe à 2 puis 1 |
| `layout` | Disposition | `vertical` (défaut) · `horizontal` · `square` |
| `visualFit` | Cadrage du visuel | avancé : `cover` (défaut, rogne) · `contain` (entière) |
| `textLines` | Lignes de texte | avancé, défaut 3 — troncature de la zone de texte (le sous-titre reste sur une ligne) |

Toute la carte est cliquable (`entryDisplay`, défaut popup).

### Tableau (`table`)

| Prop | Libellé | Notes |
|---|---|---|
| `columns` | Colonnes | `field-rows` : picker + drag (ordre des colonnes) + **titre éditable en place** (dérivé du libellé du champ, vidé = re-dérivé — le motif des identités). **Vide = tous les champs.** Pseudo-champs proposés. |
| `splitMultiChoice` | Une colonne par option des cases à cocher | avancé, décoché par défaut (YesWiki cochait) |
| `sumFields` | Colonnes à totaliser | avancé, multi, restreint aux champs nombre — ligne de total en pied |
| `actionsColumn` | Colonne Modifier / Supprimer | décoché par défaut ; « seulement pour les admins » reviendra avec l'auth |

Comportements natifs, sans paramètre : **en-têtes triables au clic**, libellés toujours affichés (jamais les clés), images toujours en vignette, ligne cliquable (`entryDisplay`), pagination via `pageSize`.

### Carte (`map`)

| Prop | Libellé | Notes |
|---|---|---|
| `basemap` | Fond de carte | liste **curée** (~8 fonds fonctionnels sans clé, validés à l'implémentation) : `osm` (défaut) · `osm-france` · `positron` · `dark-matter` · `stadia-smooth` · `stadia-smooth-dark` · `esri-satellite` · `opentopo` |
| `initialArea` | Vue initiale fixe | avancé, `map-view` (le widget du champ géolocalisation) — **vide = cadrage automatique** sur les marqueurs (fit bounds) |
| `cluster` | Regrouper les marqueurs proches | **coché par défaut** (YesWiki : décoché) |
| `height` / `width` | Hauteur / Largeur | `500px` / avancé, `100%` |
| `hoverField` | Champ au survol du marqueur | tooltip, défaut : titre |
| `wheelZoom` | Zoom à la molette | avancé, décoché (ne pas piéger le scroll du lecteur) |

Le clic marqueur applique **directement** `entryDisplay`, qui gagne ici deux options : `sidebar` (**défaut Carte** — panneau accolé, carte vivante, bottom sheet sur mobile) et `map-popup` (mini-fiche Leaflet ancrée au marqueur : visuel + titre + « Voir la fiche » ouvrant la modale commune — non paramétrable). Le marqueur porte couleur et icône (voir Couleur & icône).

### Calendrier (`calendar`) — la grille temporelle

| Prop | Libellé | Notes |
|---|---|---|
| `startDateField` | Champ date de début | **requis** (sans lui : état vide explicite dans l'aperçu) ; pré-rempli si le formulaire n'a qu'un champ date ; pseudo-champs dates acceptés |
| `endDateField` | Champ date de fin | optionnel — événements multi-jours |
| `initialView` | Vue initiale | `month` (défaut) · `week` · `day` · `planning` |
| `planningRange` | Portée du planning | avancé : `year` (défaut) · `month` · `week` |
| `compact` | Mini calendrier | rendu compact pour colonne étroite |

`planning` (et `planningRange`) n'existent que si la bibliothèque calendrier retenue offre une vue liste — le critère de choix de la bibliothèque est l'ergonomie et l'esthétique, pas la parité YesWiki. Export iCal : backlog.

### Agenda (`agenda`) — la liste éditoriale chronologique

Le Calendrier montre le temps (avec des événements dedans), l'Agenda montre les événements (rangés par le temps) : bloc date typographié à gauche, groupement par mois, seulement les jours ayant des événements.

| Prop | Libellé | Notes |
|---|---|---|
| `startDateField` / `endDateField` | Champs dates | mêmes règles que le Calendrier |
| `titleField` / `subtitleField` | Zones | comme la Liste |
| `columnCount` | Nombre de colonnes | avancé, défaut 1 |

Choisir la vue Agenda **pré-remplit** `period` = `future` (modifiable) — un agenda neuf ne montre jamais le passé. `pageSize` disponible.

### Annuaire (`directory`)

Liste alphabétique groupée par initiale du titre, **index de lettres** cliquable (lettres vides grisées) collé en haut. Aucun paramètre spécifique ; tri masqué (alphabétique par construction) ; `entryDisplay` défaut popup.

### Carrousel (`carousel`)

| Prop | Libellé | Notes |
|---|---|---|
| `visualField` | Zone visuelle | champ image, **requis** (pré-rempli si un seul champ image) |
| `captionField` | Légende | défaut : titre ; effaçable (pas de texte sur l'image) — fusionne deux paramètres YesWiki |
| `autoplay` | Défilement automatique | coché par défaut |
| `interval` | Durée par image | avancé, défaut 5 s |

Le clic sur une diapositive applique `entryDisplay` (défaut popup). Pas de recherche ni de pagination ; le tri règle l'ordre de défilement.

### Galerie photo (`gallery`)

| Prop | Libellé | Notes |
|---|---|---|
| `visualField` | Zone visuelle | champ image, **requis** |

Grille justifiée moderne, **zoom au survol** avec voile révélant le titre — sans paramètre. Le clic ouvre une **visionneuse plein écran** (navigation ← →, légende = titre, bouton « Voir la fiche » → modale commune) : la seule vue dont le clic n'est pas `entryDisplay` (dans une galerie, on attend la photo en grand). `pageSize` disponible (chargement par lots).

## Paramètres communs

### Lors du clic, afficher la fiche (`entryDisplay`)

`popup` (**première position et défaut** partout sauf Carte) · `current-tab` · `new-tab` — plus, sur la Carte seulement : `sidebar` (défaut Carte) et `map-popup`. La popup affiche le rendu `show` réel de la fiche (gabarit ou rendu par défaut, sans chrome), se ferme par croix/clic dehors/Échap en restituant l'état exact (filtres, scroll, pagination), et porte un lien « Ouvrir la page de la fiche ↗ ». Prop absente = défaut de la vue (le composant tranche).

### Recherche

| Prop | Libellé | Notes |
|---|---|---|
| `search` | Barre de recherche | checkbox — recherche instantanée ; toutes vues sauf Carrousel |
| `searchFields` | Champs cherchés | avancé, multi, visible si `search` — **vide (défaut) = tous les champs de types texte** (titre, texte court, texte long, email, url) |

### Couleur & icône par champ

Sur **Liste, Grille, Tableau, Carte, Calendrier, Agenda** — marqueur (Carte), événement (Calendrier/Agenda), pastille/liseré discret (Liste, Grille, Tableau) :

| Prop | Libellé | Notes |
|---|---|---|
| `colorField` | Champ pour la couleur | restreint aux champs à options (`list`, `radio`, `multiChoice`) + `$form` |
| `colors` | (mapping valeur → couleur) | avancé, visible si `colorField` — **palette automatique** dès le choix du champ (attribution stable dans l'ordre des options), surcharges par color picker pré-remplies |
| `iconField` | Champ pour l'icône | avancé, mêmes champs sources |
| `icons` | (mapping valeur → icône) | avancé, visible si `iconField` — sélecteur Iconify (le `iconprefix` YesWiki disparaît : l'identifiant Iconify est complet) |

### Filtres disponibles (ex-« Facettes »)

| Prop | Libellé | Notes |
|---|---|---|
| `filters` | Filtres disponibles | `field-rows` avec icône : picker + drag + titre éditable en place + **icône optionnelle** (historique YesWiki). Champs sources : à options (`list`, `radio`, `multiChoice`), **Mots-clés** (`tags` — options = les tags existants, un plus sur YesWiki) et `$form`. |
| `filtersPosition` | Position des filtres | avancé : `left` (défaut — YesWiki disait droite) · `right` ; sur mobile, repli en bouton « Filtres » + panneau (natif) |
| `filtersExpanded` | Filtres dépliés à l'arrivée | avancé : `first` (défaut) · `all` |
| `filterCounts` | Nombre de fiches par option | avancé, coché — les comptes « (12) » se recalculent en direct selon les autres filtres |

Le bouton « **Effacer les filtres** » apparaît automatiquement dès qu'un filtre est actif — un comportement, pas un paramètre (le `resetfiltersbutton` YesWiki disparaît, comme la largeur 1–12 des facettes).

### Tri

| Prop | Libellé | Notes |
|---|---|---|
| `sortField` | Trier par | pseudo-champs inclus — **défaut : `$createdAt`** |
| `sortOrder` | Ordre | `desc` (défaut — les récentes d'abord ; YesWiki triait croissant) · `asc` |
| `sortOptions` | Tris proposés aux visiteurs | `field-rows` (champ + titre) — menu « Trier par » à côté de la recherche |

Tri visible pour Liste, Grille, Tableau, Carrousel, Galerie ; masqué pour Carte, Calendrier, Agenda, Annuaire (ordre spatial/temporel/alphabétique par nature). `sortOptions` : Liste, Grille, Galerie seulement (le Tableau a ses en-têtes).

### Sélection des fiches

| Prop | Libellé | Notes |
|---|---|---|
| `period` | Période | vide = pas de filtre ; `future` (À venir) · `past` (Passées) · `today` (Aujourd'hui) · `last-30-days` · `next-30-days` · `one-week-around` (± 1 semaine) · `last-2-years` |
| `periodField` | Sur le champ | visible si `period` ; champs date + pseudo-champs dates ; pré-rempli : `startDateField` sur Calendrier/Agenda, sinon l'unique champ date |
| `limit` | Nombre maximal de fiches | avancé, vide = toutes — **tronque** la source (« les 5 dernières actus »), à distinguer de `pageSize` qui **pagine** l'affichage |

### Pagination

`pageSize` (« Fiches par page », vide = tout) : Liste, Grille, Tableau, Agenda, Annuaire, Galerie.

## Architecture

- **Builder 100 % descripteur** (ADR 0018) : le YAML d'EntriesView utilise six nouveaux types génériques — `view-picker` (tuiles), `form-field` (sélecteur de champ·s des formulaires choisis, options chargées par Server Action selon la valeur du champ frère `form`, filtrables par types de champs, pseudo-champs déclarables), `field-rows` (lignes ordonnées champ + titre éditable + extra optionnel), `color-mapping`, `icon-mapping`, `map-view`. Tous réutilisables par de futurs composants.
- **Props structurées en expressions littérales** (ADR 0019) : `filters={[{ field: "type", title: "Type d'acteur" }]}` — le bac à sable les rend déjà (`lib/mdx-literal-props.ts`) ; le chantier est le **round-trip** du builder (parser l'AST du littéral, régénérer). Multi-formulaires : `form="associations"` ou `form={["associations", "evenements"]}` (même prop).
- **Données** : composant client, chargement complet par **Server Action en lecture** (motif ADR 0014) — recherche, filtres, tri, compteurs et pagination s'exécutent **en mémoire** (latence zéro). Garde-fous : la Server Action ne renvoie que les **champs référencés** par la configuration (zones, colonnes, filtres, tri, recherche), et les longues listes sont paginées ou virtualisées. Si l'échelle l'exige un jour, le filtrage serveur deviendra une optimisation interne sans changer la balise.
- **Popup fiche** : rendue par le vrai pipeline (mécanique d'aperçu existante), pas une re-implémentation.

## Table de traduction YesWiki → WikiOui

Le contrat de migration : toute donnée YesWiki (actions `{{bazar…}}`) doit trouver sa cible ici.

### Actions → valeurs de `view`

| Action YesWiki | WikiOui |
|---|---|
| `bazarliste` (template `liste_accordeon`) | `view="list"` |
| `bazarcard` (`card`) | `view="grid"` (« Blocs » → « Grille ») |
| `bazartableau` (`tableau.tpl.html`) | `view="table"` |
| `bazarcarto` (`map`) | `view="map"` |
| `bazarcalendar` (`calendar`) | `view="calendar"` |
| `bazaragenda` (`agenda`) | `view="agenda"` |
| `bazarannuaire` (`annuaire_alphabetique`) | `view="directory"` |
| `bazarcarousel` (`carousel`) | `view="carousel"` |
| `bazarlistephotobox` (`photobox`) | `view="gallery"` (« Photobox » → « Galerie photo ») |
| `bazargogocarto` | **Abandonné** |
| `bazarblog`, `bazartimeline`, `bazarlisteliens`, `bazarmapandtable` | **Backlog** (Carte-et-tableau : deux `<EntriesView>` superposés) |

### Paramètres communs

| YesWiki | WikiOui |
|---|---|
| `id` (formulaire·s de l'action bazar) | `form` (slug, ou tableau de slugs) |
| `template` | `view` |
| `dynamic` | **Supprimé** — tout est toujours dynamique |
| `search` (oui/non/dynamique) | `search` (checkbox) |
| `searchfields` | `searchFields` (défaut : tous les champs texte, plus seulement le titre) |
| `pagination` | `pageSize` |
| `nb` (« Limitation ») | `limit` |
| `colorfield` / `colormapping` | `colorField` / `colors` (+ palette automatique par défaut) |
| `iconfield` / `iconmapping` | `iconField` / `icons` |
| `iconprefix` | **Supprimé** (identifiants Iconify complets) |
| `facettes` (sous-props `field`/`title`/`icon`) | `filters` (mêmes trois clés — « Facette » → « Filtre ») |
| `filterposition` (défaut droite) | `filtersPosition` (défaut `left`) |
| `groupsexpanded` (false/true) | `filtersExpanded` (`first`/`all`) |
| `filtersresultnb` | `filterCounts` |
| `filtercolsize` | **Supprimé** (largeur automatique) |
| `resetfiltersbutton` | **Supprimé** (bouton automatique dès qu'un filtre est actif) |
| `filteruserasowner` | **Supprimé** (reviendra avec l'auth) |
| `champ` / `ordre` (tri, défaut croissant) | `sortField` / `sortOrder` (défaut `$createdAt` + `desc`) |
| `sortfields` (« tri dynamique ») | `sortOptions` (« Tris proposés aux visiteurs ») |
| `datefilter` (futur, past, `>-1M`, `>-0D&<+1M`, `>-2Y`, `>-7D&<+7D`, today) | `period` (`future`, `past`, `last-30-days`, `next-30-days`, `last-2-years`, `one-week-around`, `today`) + `periodField` explicite (YesWiki visait `bf_date_debut_evenement` en dur) |
| `entrydisplay` (direct/newtab/modal/sidebar/popup) | `entryDisplay` (`current-tab`/`new-tab`/`popup`/`sidebar`/`map-popup`) — popup en tête et par défaut, `sidebar` défaut Carte |
| `showexportbuttons`, export iCal, `exportallcolumns` | **Backlog** (chantier export) |
| `showmapinlistview` | **Abandonné** |
| `extraFields` : `id_typeannonce`, `owner`, `date_creation_fiche`, `date_maj_fiche` | Pseudo-champs `$form`, `$owner`, `$createdAt`, `$editedAt` |

### Par vue

| YesWiki | WikiOui |
|---|---|
| `displayfields` / `correspondance` (sous-props) | Props de premier rang `…Field` (règle ADR 0013 : pas de subproperties) |
| `displayfields.title` / `.subtitle` / `.text` / `.footer` / `.visual` / `.floating` | `titleField` / `subtitleField` / `textField` / `footerField` / `visualField` / `badgeField` (« zone flottante » → « Badge ») |
| liste : zones `visual`/`floating` déclarées | **Non reprises** (Liste = Titre + Sous-titre, comme le rendu YesWiki effectif) |
| card `nbcol` / agenda `nbcol` | `columnCount` |
| card `style` (vertical/square/horizontal) | `layout` (`vertical`/`horizontal`/`square`) |
| card `imgstyle` (contain/cover) | `visualFit` (`contain`/`cover`) |
| card `nblines` (« lignes du sous-titre ») | `textLines` — corrigé : c'est la zone de texte qu'on tronque |
| carto `provider` (36 fonds, Stamen morts) | `basemap` (~8 fonds curés) |
| carto `coordinates` (« Vue initiale ») | `initialArea` (vide = fit bounds automatique) |
| carto `cluster` (défaut non) | `cluster` (défaut **oui**) |
| carto `width`/`height` | `width` (avancé)/`height` |
| carto `displayfields.markerhover` | `hoverField` |
| carto `zoommolette` | `wheelZoom` |
| carto `smallmarker` | **Supprimé** (un seul design de marqueur) |
| carto `popuptemplate`/`popupcustomtemplate`/`popupselectedfields`/`necessary_fields` | **Supprimés** — la mini-fiche `map-popup` est native (visuel + titre + « Voir la fiche ») |
| calendar/agenda `bf_date_debut_evenement`/`bf_date_fin_evenement` | `startDateField` / `endDateField` |
| calendar `initialview` (dayGridMonth/timeGridWeek/timeGridDay/list) | `initialView` (`month`/`week`/`day`/`planning`) |
| calendar `showlist` (« bouton planning » semaine/mois/année) | `planningRange` (`week`/`month`/`year`) |
| `minical` | `compact` |
| calendar `showicalbutton` | **Backlog** (export) |
| agenda `modal` | Absorbé par `entryDisplay` |
| tableau `columnfieldsids` + `columntitles` (virgules) | `columns` (`field-rows` : sélection + ordre + titres éditables en place) |
| tableau `checkboxfieldsincolumns` (défaut oui) | `splitMultiChoice` (défaut **non**) |
| tableau `displayvaluesinsteadofkeys` | **Supprimé** — toujours les libellés |
| tableau `displayimagesasthumbnails` | **Supprimé** — toujours des vignettes |
| tableau `sumfieldsids` | `sumFields` |
| tableau `displayadmincol` (non/oui/onlyadmins) | `actionsColumn` (checkbox ; « onlyadmins » avec l'auth) |
| tableau `displaycreationdate`/`displaylastchangedate`/`displayowner` | **Supprimés** — pseudo-champs dans `columns` |
| tableau `defaultcolumnwidth`/`columnswidth` | **Backlog** (largeur automatique) |
| carousel `bf_titre` (« texte affiché ») + `sanstitre` | `captionField` (défaut titre, effaçable) — deux paramètres fusionnés |
| carousel `avecpage` (`PageDessusSlider`) | **Abandonné** (page magique nommée en dur) |
| carousel `showlinkinsteadofurl` | **Abandonné** (le clic mène à la fiche) |
| — | `autoplay` + `interval` (nouveaux) |

## Hors périmètre v0.4 (backlog)

Vues Blog, Timeline, Liste de liens, Carte-et-tableau · export (boutons CSV/JSON, iCal, colonnes masquées) · largeurs de colonnes du Tableau · templates de popup carte personnalisés · « fiches de l'utilisateur courant » et « seulement pour les admins » (auth) · filtrage serveur (optimisation d'échelle).

## Bibliothèques retenues (arrêtées à l'implémentation)

- **Calendrier : FullCalendar 6** (`@fullcalendar/react` + daygrid/timegrid/list, locale française) — retenu pour ses vues liste (le « Planning » avec ses trois portées) ; la v7, sortie en cours de chantier, a une API remaniée et sera évaluée plus tard.
- **Carrousel : Embla** (`embla-carousel-react` + plugin autoplay).
- **Carte : Leaflet + react-leaflet** (déjà présents) + **`leaflet.markercluster`** pour le regroupement — les marqueurs sont gérés impérativement (react-leaflet 5 n'a pas d'histoire de clustering, le pont aurait coûté plus que la couche impérative).
- **Tableau : fait main** — la suggestion TanStack Table est écartée : le pipeline en mémoire (recherche, filtres, tri, pagination) possède déjà le tri et la pagination, une seconde machinerie de tri aurait fait deux sources de vérité.
- **Visionneuse (Galerie) : faite main** (~90 lignes : navigation clavier, légende, « Voir la fiche ») — une dépendance type PhotoSwipe n'apportait rien de plus.

Détail d'implémentation : la prop `period` porte la valeur interne `none` (« Toutes les fiches », jamais écrite dans le MDX — la règle d'omission l'efface) car un champ `list` du builder exige un défaut parmi ses options ; la forme écrite reste « prop absente = pas de filtre », conforme à la table ci-dessus.
