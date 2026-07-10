# WikiOui

WikiOui est un moteur de wiki : il permet de créer facilement des sites collaboratifs dont chaque page est écrite en MDX et éditable en ligne. Refonte de YesWiki sur une stack moderne (Next.js, Prisma, PostgreSQL, shadcn/ui).

## Language

**Page**:
L'unité de contenu du wiki, identifiée par un slug unique. Son contenu est écrit en MDX. Une page a un historique de révisions. Elle n'a **pas de champ titre distinct** : son titre visible est le premier titre `#` de son contenu. La ligne `Page` n'est créée qu'à la **première sauvegarde** (visiter une page inexistante n'écrit rien).
_Avoid_: Article, document, nœud

**Slug**:
L'identifiant textuel d'une page, et sa seule identité : il est tapé directement dans l'URL (pas généré depuis un titre). Format `^[a-z0-9]+(?:-[a-z0-9]+)*$` (minuscules, chiffres, tirets ; pas de CamelCase à la YesWiki). C'est le niveau 1 de l'URL : `https://site/{slug}`. Les majuscules sont normalisées par redirection (`/Ma-Page` → `/ma-page`) ; un slug hors motif renvoie *not found*.
_Avoid_: Id, nom de page, permalink

**Handler de page**:
Une **vue** d'une page, rendue à une URL de niveau 2 : `https://site/{slug}/{handler}` (ex. `edit`, `revisions`). Un handler de page *affiche* quelque chose à un humain. Implémenté comme un segment de route Next natif : `app/[slug]/{handler}/page.tsx`. Le handler par défaut est `show`, servi par `app/[slug]/page.tsx` ; `/{slug}` est un raccourci de `/{slug}/show`.
_Avoid_: Route, action, contrôleur ; « Route Handler » (jargon Next : désigne un Service d'API, pas un handler de page)

**Mutation**:
Une action qui modifie la base et ne rend **aucune vue** : sauvegarder, supprimer, restaurer. Implémentée comme une **Server Action** (pas d'URL, POST implicite). Tout ce qui est dans la barre d'actions n'est donc pas un handler : `Éditer`/`Historique` sont des handlers de page (vues), `Supprimer`/`Restaurer` sont des mutations. Exceptionnellement, une mutation est **portée par un Service d'API** quand la Server Action ne sait pas transporter l'exigence UX (l'upload et sa progression, ADR 0012).
_Avoid_: Handler (pour une mutation), endpoint

**Service d'API**:
Un endpoint HTTP **programmatique** : consommé par du code (la modale d'aperçu, la balise `<img>` qui charge un fichier), jamais visité comme une page. Implémenté en Route Handler Next (`route.ts`), regroupé sous le segment réservé `/api` : `GET /api/files/{nom}` (servir un fichier), `POST /api/files` (upload — mutation portée par un service), `POST /api/render` (rendu d'un fragment MDX pour l'aperçu du ComponentBuilder). Le triptyque complet : handler de page = vue pour un humain · mutation = écriture · service d'API = service pour du code.
_Avoid_: handler (pour un service) ; réserver un segment d'URL de niveau 1 par service (un seul segment réservé : `api`)

**Révision**:
Un instantané complet du contenu d'une page à un instant donné, avec son auteur et sa date. Chaque sauvegarde qui change le contenu crée une nouvelle révision — enregistrer un contenu identique n'écrit rien ; l'historique est la suite des révisions d'une page. (Les tags ne sont pas historisés : ils vivent sur la Page et se mettent à jour sans révision.)
_Avoid_: Version (comme table), historique (pour une entrée)

**Révision courante**:
La révision actuellement affichée d'une page, désignée explicitement par un pointeur `Page.current` (et non par la date la plus récente). Restaurer une ancienne révision crée une **nouvelle** révision (copie de son contenu, `createdAt` = maintenant) et fait pointer `current` dessus. « Dernière édition » affichée = `current.createdAt`.
_Avoid_: Latest, dernière révision (trompeur : peut être une restauration)

**Composant**:
Un élément riche insérable dans le contenu d'une page (ex. Bouton, Image). Rendu via une syntaxe façon MDX, mais seuls les composants d'une liste blanche sont autorisés (voir Registre de composants). Les composants intégrés sont rendus dès le MVP ; l'*authoring* (menu « Composants », ComponentBuilder) arrive en v0.2.
_Avoid_: Widget, plugin, action

**Registre de composants**:
La liste blanche des composants autorisés au rendu, construite automatiquement à partir du répertoire `/components/wiki` plus ceux déclarés dans le fichier de configuration. Une balise hors registre n'est pas rendue. La présence d'un descripteur co-localisé (`button.yaml`) est un fait indépendant : il pilote le menu « Composants » de l'éditeur et la génération du ComponentBuilder, pas l'autorisation de rendu.

**Page spéciale**:
Une page à **slug réservé**, créée au seed de la base, **non supprimable mais éditable** (comme n'importe quelle page : flux d'édition normal, rendu MDX normal). C'est le seul trait qui la définit ; « alimenter le layout » n'est qu'une propriété de certaines d'entre elles. Les pages spéciales : les 5 pages de layout (`page-titre`, `page-menu-haut`, `page-rapide-haut`, `page-header`, `page-footer`), `page-principale` (l'accueil, cible de la redirection `/` → `/page-principale` ; contenu ordinaire), et `aide-memoire`. Le menu n'a pas de rendu spécial : le contenu par défaut de `page-menu-haut` appelle le composant intégré `<Menu>`, et celui de `page-rapide-haut` expose les 5 pages de layout derrière un bouton roue crantée (`<Menu>` + `<Button>`).
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

**Composant intégré (built-in)**:
Un composant livré avec WikiOui (`<Menu>`, `<Button>`), présent dans le registre dès le MVP car le rendu (notamment du layout) en dépend. À distinguer de l'*authoring* de composants (menu « Composants » de la barre d'outils, ComponentBuilder, sélecteur d'icônes Iconify) qui, lui, arrive en v0.2. Rendre un composant ≠ fournir l'UI pour l'insérer.

**ComponentBuilder**:
L'interface de paramétrage **autogénérée** d'un composant : une modale construite en lisant le composant plus son descripteur YAML co-localisé dans `/components/wiki` (ex. `button.yaml` ; spécification du YAML : [`docs/reference/yeswiki-actions-builder.md`](docs/reference/yeswiki-actions-builder.md)). L'aperçu du rendu est affiché en haut, les champs générés en dessous (les champs `advanced` derrière « paramètres avancés »). Ouvert depuis le menu « Composants » de l'éditeur — sauf pour le lien wiki : son ComponentBuilder (descripteur `wiki-link.yaml`) émet un lien markdown plutôt qu'une balise de composant, et s'ouvre depuis le bouton « Ajouter un lien » de la barre d'outils et le bouton flottant d'édition de lien ancré au curseur. Tout builder **insère et réédite** (y compris une occurrence écrite à la main). Prévu en v0.2 ; couvre `Button`, `Image`, `Pdf` et `FileLink`.
_Avoid_: modale codée à la main (c'est celle du MVP pour le lien), formulaire spécifique par composant

**Menu**:
Composant intégré qui transforme la liste imbriquée écrite entre ses balises en menu de navigation multi-niveaux : niveau 1 en barre horizontale, sous-items en déroulant (l'imbrication au-delà du niveau 2 est aplatie, indentée dans le même déroulant). Un item est au choix un texte (simple déclencheur), un lien (navigue au clic, déroulant au survol/focus) ou un `<Button>`. Sans contenu il ne rend rien : un menu est toujours écrit par l'auteur, jamais déduit de la base (ADR 0010).
_Avoid_: auto-listing des pages, barre de navigation codée en dur

**Bouton (`<Button>`)**:
Composant intégré affichant un bouton défini par une icône (`icon`, dont la valeur est un nom français d'une liste blanche), un libellé (`text`) et éventuellement un lien (`link`). Dans le contenu d'une page il prend l'apparence d'un bouton pleine forme ; dans un slot du bandeau, celle d'un bouton discret de barre de navigation — la différence est purement CSS. Utilisé comme item parent d'un `<Menu>`, il en devient le déclencheur (ex. la roue crantée de `page-rapide-haut`). Son interface graphique de configuration (ComponentBuilder) arrive en v0.2.
_Avoid_: bouton d'action serveur (il ne déclenche pas de mutation)

## Portée

**v0.1 (MVP, état actuel)** : CRUD de pages par slug, routing page/handler, handlers `show` et `edit`, rendu MDX, révisions (historique + restauration), pages spéciales de layout, les composants intégrés `<Menu>` et `<Button>`, et un éditeur riche (barre d'outils de formatage markdown, modale de lien, outils contextuels ancrés au curseur ; double-clic sur le contenu d'une page pour passer en édition).

**v0.2** : upload de fichiers (bouton, drag & drop, collage → `Image`, `Pdf` ou `FileLink` selon la famille ; répertoire `files/` faisant foi ; limites et extensions par famille dans la config) et authoring de composants (menu « Composants », ComponentBuilder généré depuis les YAML de `/components/wiki`, sélecteur d'icônes Iconify) pour `Button`, `Image`, `Pdf` et `FileLink` ; la modale de lien wiki devient un ComponentBuilder à sérialisation markdown (`wiki-link.yaml`).

Backlog sans version prévue (mais le domaine doit pouvoir l'accueillir) : droits d'accès et authentification, pages d'administration, recherche/filtre par tags et vues. Détail dans [`docs/architecture.md`](docs/architecture.md).
