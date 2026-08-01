# Classes utilitaires auteurs = liste blanche safelistée à la build

Les auteurs peuvent styler leur contenu avec des classes Tailwind — via `{{ className: '…' }}` (mdx-annotations, déjà utilisé par l'alignement) et via la prop `className` des composants du registre. Ces classes sont **safelistées explicitement** dans `globals.css` avec `@source inline(...)` (Tailwind v4), famille par famille, et documentées dans l'`aide-memoire`.

## Contexte

Tailwind génère son CSS à la build en scannant les *fichiers sources* ; le contenu des pages vit en **base de données** et n'est jamais scanné. Une classe écrite par un auteur n'existe donc dans le CSS que si elle traîne par hasard dans le code de l'UI — au moment de la décision, `text-center` fonctionnait pour cette raison mais `text-right` n'était généré nulle part : le bouton « Aligner à droite » de la v0.1 était sans effet en build de production.

## Décision

Une **liste blanche d'utilitaires auteurs**, safelistée par familles avec expansion d'accolades, ex. `@source inline("text-{left,center,right,justify}")`. On commence petit (l'alignement + les besoins de la v0.2) et on élargit famille par famille. C'est le même régime que le registre de composants (ADR 0002) : le rendu MDX est bridé par listes blanches, les classes comme les balises.

## Options rejetées

- **Générer tout Tailwind** : des milliers d'utilitaires × variants, valeurs arbitraires (`w-[137px]`) infinies par construction.
- **Compilateur CSS à l'exécution** (Play CDN, twind, UnoCSS runtime) : moteur CSS dans le navigateur, double source de vérité avec le CSS buildé, flash de contenu non stylé, déconseillé en production.
- **Recompiler à la sauvegarde d'une page** : sauvegarder = rebuild, inacceptable pour un wiki.

## Conséquences

- Ce que voit l'auteur est garanti : une classe documentée dans l'aide-mémoire fonctionne, une classe hors liste ne fait rien — au lieu de « tout Tailwind, mais en réalité seulement ce qui traîne dans les sources ».
- Ajouter une famille = éditer `globals.css` (action d'opérateur, pas de contributeur).
- Les valeurs arbitraires Tailwind (`w-[137px]`) restent hors de portée des auteurs ; les besoins dimensionnels passent par des props de composants (ex. largeur d'une image uploadée).
