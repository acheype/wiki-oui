# Historique (handler `revisions`) : pleine page, diffs sur le source MDX

Le handler `revisions` est une **pleine page** (grand panneau) avec une **timeline horizontale** (révision la plus récente à droite). Toutes les révisions sont conservées et affichées (pas de limite ni d'élagage). Les diffs se font sur le **source MDX**, pas sur le rendu.

## Contexte

La spec décrivait une modale avec deux vues (« Aperçu de la version », « Modifications apportées ») et une checkbox « Afficher le code Wiki » agissant sur les deux — impliquant un diff *rendu* (surlignage vert / barré dans la page rendue). Or differ du HTML/MDX rendu (avec composants) est fragile et imparfait.

## Décision

- **Présentation** : pleine page (l'overlay-modal via intercepting routes est une amélioration post-MVP), timeline horizontale, plus récente à droite.
- **Conservation** : on garde et affiche **toutes** les révisions. Pas de réglage `revisionsToShow`, pas d'élagage (le texte ne pèse rien ; élaguer casserait diff/restauration).
- **Trois vues** :
  - *Aperçu de la version* — la page telle qu'elle était ; seule vue avec la checkbox « Afficher le code Wiki » (bascule rendu ↔ MDX brut).
  - *Modifications apportées* — diff mot-à-mot sur le MDX, par rapport à la **révision précédente**.
  - *Différence avec la version courante* — diff mot-à-mot sur le MDX, par rapport à la **révision courante**.
- Les deux vues de diff n'existent qu'en **source** (pas de diff rendu).
- **Restaurer** : visible seulement si la révision sélectionnée n'est pas la courante → Server Action (cf. ADR 0003).

## Conséquences

- Écart assumé à la spec : pas de diff sur la page rendue (case « Modifications + rendu » abandonnée) ; diff toujours lisible et robuste sur le texte MDX.
- `wiki.config.ts` n'a plus de réglage de nombre de révisions.
