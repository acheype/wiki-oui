# WikiOui

WikiOui est un moteur de wiki : il permet de créer facilement des sites collaboratifs dont chaque page est écrite en MDX et éditable en ligne. Refonte de YesWiki sur une stack moderne (Next.js, Prisma, PostgreSQL, shadcn/ui).

## Language

**Page**:
L'unité de contenu du wiki, identifiée par un slug unique. Son contenu est écrit en MDX — sauf pour une **fiche** (v0.3), dont le contenu est un snapshot de valeurs de champs. Une page a un historique de révisions. Elle n'a **pas de champ titre distinct** : son titre visible est le premier titre `#` de son contenu (pour une fiche : son champ titre). La ligne `Page` n'est créée qu'à la **première sauvegarde** (visiter une page inexistante n'écrit rien).
_Avoid_: Article, document, nœud

**Slug**:
L'identifiant textuel d'une page, et sa seule identité : il est tapé directement dans l'URL (pas généré depuis un titre). Format `^[a-z0-9]+(?:-[a-z0-9]+)*$` (minuscules, chiffres, tirets ; pas de CamelCase à la YesWiki). C'est le niveau 1 de l'URL : `https://site/{slug}`. Les majuscules sont normalisées par redirection (`/Ma-Page` → `/ma-page`) ; un slug hors motif renvoie *not found*. En UI, il est présenté comme l'**adresse** de la page. **Renommable** a posteriori (« Changer l'adresse », geste d'administrateur, confirmation chiffrée) : toutes les références internes sont réécrites, historique compris ; il n'y a **pas de redirection** — l'ancienne adresse cesse d'exister (favoris et liens externes cassent, accepté).
_Avoid_: Id, nom de page, permalink ; slug immuable (obsolète depuis « Changer l'adresse »)

**Handler de page**:
Une **vue** d'une page, rendue à une URL de niveau 2 : `https://site/{slug}/{handler}` (ex. `edit`, `revisions`). Un handler de page *affiche* quelque chose à un humain. Implémenté comme un segment de route Next natif dans le groupe de routes du chrome : `app/(site)/[slug]/{handler}/page.tsx`. Le handler par défaut est `show`, servi par `app/(site)/[slug]/page.tsx` ; `/{slug}` est un raccourci de `/{slug}/show`.
_Avoid_: Route, action, contrôleur ; « Route Handler » (jargon Next : désigne un Service d'API, pas un handler de page)

**Mutation**:
Une action qui modifie la base et ne rend **aucune vue** : sauvegarder, supprimer, restaurer, renommer (« Changer l'adresse »). Implémentée comme une **Server Action** (pas d'URL, POST implicite). Tout ce qui est dans la barre d'actions n'est donc pas un handler : `Éditer`/`Historique` sont des handlers de page (vues), `Supprimer`/`Restaurer` sont des mutations. Exceptionnellement, une mutation est **portée par un Service d'API** quand la Server Action ne sait pas transporter l'exigence UX (l'upload et sa progression, ADR 0012). Depuis la v0.3, une Server Action peut aussi porter une **lecture** pour un composant client (écrans d'administration des formulaires, ADR 0014) — c'est le même transport, mais ce n'est pas une Mutation.
_Avoid_: Handler (pour une mutation), endpoint

**Service d'API**:
Un endpoint HTTP **programmatique** : consommé par du code (la modale d'aperçu, la balise `<img>` qui charge un fichier), jamais visité comme une page par un humain. Regroupé sous le segment réservé `/api`, implémenté en Route Handler Next (`route.ts`) : `GET /api/files/{nom}` (servir un fichier), `POST /api/files` (upload — mutation portée par un service). Cas particulier : un service dont la réponse est une page HTML complète est porté par une `page.tsx` **nue** (hors du groupe `(site)`, donc sans chrome) — `GET /api/render?source=…`, l'aperçu du ComponentBuilder, rendu par le vrai pipeline de pages. Le triptyque complet : handler de page = vue pour un humain · mutation = écriture · service d'API = service pour du code.
_Avoid_: handler (pour un service) ; réserver un segment d'URL de niveau 1 par service (un seul segment réservé : `api`)

**Révision**:
Un instantané complet du contenu d'une page à un instant donné, avec son auteur et sa date — le MDX (`content`) pour une page ordinaire, le snapshot JSON des valeurs de champs (`data`) pour une fiche. Chaque sauvegarde qui change le contenu crée une nouvelle révision — enregistrer un contenu identique n'écrit rien ; l'historique est la suite des révisions d'une page. (Les tags ne sont pas historisés : ils vivent sur la Page et se mettent à jour sans révision.)
_Avoid_: Version (comme table), historique (pour une entrée)

**Révision courante**:
La révision actuellement affichée d'une page, désignée explicitement par un pointeur `Page.current` (et non par la date la plus récente). Restaurer une ancienne révision crée une **nouvelle** révision (copie de son contenu, `createdAt` = maintenant) et fait pointer `current` dessus — à une exception près : le titre automatique d'une fiche y est recalculé, l'état courant suivant toujours la définition courante de son formulaire (ADR 0020). « Dernière édition » affichée = `current.createdAt`.
_Avoid_: Latest, dernière révision (trompeur : peut être une restauration)

**Composant**:
Un élément riche insérable dans le contenu d'une page (ex. Bouton, Image). Rendu via une syntaxe façon MDX, mais seuls les composants d'une liste blanche sont autorisés (voir Registre de composants). Les composants intégrés sont rendus dès le MVP ; l'*authoring* (menu « Composants », ComponentBuilder) arrive en v0.2.
_Avoid_: Widget, plugin, action

**Propriété**:
Un paramètre d'un composant, écrit dans sa balise (`<Button text="Salut" />`) et décrit par une clé du bloc `properties` de son descripteur — qui en fixe le type, le défaut et les valeurs possibles. Le descripteur est le **contrat** : ce qu'il promet fait référence, pas ce qu'un composant tolère (`width="200"` rend, mais `type: number` promet un nombre — c'est signalé). En code, une propriété est une **prop** React ; « attribut » ne désigne que la syntaxe JSX écrite dans la balise, et ne sort jamais dans un texte d'UI. Ce qu'un auteur écrit et que le descripteur ne décrit pas est ignoré au rendu et signalé à l'enregistrement (`lib/page-lint.ts`).
_Avoid_: Attribut, paramètre, option, champ (le champ est le widget du builder, pas la propriété qu'il alimente)

**Registre de composants**:
La liste blanche des composants autorisés au rendu, construite automatiquement à partir du répertoire `/components/wiki` plus ceux déclarés dans le fichier de configuration. Une balise hors registre n'est pas rendue. La présence d'un descripteur co-localisé (`button.yaml`) est un fait indépendant : il pilote le menu « Composants » de l'éditeur et la génération du ComponentBuilder, pas l'autorisation de rendu.

**Balise HTML autorisée**:
Une balise HTML qu'un auteur peut **écrire ou coller** dans sa page (`<div>`, `<details>`, `<sup>`, `<iframe>`…). Comme les composants et les classes, c'est une **liste blanche** (ADR 0002, `lib/mdx-host-elements.ts`) : elle contient ce qui met en forme de la prose, plus `iframe` (embarquer un site se fait en collant un extrait tout fait) ; tout le reste est retiré au rendu avec ses enfants — `script`, `style`, `object`, `embed`, `form`, `link`, et toute balise à laquelle personne n'a pensé. Ne concerne **que** le JSX écrit par l'auteur : le HTML que markdown produit lui-même (tableau, liste, case à cocher) ne passe pas par ce chemin et n'est jamais filtré. Une balise refusée est signalée à l'enregistrement. Y ajouter une balise est un geste d'opérateur (on édite le code), comme pour une famille de classes (ADR 0011). Deux **noms de props** sont refusés partout : `dangerouslySetInnerHTML` et `srcDoc`.
_Avoid_: « tout HTML », balise interdite (la liste dit ce qui est permis, pas ce qui est banni)

**Page spéciale**:
Une page à **slug réservé**, créée au seed de la base, **non supprimable, non renommable, mais éditable** (comme n'importe quelle page : flux d'édition normal, rendu MDX normal). C'est le seul trait qui la définit ; « alimenter le layout » n'est qu'une propriété de certaines d'entre elles. Les pages spéciales : les 5 pages de layout (`page-titre`, `page-menu-haut`, `page-rapide-haut`, `page-header`, `page-footer`), `page-principale` (l'accueil, cible de la redirection `/` → `/page-principale` ; contenu ordinaire), `aide-memoire`, et depuis la v0.3 les écrans d'administration des formulaires : `formulaires` (rend `<FormsAdmin>`) et `fiches` (rend `<EntriesAdmin>`). Le menu n'a pas de rendu spécial : le contenu par défaut de `page-menu-haut` appelle le composant intégré `<Menu>`, et celui de `page-rapide-haut` expose les 5 pages de layout derrière un bouton roue crantée (`<Menu>` + `<Button>`).
_Avoid_: Page seedée, template, page système, fragment

**Lien wiki**:
Un lien interne vers une autre page, écrit en relatif par son slug (`[texte](ma-page)`), jamais avec le domaine. Distinct d'un lien externe (`http(s)://…`). Voir ADR 0006.
_Avoid_: Lien interne absolu, permalien

**Aide-mémoire**:
La page spéciale `aide-memoire` qui résume toutes les syntaxes MDX supportées dans WikiOui. Ouverte dans une modale depuis la barre d'outils de l'éditeur ; c'est une page, pas un écran codé en dur.

**Commentaire**:
Un fragment de contenu non rendu par `show`, écrit avec la syntaxe de commentaire MDX `{/* … */}`. Visible dans l'éditeur et dans « Afficher le code Wiki », absent du rendu.

**Fichier uploadé**:
Un fichier de la bibliothèque du wiki : stocké dans le répertoire `files/` qui **fait foi** (pas de table — ADR 0012), servi à l'URL `/api/files/{nom}`, nom slugifié comme un slug de page. Sa **famille** (`image`, `pdf`, `other`), déterminée par son extension dans la config, décide du composant qui l'affiche et filtre les combobox `file-list`. Le pool est global au wiki : un fichier non référencé par une page (« orphelin ») reste légitime et réutilisable.
_Avoid_: pièce jointe (un fichier n'appartient pas à une page)

**Classe utilitaire auteur**:
Une classe CSS Tailwind qu'un auteur peut poser sur son contenu — par annotation `{{ className: '…' }}` ou via la prop `className` d'un composant. Seules les classes de la **liste blanche safelistée** fonctionnent (ADR 0011) ; elles sont documentées dans l'aide-mémoire. Une classe hors liste ne fait rien.
_Avoid_: « tout Tailwind » (le contenu en base n'est pas scanné à la build)

**Embed (`<Embed>`)**:
Composant intégré affichant la page d'un autre site (`url`, `title`, `ratio`). C'est **l'une des deux portes** de cet usage, pas la seule : coller l'extrait `<iframe>` tout fait de YouTube ou d'OSM marche aussi (la balise est autorisée, seul `srcDoc` est refusé — c'est lui qui hérite de notre origine et y exécute ses scripts, là où un `src` cross-origin est muré par la politique de même origine). Les deux ne font pas doublon, ils servent deux **gestes** : on colle un extrait quand on en a un, on ouvre le ComponentBuilder quand on n'a qu'une URL. `<Embed>` ajoute alors ce qu'un extrait collé ne porte pas : `https` seul, `sandbox` sans `allow-top-navigation` (sinon le site embarqué redirige l'onglet du lecteur), et un `title` pour les lecteurs d'écran.
_Avoid_: oEmbed / unfurl (aucune métadonnée n'est récupérée), « remplace iframe » (les deux coexistent)

**Composant intégré (built-in)**:
Un composant livré avec WikiOui (`<Menu>`, `<Button>`), présent dans le registre dès le MVP car le rendu (notamment du layout) en dépend. À distinguer de l'*authoring* de composants (menu « Composants » de la barre d'outils, ComponentBuilder, sélecteur d'icônes Iconify) qui, lui, arrive en v0.2. Rendre un composant ≠ fournir l'UI pour l'insérer.

**ComponentBuilder**:
L'interface de paramétrage **autogénérée** d'un composant : une modale construite **depuis son descripteur YAML** co-localisé dans `/components/wiki` (ex. `button.yaml` — champs, types, défauts ; spécification : [`docs/component-builder.md`](docs/component-builder.md)). Le composant `.tsx`, lui, est un composant React ordinaire **sans contrat** (client ou serveur, ADR 0013) : il fournit l'aperçu (via le vrai pipeline de rendu) et sa cohérence avec le descripteur est **vérifiée par signature** au build et en dev. L'aperçu du rendu est affiché en haut, les champs générés en dessous (les champs `advanced` derrière « paramètres avancés »). Ouvert depuis le menu « Composants » de l'éditeur — sauf pour le lien wiki : son ComponentBuilder (descripteur `wiki-link.yaml`) émet un lien markdown plutôt qu'une balise de composant, et s'ouvre depuis le bouton « Ajouter un lien » de la barre d'outils et le bouton flottant d'édition de lien ancré au curseur. Tout builder **insère et réédite** (y compris une occurrence écrite à la main). Couvre `Button`, `Image`, `Pdf`, `FileLink` et `Embed`.
_Avoid_: modale codée à la main (c'est celle du MVP pour le lien), formulaire spécifique par composant

**Menu**:
Composant intégré qui transforme la liste imbriquée écrite entre ses balises en menu de navigation multi-niveaux : niveau 1 en barre horizontale, sous-items en déroulant (l'imbrication au-delà du niveau 2 est aplatie, indentée dans le même déroulant). Un item est au choix un texte (simple déclencheur), un lien (navigue au clic, déroulant au survol/focus) ou un `<Button>`. Sans contenu il ne rend rien : un menu est toujours écrit par l'auteur, jamais déduit de la base (ADR 0010).
_Avoid_: auto-listing des pages, barre de navigation codée en dur

**Bouton (`<Button>`)**:
Composant intégré affichant un bouton défini par une icône (`icon`, dont la valeur est un nom français d'une liste blanche), un libellé (`text`) et éventuellement un lien (`link`). Dans le contenu d'une page il prend l'apparence d'un bouton pleine forme ; dans un slot du bandeau, celle d'un bouton discret de barre de navigation — la différence est purement CSS. Utilisé comme item parent d'un `<Menu>`, il en devient le déclencheur (ex. la roue crantée de `page-rapide-haut`). Son interface graphique de configuration (ComponentBuilder) arrive en v0.2.
_Avoid_: bouton d'action serveur (il ne déclenche pas de mutation)

**Formulaire**:
Une définition de champs de saisie (une liste de champs typés et paramétrés), construite en ligne via le FormBuilder et stockée en base (entité `Form` — **pas** une page, ADR 0014). Identifié par un **id slug** unique dérivé de son `name`, personnalisable à la création puis modifiable seulement par « Changer l'identifiant » — le même retcon intégral que « Changer l'adresse » (ADR 0016), qui réécrit `<EntryForm id>`, les `sourceFormId` et les gabarits. Sa suppression emporte ses fiches (confirmation explicite). Jamais historisé : enregistrer écrase.
_Avoid_: Bazar, ID numérique de formulaire, page de formulaire

**Fiche**:
Une **Page** dont le contenu est structuré par un formulaire (`Page.formId`) : ses valeurs de champs vivent en snapshot JSON `data` sur chaque Révision (historisées comme du contenu). Saisie et éditée par le **formulaire généré** (jamais CodeMirror), rendue par la vue par défaut ou le gabarit du formulaire. Son slug est dérivé de son titre à la création (chip éditable en place, personnalisable) puis ne change plus que par « Changer l'adresse » — jamais recalculé depuis le titre. Toute fiche porte un **titre non vide** dans ses valeurs de champs, y compris en mode **titre automatique** où il est calculé depuis un template `{champ}` : calculé à l'écriture, jamais à la lecture (ADR 0020).
_Avoid_: Entrée (réservé aux noms de code : entry), fiche-page séparée de Page

**FormBuilder**:
L'interface de construction d'un formulaire (page spéciale `formulaires`) : palette de types de champs, drag & drop vers le canvas, panneau de paramétrage par champ, éditeur de gabarit. Produit le descripteur JSON `Form.schema`, validé à l'enregistrement (méta-schéma Zod + règles croisées). Spécification : [`docs/forms.md`](docs/forms.md).
_Avoid_: ComponentBuilder (son cousin pour les composants), éditeur de page

**Gabarit de fiche**:
Le template MDX optionnel d'un formulaire (`Form.template`) qui met en page ses fiches au rendu : les `{champ}` sont substitués par les valeurs de la fiche (échappées — texte brut), puis le résultat passe par le pipeline MDX sandboxé. Vide, c'est le **rendu par défaut** auto-généré qui s'applique. Un `{champ}` inconnu est refusé à l'enregistrement du formulaire ; une valeur absente rend vide.
_Avoid_: template (réserver au nom de colonne), thème

**EntriesView (`<EntriesView>`)**:
Composant intégré (v0.4) qui affiche les fiches d'un ou plusieurs formulaires selon une **vue de fiches** au choix, avec recherche, filtres, tri et sélection configurés dans sa balise. Toujours interactif (la distinction YesWiki statique/dynamique n'existe pas). Spécification : [`docs/entries-view.md`](docs/entries-view.md).
_Avoid_: bazarliste, une action par forme d'affichage

**Vue de fiches**:
L'une des neuf formes d'affichage d'EntriesView — Liste, Grille, Tableau, Carte, Calendrier, Agenda, Annuaire, Carrousel, Galerie photo — choisie par la prop `view` (sélecteur en tuiles du builder, aperçu en direct). Chaque vue a ses paramètres propres ; zones, filtres, tri et « Lors du clic, afficher la fiche » sont communs.
_Avoid_: template d'affichage, Blocs (ancien nom YesWiki de la Grille), Photobox (ancien nom de la Galerie photo)

**Zone**:
Un emplacement nommé d'une vue de fiches (Titre, Sous-titre, Texte, Pied, Visuel, Légende, Badge) auquel l'auteur associe un champ. Le **Badge** est la petite info mise en avant, posée en surimpression du visuel d'une carte de Grille.
_Avoid_: zone flottante (ancien nom du Badge), displayfields

**Filtre**:
Un champ à options qu'EntriesView expose au **visiteur** pour restreindre les fiches affichées (compteurs par option en direct, bouton « Effacer les filtres » automatique). Choisi, ordonné et titré par l'auteur (« Filtres disponibles »). À distinguer de la **Sélection des fiches**, les restrictions fixées par l'auteur (période, maximum).
_Avoid_: Facette (jargon YesWiki)

**Pseudo-champ**:
Un champ synthétique proposé par EntriesView aux côtés des champs du formulaire : `$form` (le formulaire de la fiche, en multi-formulaires), `$owner`, `$createdAt`, `$editedAt`. Le préfixe `$` interdit toute collision avec un `name` de champ.
_Avoid_: extraFields (jargon YesWiki), champ système

## Portée

**v0.1 (MVP, état actuel)** : CRUD de pages par slug, routing page/handler, handlers `show` et `edit`, rendu MDX, révisions (historique + restauration), pages spéciales de layout, les composants intégrés `<Menu>` et `<Button>`, et un éditeur riche (barre d'outils de formatage markdown, modale de lien, outils contextuels ancrés au curseur ; double-clic sur le contenu d'une page pour passer en édition).

**v0.2** : upload de fichiers (bouton, drag & drop, collage → `Image`, `Pdf` ou `FileLink` selon la famille ; répertoire `files/` faisant foi ; limites et extensions par famille dans la config) et authoring de composants (menu « Composants », ComponentBuilder généré depuis les YAML de `/components/wiki`, sélecteur d'icônes Iconify) pour `Button`, `Image`, `Pdf` et `FileLink` ; la modale de lien wiki devient un ComponentBuilder à sérialisation markdown (`wiki-link.yaml`).

**v0.3** : formulaires & fiches (ADR 0014/0015, spec [`docs/forms.md`](docs/forms.md)) — FormBuilder (pages spéciales `formulaires` et `fiches`), 14 types de champs, saisie via `<EntryForm>`, rendu par défaut + gabarit MDX optionnel, renderer de champs partagé avec le ComponentBuilder, Zod comme contrat runtime, API de redimensionnement d'images. `<EntriesView>` (vues riches des fiches) : v0.4. En cours de route (2026-07-17), colmatage du bac à sable (ADR 0002) : liste blanche de balises HTML, refus de `dangerouslySetInnerHTML` et de `srcDoc`, et composant `<Embed>` à côté du collage d'`<iframe>`. S'y ajoute (grillé le 2026-07-17) « Changer l'adresse » : renommage des slugs de pages et de fiches par réécriture intégrale des références, sans redirection (ADR 0016), avec lint des liens vers pages inexistantes ; les identifiants de formulaires suivent le même geste (« Changer », dans l'en-tête du FormBuilder), et ceux des champs aussi — différé à l'enregistrement du formulaire (ADR 0017) ; l'extension aux fichiers attend leurs tables (backlog).

**v0.4 (en cours)** : `<EntriesView>` (spec grillée le 2026-07-19 : [`docs/entries-view.md`](docs/entries-view.md), ADR 0018/0019) — neuf vues de fiches, filtres/recherche/tri instantanés (chargement complet par Server Action, exécution client), couleur & icône par champ avec palette automatique, popup fiche commune (« Lors du clic »), six nouveaux types de descripteur (`view-picker`, `form-field` à options dépendantes, `field-rows`, mappings, `map-view`), props structurées en expressions littérales JSX. En cours de route (grillé le 2026-07-22), le **titre automatique passe d'un calcul à la lecture à un calcul à l'écriture** (ADR 0020) : il est stocké dans `data` comme toute valeur de champ, recalculé en masse à l'enregistrement du formulaire quand le gabarit change, et garanti non vide par une contrainte en base.

Backlog sans version prévue (mais le domaine doit pouvoir l'accueillir) : droits d'accès et authentification, pages d'administration, recherche/filtre par tags et vues. Détail dans [`docs/architecture.md`](docs/architecture.md).
