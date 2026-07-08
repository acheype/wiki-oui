# WikiOui

WikiOui est un moteur de wiki : il permet de créer facilement des sites collaboratifs dont chaque page est écrite en MDX et éditable en ligne. Refonte de YesWiki sur une stack moderne (Next.js, Prisma, PostgreSQL, shadcn/ui).

## Language

**Page**:
L'unité de contenu du wiki, identifiée par un slug unique. Son contenu est écrit en MDX. Une page a un historique de révisions. Elle n'a **pas de champ titre distinct** : son titre visible est le premier titre `#` de son contenu. La ligne `Page` n'est créée qu'à la **première sauvegarde** (visiter une page inexistante n'écrit rien).
_Avoid_: Article, document, nœud

**Slug**:
L'identifiant textuel d'une page, et sa seule identité : il est tapé directement dans l'URL (pas généré depuis un titre). Format `^[a-z0-9]+(?:-[a-z0-9]+)*$` (minuscules, chiffres, tirets ; pas de CamelCase à la YesWiki). C'est le niveau 1 de l'URL : `https://site/{slug}`. Les majuscules sont normalisées par redirection (`/Ma-Page` → `/ma-page`) ; un slug hors motif renvoie *not found*.
_Avoid_: Id, nom de page, permalink

**Handler**:
Une **vue** rendue à une URL de niveau 2 : `https://site/{slug}/{handler}` (ex. `edit`, `revisions`). Un handler *affiche* quelque chose. Implémenté comme un segment de route Next natif : `app/[slug]/{handler}/page.tsx`. Le handler par défaut est `show`, servi par `app/[slug]/page.tsx` ; `/{slug}` est un raccourci de `/{slug}/show`.
_Avoid_: Route, action, contrôleur

**Mutation**:
Une action qui modifie la base et ne rend **aucune vue** : sauvegarder, supprimer, restaurer. Implémentée comme une **Server Action** (pas d'URL, POST implicite), pas comme un handler. Tout ce qui est dans la barre d'actions n'est donc pas un handler : `Éditer`/`Historique` sont des handlers (vues), `Supprimer`/`Restaurer` sont des mutations.
_Avoid_: Handler (pour une mutation), endpoint

**Révision**:
Un instantané complet du contenu d'une page à un instant donné, avec son auteur et sa date. Chaque sauvegarde crée une nouvelle révision ; l'historique est la suite des révisions d'une page. (Les tags ne sont pas historisés : ils vivent sur la Page.)
_Avoid_: Version (comme table), historique (pour une entrée)

**Révision courante**:
La révision actuellement affichée d'une page, désignée explicitement par un pointeur `Page.current` (et non par la date la plus récente). Restaurer une ancienne révision crée une **nouvelle** révision (copie de son contenu, `createdAt` = maintenant) et fait pointer `current` dessus. « Dernière édition » affichée = `current.createdAt`.
_Avoid_: Latest, dernière révision (trompeur : peut être une restauration)

**Composant**:
Un élément riche insérable dans le contenu d'une page (ex. Bouton, Image). Rendu via une syntaxe façon MDX, mais seuls les composants d'une liste blanche sont autorisés (voir Registre de composants). Reporté au backlog pour le MVP, mais le pipeline de rendu le prévoit.
_Avoid_: Widget, plugin, action

**Registre de composants**:
La liste blanche des composants autorisés au rendu, construite automatiquement à partir du répertoire `/components` plus ceux déclarés dans le fichier de configuration. Une balise hors registre n'est pas rendue.

**Page spéciale**:
Une page à **slug réservé**, créée au seed de la base, **non supprimable mais éditable** (comme n'importe quelle page : flux d'édition normal, rendu MDX normal). C'est le seul trait qui la définit ; « alimenter le layout » n'est qu'une propriété de certaines d'entre elles. Les pages spéciales : les 5 pages de layout (`page-titre`, `page-menu-haut`, `page-rapide-haut`, `page-header`, `page-footer`), `page-principale` (l'accueil, cible de la redirection `/` → `/page-principale` ; contenu ordinaire), et `aide-memoire`. Le menu n'a pas de rendu spécial : le contenu par défaut de `page-menu-haut` appelle le composant intégré `<Menu>`.
_Avoid_: Page seedée, template, page système, fragment

**Lien wiki**:
Un lien interne vers une autre page, écrit en relatif par son slug (`[texte](ma-page)`), jamais avec le domaine. Distinct d'un lien externe (`http(s)://…`). Voir ADR 0006.
_Avoid_: Lien interne absolu, permalien

**Aide-mémoire**:
La page spéciale `aide-memoire` qui résume toutes les syntaxes MDX supportées dans WikiOui. Ouverte dans une modale depuis la barre d'outils de l'éditeur ; c'est une page, pas un écran codé en dur.

**Commentaire**:
Un fragment de contenu non rendu par `show`, écrit avec la syntaxe de commentaire MDX `{/* … */}`. Visible dans l'éditeur et dans « Afficher le code Wiki », absent du rendu.

**Composant intégré (built-in)**:
Un composant livré avec WikiOui (ex. `<Menu>`), présent dans le registre dès le MVP car le rendu (notamment du layout) en dépend. À distinguer de l'*authoring* de composants (menu « Composants » de la barre d'outils, modales YAML, sélecteur d'icônes) qui, lui, est au backlog. Rendre un composant ≠ fournir l'UI pour l'insérer.

## Portée (MVP)

Le MVP couvre : CRUD de pages par slug, routing page/handler, handlers `show` et `edit`, rendu MDX, révisions (historique + restauration), pages spéciales de layout, et un éditeur riche (barre d'outils de formatage markdown + modale d'insertion de lien).

Reporté au backlog (mais le domaine doit pouvoir l'accueillir) : upload de fichiers, système de composants MDX + modales générées depuis YAML, sélecteur d'icônes Iconify, droits d'accès et authentification.
