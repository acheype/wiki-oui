# Personnalisation visuelle

Ce document regroupe les possibilités de personnalisation de l’apparence d’un site WikiOui. Il couvrira progressivement la palette et les composants shadcn/ui, la typographie et la mise en page.

## Palette

Les couleurs configurables sont les couleurs sémantiques définies dans `app/globals.css` (`primary`, `secondary`, `success`, `info`, `warning`, `destructive`), avec une valeur pour le thème clair et une pour le thème sombre. Les composants utilisent ces rôles plutôt qu’une couleur concrète.

Les fonds légers, comme ceux des blocs dépliables, sont calculés automatiquement avec `color-mix()` à partir de la couleur sémantique, du fond de page et d’une intensité commune, `--subtle-strength`. Il suffit donc de personnaliser les couleurs de base ; les variantes `*-subtle` suivent la palette sans ajouter de réglages à l’utilisateur.

Dans le langage visuel de l’interface, `primary` porte les actions principales ; `secondary` porte la navigation : titre du wiki, liens du contenu et indicateurs de position active. La couleur `secondary` du thème livré est « Prune documentaire » : `oklch(0.48 0.13 325)` en clair et `oklch(0.72 0.11 325)` en sombre.

Les icônes et contours utilisent directement la couleur choisie (`primary`, `secondary`, `success`, `info`, `warning`, `destructive`). Les boutons secondaires portent `secondary` en fond ; `secondary-foreground` reste uniquement la couleur contrastée de leur contenu.

## Thème clair ou sombre

La première entrée de la roue crantée est un sélecteur « Thème sombre ». Le choix est conservé dans le navigateur sous la clé `wikioui-theme` et restauré avant l’affichage de la page. Le thème clair reste le choix initial tant que la personne n’a pas activé le thème sombre.

## Typographie

À documenter avec les futures options de personnalisation.

## Mise en page

À documenter avec les futures options de personnalisation.
