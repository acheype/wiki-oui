# WikiOui — Synthèse de conception (MVP)

WikiOui est un moteur de wiki : des sites collaboratifs dont chaque page est écrite en MDX et éditable en ligne. Refonte de YesWiki sur une stack moderne. **L'ergonomie est prioritaire** (composants beaux, fluides, ergonomiques).

Glossaire du domaine : [`../CONTEXT.md`](../CONTEXT.md).

## Stack

Next.js (App Router) · Prisma · PostgreSQL · shadcn/ui · CodeMirror 6 (éditeur) · pipeline MDX (`next-mdx-remote` + `remark-gfm` + `mdx-annotations`) · **pnpm**.

## Périmètre MVP

**Inclus** : CRUD de pages par slug · routing page/handler natif Next · handlers `show`, `edit`, `revisions` · rendu MDX bridé · composants intégrés `<Menu>` (liste imbriquée → menu multi-niveaux, ADR 0010) et `<Button>` · historique (toutes révisions) + diff + restauration · pages spéciales de layout (roue crantée de `page-rapide-haut` vers les pages de configuration du layout) · éditeur riche CodeMirror (barre d'outils markdown, listes de tâches, modale de lien, outils contextuels ancrés au curseur : édition de lien, tableaux) · double-clic sur le contenu pour éditer · tags · suppression dure.

**Backlog** (le domaine les accueille déjà) : upload de fichiers · système d'authoring de composants (menu « Composants », modales générées depuis YAML, sélecteur d'icônes Iconify) · pages d'administration (Tableau de bord, Documentation, Gestion du site, Formulaire — rejoindront le menu roue crantée par édition de `page-rapide-haut`) · droits d'accès & authentification · durcissement du sandbox (neutralisation des expressions JS) · recherche/filtre par tags & vues (agenda, carte, annuaire…) · overlay-modal pour l'historique · table `Settings` éditable à chaud.

## Architecture en un coup d'œil

- **Routing** (ADR 0001) : les handlers sont des routes Next natives. `app/[slug]/page.tsx` = `show` ; `app/[slug]/edit/page.tsx`, `app/[slug]/revisions/page.tsx`. `/` redirige vers `/page-principale` (`redirects()`). Slug : `^[a-z0-9]+(?:-[a-z0-9]+)*$`, minuscules (majuscules redirigées), tapé dans l'URL (pas de titre séparé).
- **Handler vs Mutation** : un handler *affiche* une vue (URL). Sauvegarder / supprimer / restaurer sont des **Server Actions** (pas d'URL).
- **Rendu** (ADR 0002) : MDX bridé. Registre de composants = `/components` + config. `import`/`export` désactivés dès le MVP ; neutralisation des expressions JS ajoutée avec l'auth. Composants intégrés (`<Menu>`, `<Button>`) présents dès le MVP ; l'*authoring* est au backlog. `<Menu>` est piloté par la liste imbriquée écrite entre ses balises (ADR 0010).
- **Éditeur** (ADR 0005) : CodeMirror 6, édition de source MDX colorée. Barre d'outils : gras, italique, barré, titres, listes (puces/numérotée/tâches), citation, code, ligne horizontale, alignement (classe Tailwind), commentaire (`{/* */}`), lien (modale), insertion de tableau, aide-mémoire. Pas de souligné. UI contextuelle **ancrée au curseur** (tooltips CodeMirror) : icône de modification de lien, opérations de tableau positionnées spatialement (colonne en haut, ligne à gauche, reformatage au coin). Double-clic sur le contenu du `show` → édition.
- **Liens** (ADR 0006) : liens wiki en relatif par slug (`[texte](ma-page)`) ; externes en `http(s)://`. Modale de lien : cible onglet courant / nouvel onglet / **fenêtre modale** (Dialog ; avertissement si URL externe). Autocomplétion des pages.
- **Pages spéciales** : slug réservé, seedées, non supprimables mais éditables — les 5 de layout, `page-principale`, `aide-memoire`.
- **Historique** (ADR 0009) : pleine page, timeline horizontale (récente à droite), toutes les révisions. 3 vues : *Aperçu* (checkbox rendu ↔ code), *Modifications* (diff MDX vs précédente), *Différence avec la courante* (diff MDX). Diffs sur le source uniquement.
- **Config** (ADR 0004) : `wiki.config.ts` typé (slugs des pages spéciales, slug d'accueil, plus tard composants/upload).

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

## Points validés avant code

- **`remark-attributes` → remplacé par `mdx-annotations`** (validé le 2026-07-08). `remark-attributes` exige des accolades échappées `\{…\}` sous MDX (contrainte du parseur MDX, rédhibitoire pour les auteurs). `mdx-annotations` (Tailwind Labs) exploite les expressions MDX à la place : `# Titre {{ id: 'ancre' }}`, `[lien](/page){{ className: 'btn' }}` — zéro échappement, vérifié sous MDX 3 / next-mdx-remote 6. Les conteneurs/encarts passent par le registre de composants (ADR 0002), sans `remark-directive` (une seule syntaxe avancée : le JSX ; la directive reste ajoutable plus tard, coexistence prouvée). Preuves : [`research/remark-attributes-mdx.md`](research/remark-attributes-mdx.md), [`research/mdx-native-element-attributes.md`](research/mdx-native-element-attributes.md).
