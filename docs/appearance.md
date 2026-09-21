# Personnalisation visuelle

Ce document regroupe les possibilités de personnalisation de l’apparence d’un site WikiOui. Il couvrira progressivement la palette et les composants shadcn/ui, la typographie et la mise en page.

## Palette

Les couleurs configurables sont les couleurs sémantiques de base définies dans `app/globals.css` (`primary`, `secondary-1`, `secondary-2`, `success`, `info`, `warning`, `destructive`, etc.), avec une valeur pour le thème clair et une pour le thème sombre. Les composants utilisent ces rôles plutôt qu’une couleur concrète.

Les fonds légers, comme ceux des blocs dépliables, sont calculés automatiquement avec `color-mix()` à partir de la couleur sémantique, du fond de page et d’une intensité commune, `--subtle-strength`. Il suffit donc de personnaliser les couleurs de base ; les variantes `*-subtle` suivent la palette sans ajouter de réglages à l’utilisateur.

La surface shadcn/ui `secondary` est elle aussi dérivée de `secondary-1`, avec sa propre intensité technique, afin qu’un seul choix de base alimente à la fois les boutons secondaires et les autres usages sémantiques.

## Typographie

À documenter avec les futures options de personnalisation.

## Mise en page

À documenter avec les futures options de personnalisation.
