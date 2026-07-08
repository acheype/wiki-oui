# Éditeur : CodeMirror 6 (édition de source MDX), pas de WYSIWYG

L'éditeur de page est **CodeMirror 6** (`@uiw/react-codemirror` + `@codemirror/lang-markdown` + thème accordé à shadcn) : un éditeur de **source MDX** avec coloration syntaxique, raccourcis clavier et barre d'outils custom. On rejette un éditeur WYSIWYG (type MDXEditor).

## Contexte

L'édition est le cœur de WikiOui et l'UX est prioritaire. Deux philosophies : (A) éditeur de source coloré (CodeMirror, successeur d'Ace) ; (B) WYSIWYG MDX (MDXEditor, très abouti visuellement).

Le WYSIWYG entre en conflit avec des décisions déjà figées : il ne préserve pas proprement la syntaxe **remark-attributes** (`{.modal}`, `{target=_blank}`, classes d'alignement), l'édition de composants MDX arbitraires y est fragile (ADR 0002), et l'historique prévoit déjà « Afficher le code Wiki » (le MDX brut est assumé partout). Sur un wiki, les contributeurs écrivent du MDX ; une coloration nette est souvent plus prévisible qu'un WYSIWYG qui reformate.

## Décision

CodeMirror 6, édition de source. La barre d'outils insère du markdown/MDX dans le document. C'est un vrai éditeur (coloration, raccourcis, repli), pas un textarea amélioré.

Barre d'outils MVP : gras, italique, barré, titres (H1–H3), liste à puces, liste numérotée, liste de tâches, citation, code, ligne horizontale, alignement (gauche/centré/droite, via classe Tailwind sur le bloc), commentaire (`{/* … */}`), lien (modale), tableau, et un bouton aide-mémoire ouvrant la page `aide-memoire` dans une modale.

Le souligné est écarté (déconseillé en web, confondu avec un lien). Barré, tableaux et listes de tâches proviennent de `remark-gfm` (MDX ne les a pas nativement).

Édition de tableaux : outils **contextuels** (visibles/actifs seulement quand le curseur est dans un tableau) — insérer, ajouter/supprimer ligne ou colonne, alignement de colonne, reformater les pipes. Tableaux GFM uniquement (pas de fusion de cellules ni de contenu multi-ligne au MVP).

## Conséquences

- Cohérent avec remark-attributes, la whitelist de composants et l'historique en code Wiki.
- Le WYSIWYG reste envisageable très au-dessus (post-MVP) mais impliquerait de rouvrir l'encodage des liens/attributs et le modèle de composants.
