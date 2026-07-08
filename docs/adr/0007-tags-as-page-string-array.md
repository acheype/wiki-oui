# Tags : `String[]` sur la Page, non historisés, non normalisés

Les mots-clés d'une page sont stockés dans une colonne `tags String[]` (tableau natif Postgres `text[]`) **sur la Page**, ni historisés dans les révisions, ni normalisés dans une table `Tag`.

## Contexte

Les tags sont de la classification, pas du contenu : leur historique n'a pas d'intérêt (on veut « la page est taguée X *maintenant* »). Restaurer une ancienne version du texte ne doit pas modifier les tags → tags sur la Page, pas sur la Révision.

Reste le choix stockage : tableau scalaire vs table `Tag` + jointure `PageTag`. La forme normalisée n'apporte de valeur (renommage global, métadonnées par tag, requêtes de gestion) que quand on construit de vraies fonctionnalités de tags — au backlog. Au MVP, les tags ne font qu'exister et s'afficher.

## Décision

`tags String[]` sur la Page. Autocomplétion via `SELECT DISTINCT unnest(tags) FROM "Page"` (SQL brut Prisma). « Pages ayant le tag X » via `tags @> ARRAY['X']` (`where: { tags: { has } }`, indexable GIN).

## Conséquences

- Code le plus court, pas de jointure à la lecture.
- Renommer un tag globalement = mettre à jour le tableau de chaque page (acceptable tant qu'il n'y a pas d'UI de gestion).
- Migration ultérieure array → `Tag`/`PageTag` simple (`unnest` alimente les tables) le jour où les tags deviennent une entité gérée.
