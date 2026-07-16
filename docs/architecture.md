# WikiOui — Synthèse de conception

WikiOui est un moteur de wiki : des sites collaboratifs dont chaque page est écrite en MDX et éditable en ligne. Refonte de YesWiki sur une stack moderne. **L'ergonomie est prioritaire** (composants beaux, fluides, ergonomiques).

Glossaire du domaine : [`../CONTEXT.md`](../CONTEXT.md).

## Stack

Next.js (App Router) · Prisma · PostgreSQL · shadcn/ui · CodeMirror 6 (éditeur) · pipeline MDX (`next-mdx-remote` + `remark-gfm` + `mdx-annotations`) · **pnpm**.

## v0.1 — MVP (état actuel)

CRUD de pages par slug · routing page/handler natif Next · handlers `show`, `edit`, `revisions` · rendu MDX bridé · composants intégrés `<Menu>` (liste imbriquée → menu multi-niveaux, ADR 0010) et `<Button>` · historique (toutes révisions) + diff + restauration · pages spéciales de layout (roue crantée de `page-rapide-haut` vers les pages de configuration du layout) · éditeur riche CodeMirror (barre d'outils markdown, listes de tâches, modale de lien, outils contextuels ancrés au curseur : édition de lien, tableaux) · double-clic sur le contenu pour éditer · tags · "hard delete" (suppression définitive).

## v0.2 — Upload de fichiers & authoring de composants

### Upload de fichiers

**Trois portes, un pipeline** : bouton **Uploader** de la barre d'outils · **drag & drop** dans l'éditeur (insertion à la position du pointeur au moment du drop) · **collage** (fichier copié ou capture d'écran ; nom généré `capture-AAAA-MM-JJ.png` si le presse-papier est anonyme). Un fichier à la fois — plusieurs fichiers ou un dossier → toast clair. Le fichier part vers `POST /api/files` pendant que la modale affiche nom, taille et **progression d'envoi** (service d'API + `xhr.upload.onprogress` : une Server Action ne sait pas exposer la progression — ADR 0012). Puis selon la **famille** du fichier :

- **image** → `<Image>` : alignement (texte en dessous, gauche, centre, droite), taille (originale ou spécifiée), texte alternatif pour les personnes malvoyantes ; en paramètres avancés : lien web associé au clic · effets graphiques (bord blanc, ombre portée, agrandissement au survol) · clic sur l'image pour l'afficher en grand dans une modale · texte affiché au survol ;
- **pdf** → mini-choix « intégrer le contenu dans la page » (`<Pdf>`) ou « insérer un lien de téléchargement » (`<FileLink>`) ;
- **other** → `<FileLink>` : un lien de téléchargement affichant le nom et la taille du fichier ; champs : texte du lien, texte affiché au survol.

Annuler la modale **juste après l'upload qui a créé le fichier** supprime le fichier (toast « rien n'a été conservé ») ; annuler une réédition ou une insertion depuis le menu ne supprime jamais rien.

**Stockage** (ADR 0012) : répertoire `files/` à la racine — **le répertoire fait foi**, pas de table Prisma ; noms slugifiés, collision → suffixe numérique ; orphelins conservés (bibliothèque du wiki) ; accès via `lib/files.ts` (adaptateur S3 enfichable au backlog). Service par `GET /api/files/[name]` avec `nosniff` partout, `CSP: sandbox` sur les svg, `Content-Disposition: attachment` sur la famille `other` — seul le segment `api` est réservé, il regroupe tous les services d'API.

**Configuration** (`wiki.config.ts`) : `upload.maxFileSize` (défaut 10 Mo), `upload.maxImageSize` (défaut 2 Mo), `upload.allowedExtensions` groupées **par famille** — la famille route vers le bon composant et filtre les combobox `file-list`. Par défaut : **image** = jpg, jpeg, png, gif, webp, avif, bmp, tif, svg ; **pdf** = pdf ; **other** = aiff, anx, axa, axv, asf, avi, flac, flv, json, geojson, mid, mng, mka, mkv, mov, mp3, mp4, mpg, mscz, oga, ogg, ogv, ogx, qt, ra, ram, rm, spx, swf, wav, wmv, 3gp, abw, ai, bz2, bin, blend, c, cls, css, csv, deb, doc, docx, djvu, dvi, eps, gz, h, kml, kmz, md, mm, pas, pgn, ppt, pptx, ps, psd, pub, rpm, rtf, sdd, sdw, sit, sty, sxc, sxi, sxw, tex, tgz, torrent, ttf, txt, xcf, xspf, xls, xlsx, xlsm, yaml, zip, scar, odt, ods, odp, odg, odc, odf, odb, odi, odm, ott, ots, otp, otg.

### Authoring de composants (ComponentBuilder)

Les composants sont des composants MDX placés dans `/components/wiki` (autodécouverts par le registre, ADR 0002). Un composant doté d'un **descripteur YAML co-localisé** (ex. `button.yaml`) apparaît dans le menu « Composants » de l'éditeur ; le sélectionner ouvre son **ComponentBuilder** : une modale de paramétrage **autogénérée depuis son descripteur YAML** (champs, types, défauts) — aperçu du rendu en haut, champs en dessous (les champs `advanced` derrière « paramètres avancés »). Le composant `.tsx`, lui, est du React **sans contrat** (client ou serveur) : il fournit l'aperçu, et sa cohérence avec le descripteur est **vérifiée par signature** au build et en dev (ADR 0013). L'aperçu est produit par le **vrai pipeline** de rendu de pages : l'iframe de la modale charge `GET /api/render?source=…` (debounce, hauteur `previewHeight`), une page **nue** — hors du groupe de routes `(site)` qui porte le chrome du site — donc hydratée et fidèle : ce que montre l'aperçu est ce que la page rendra, erreurs comprises. (Un `route.ts` + `renderToStaticMarkup` est impossible : les composants client ne se sérialisent pas hors du pipeline RSC.) Spécification du ComponentBuilder et du YAML : [`component-builder.md`](component-builder.md) (avec table de traduction depuis le format YesWiki, [`reference/yeswiki-actions-builder.md`](reference/yeswiki-actions-builder.md)).

Exemple du bouton : texte · lien (web ou nom d'une page du wiki) · texte affiché au survol · icône via le **sélecteur d'icônes Iconify** · couleur (défaut, primaire, secondaire 1, secondaire 2, succès, info, attention, danger, lien) · ouverture du contenu du lien dans une popup (au clic ou au survol) · position (par défaut, droite, toute la largeur) · ouvrir dans une nouvelle fenêtre (oui/non). (Pas d'équivalent au `nobtn` YesWiki : un bouton ne se rend pas en lien, les composants ne se mélangent pas.)

**Icônes (type `icon`)** : jeux Iconify **embarqués** — données `@iconify-json/{set}` installées par paquet, exposées via `icons.sets` dans la config (défaut : `lucide`, celui de l'UI). Un composant serveur en fait un **SVG inline** (`@iconify/utils`, `iconSvg()`) ; un composant client passe par le `<Icon>` client qui récupère le SVG de la route interne `GET /api/icons/[id]` (fetch same-origin, mis en cache) — les données d'icônes ne sont jamais bundlées côté client (ADR 0013). Dans les deux cas, **aucun appel réseau externe** : intranet et RGPD sereins. La prop stocke l'identifiant Iconify (`icon="lucide:settings"`). Le sélecteur (grille + recherche) cherche dans les jeux embarqués ; noms et tags Iconify étant anglophones, un avertissement discret le signale dans l'interface (lexique français de synonymes : backlog). Pas de rétrocompatibilité avec les noms français du MVP (`roue`, `maison`…) : la map de `button.tsx` disparaît, le seed migre (`icon="lucide:settings"`).

L'insertion se fait au curseur depuis le menu « Composants » de la barre d'outils (dropdown des `label`, tri alphabétique) ; la **réédition** suit le motif des outils ancrés de la v0.1 : curseur dans une balise de composant → crayon flottant → builder pré-rempli (mapping inverse), balise réécrite en place. Pas de crayon sur une balise malformée ou sans descripteur.

Composants couverts en v0.2 — tous au menu « Composants » (insertion et réédition toujours symétriques ; les champs fichier sont des combobox `file-list` des fichiers uploadés) :

- **`Button`** — le bouton intégré ;
- **`Image`** — affichage d'une image uploadée ;
- **`Pdf`** — affiche dans la page le contenu d'un PDF via le lecteur intégré du navigateur ;
- **`FileLink`** — lien de téléchargement d'un fichier uploadé (nom, taille).

Chaque composant de `/components/wiki` porte son descripteur WikiOui (`button.yaml`, `image.yaml`, `pdf.yaml`, `file-link.yaml`, `wiki-link.yaml`) ; `<Menu>` (wrapper) attend l'édition des composants à enfants, au backlog.

**Cas particulier `wiki-link`** : sa modale de paramétrage existe déjà dans le MVP, codée à la main. En v0.2 elle est reconstruite sur le moteur ComponentBuilder avec son propre descripteur `components/wiki/wiki-link.yaml` (champs : texte, cible `page-list`, ouverture). Sa **cible de sérialisation** diffère : il émet un lien markdown `[texte](cible){{ target: '…' }}` (ADR 0006), pas une balise JSX — c'est ce qui le tient hors du menu « Composants ». Ses portes d'entrée : le bouton « Ajouter un lien » de la barre d'outils et le bouton flottant d'édition de lien ancré au curseur.

## Backlog (sans version prévue)

Pages d'administration (Tableau de bord, Documentation, Gestion du site, Formulaire — rejoindront le menu roue crantée par édition de `page-rapide-haut`) · droits d'accès & authentification · signalement à l'auteur des attributs refusés par le sandbox (aujourd'hui silencieux, ADR 0002) · recherche/filtre par tags & vues (agenda, carte, annuaire…) · overlay-modal pour l'historique · table `Settings` éditable à chaud.

## Architecture en un coup d'œil

- **Routing** (ADR 0001) : les handlers sont des routes Next natives. `app/(site)/[slug]/page.tsx` = `show` ; `app/(site)/[slug]/edit/page.tsx`, `app/(site)/[slug]/revisions/page.tsx` — le groupe `(site)` est invisible dans l'URL, il porte le layout du chrome (bandeau, menu, footer) ; le layout racine est réduit au squelette (`html`/`body`/polices), ce qui permet des pages nues sous `/api`. `/` redirige vers `/page-principale` (`redirects()`). Slug : `^[a-z0-9]+(?:-[a-z0-9]+)*$`, minuscules (majuscules redirigées), tapé dans l'URL (pas de titre séparé).
- **Handler de page vs Mutation vs Service d'API** : un handler de page *affiche* une vue (`/{slug}/{handler}`) ; sauvegarder / supprimer / restaurer sont des **Server Actions** (pas d'URL) ; les **Services d'API** (sous le segment réservé `/api`) servent le code — `GET /api/files/[name]`, `POST /api/files` (mutations portées par un service : la progression d'upload, ADR 0012), en `route.ts` ; `GET /api/render` (aperçu du ComponentBuilder) est le cas particulier du service dont la réponse est une page HTML complète, porté par une `page.tsx` nue.
- **Rendu** (ADR 0002) : MDX bridé. Registre de composants = `/components/wiki` (autodécouverte) + config. `import`/`export` désactivés ; expressions JS de contenu supprimées ; expressions d'attribut réduites à une liste blanche de littéraux statiques (`lib/mdx-literal-props.ts`) — une prop reçoit ainsi un vrai nombre sans ouvrir de RCE. Composants intégrés (`<Menu>`, `<Button>`) présents dès le MVP ; l'*authoring* (ComponentBuilder) arrive en v0.2. `<Menu>` est piloté par la liste imbriquée écrite entre ses balises (ADR 0010).
- **Éditeur** (ADR 0005) : CodeMirror 6, édition de source MDX colorée. Barre d'outils : gras, italique, barré, titres, listes (puces/numérotée/tâches), citation, code, ligne horizontale, alignement (classe Tailwind), commentaire (`{/* */}`), lien (modale), insertion de tableau, aide-mémoire. Pas de souligné. UI contextuelle **ancrée au curseur** (tooltips CodeMirror) : icône de modification de lien, opérations de tableau positionnées spatialement (colonne en haut, ligne à gauche, reformatage au coin). Double-clic sur le contenu du `show` → édition.
- **Liens** (ADR 0006) : liens wiki en relatif par slug (`[texte](ma-page)`) ; externes en `http(s)://`. Modale de lien : cible onglet courant / nouvel onglet / **fenêtre modale** (Dialog ; avertissement si URL externe). Autocomplétion des pages. En v0.2, cette modale devient un ComponentBuilder généré depuis `components/wiki/wiki-link.yaml`, à sérialisation markdown.
- **Pages spéciales** : slug réservé, seedées, non supprimables mais éditables — les 5 de layout, `page-principale`, `aide-memoire`.
- **Historique** (ADR 0009) : pleine page, timeline horizontale (récente à droite), toutes les révisions. 3 vues : *Aperçu* (checkbox rendu ↔ code), *Modifications* (diff MDX vs précédente), *Différence avec la courante* (diff MDX). Diffs sur le source uniquement.
- **Config** (ADR 0004) : `wiki.config.ts` typé (slugs des pages spéciales, slug d'accueil ; en v0.2 : `upload.*` — tailles limites et extensions par famille, `icons.sets` — jeux Iconify exposés, composants déclarés hors `/components/wiki`).

## Schéma Prisma cible

Schéma Prisma : [prisma/schema.prisma](../prisma/schema.prisma).

Notes : création d'une page en deux temps (Page → Revision → pointer `currentRevisionId`). Suppression dure d'une Page → cascade sur ses révisions ; le self-relation `restoredFrom` en `SetNull` pour ne pas bloquer la cascade.

## Décisions (ADR)

1. [Handlers = routes Next natives](adr/0001-handlers-as-native-next-routes.md)
2. [Rendu MDX bridé (sandbox) + registre](adr/0002-mdx-rendering-sandbox.md)
3. [Modèle Page/Révision + pointeur courant](adr/0003-page-revision-model.md)
4. [Config = module TS typé](adr/0004-config-as-typed-ts-module.md)
5. [Éditeur CodeMirror (source MDX)](adr/0005-editor-codemirror-source.md)
6. [Liens wiki relatifs](adr/0006-relative-wiki-links.md)
7. [Tags = String[] sur la Page](adr/0007-tags-as-page-string-array.md)
8. [Suppression dure](adr/0008-hard-delete.md)
9. [Historique : pleine page, diffs sur le source](adr/0009-revisions-view.md)
10. [Menu piloté par liste imbriquée MDX](adr/0010-menu-authored-nested-list.md)
11. [Classes utilitaires auteurs = liste blanche safelistée](adr/0011-author-utility-classes-safelist.md)
12. [Fichiers uploadés : le répertoire `files/` fait foi](adr/0012-files-directory-is-source-of-truth.md)
13. [Descripteur ComponentBuilder : YAML seul, vérifié par signature](adr/0013-yaml-only-descriptor-verified-by-signature.md)

## Points validés avant code

- **`remark-attributes` → remplacé par `mdx-annotations`** (validé le 2026-07-08). `remark-attributes` exige des accolades échappées `\{…\}` sous MDX (contrainte du parseur MDX, rédhibitoire pour les auteurs). `mdx-annotations` (Tailwind Labs) exploite les expressions MDX à la place : `# Titre {{ id: 'ancre' }}`, `[lien](/page){{ className: 'btn' }}` — zéro échappement, vérifié sous MDX 3 / next-mdx-remote 6. Les conteneurs/encarts passent par le registre de composants (ADR 0002), sans `remark-directive` (une seule syntaxe avancée : le JSX ; la directive reste ajoutable plus tard, coexistence prouvée). Preuves : [`research/remark-attributes-mdx.md`](research/remark-attributes-mdx.md), [`research/mdx-native-element-attributes.md`](research/mdx-native-element-attributes.md).
- **Descripteur ComponentBuilder → YAML seul, composants sans contrat, vérifié par signature** (validé le 2026-07-12, ADR 0013 ; **implémenté**). Les défauts ont quitté le `.tsx` (l'export `xxxDefaults` forçait le composant serveur, cf. le bug du menu commit `67ffd53`) pour le YAML ; le composant est devenu du React ordinaire, client ou serveur. La cohérence YAML ↔ composant (champ ∈ props, obligatoire, type, dérive du `default`, type de `value`) est vérifiée en parsant la **source** du composant (`ts-morph`, *devDependency*, `lib/verify-descriptors.ts`), au build (`prebuild` bloquant, `scripts/verify-descriptors.ts`) et en dev (overlay d'erreur au chargement de l'éditeur), jamais au runtime de prod. Détail : [`component-builder.md`](component-builder.md). Changement compagnon (**implémenté**) : route d'icônes `GET /api/icons/[id]` + `<Icon>` client (`components/wiki/internal/icon.tsx`, fetch + cache), qui a permis de repasser `<Button>` en composant client — supprimant à la racine la classe de bug du `<button>` imbriqué du menu (le workaround `isRenderedButton` de `menu.tsx` disparaît, `<Menu>` reconnaît `<Button>` par ses props conservées à travers la frontière RSC).
