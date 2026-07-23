# Les handlers sont des routes Next.js natives

Un handler (`show`, `edit`, `revisions`…) est le niveau 2 de l'URL d'une page : `/{slug}/{handler}`. Nous les implémentons comme des segments de route App Router natifs (`app/[slug]/page.tsx` pour `show`, `app/[slug]/edit/page.tsx`, etc.) plutôt que via un aiguilleur custom qui dispatcherait vers un répertoire `handlers/`.

## Contexte

La spec initiale (héritée de YesWiki) décrivait les handlers comme des fichiers déposés dans un répertoire `handlers/` (ex. `handlers/edit.tsx`), résolus à l'exécution par un dispatcher. Deux options étaient sur la table : (1) un aiguilleur `app/[slug]/[[...handler]]/page.tsx` + registre pointant vers `handlers/*`, ou (2) le routing de fichiers natif de Next.

## Décision

Option (2), 100 % natif Next. On abandonne le répertoire `handlers/` : le chemin du fichier sous `app/` **est** l'URL, donc chaque handler vit dans son propre dossier (`app/[slug]/{handler}/`). Le chargement de la page et la gestion de « page inexistante » sont factorisés dans un helper partagé (ex. `getPage(slug)`) appelé par chaque handler.

## Conséquences

- Pas d'indirection ni de registre custom à maintenir ; on suit les idiomes Next (SEO, `not-found`, liens actifs, `loading`/`error` par segment).
- Ajouter un handler = créer un dossier + `page.tsx` (pas un fichier libre dans `handlers/`).
- L'équivalence `/{slug}/show` ≡ `/{slug}` n'est pas gratuite : `/{slug}` est servi par `app/[slug]/page.tsx` ; on ne crée pas de segment `show/` (l'URL `/{slug}/show` redirige vers `/{slug}` ou renvoie 404, à décider).
- Un handler qui doit être **sans chrome** ne peut pas vivre sous le groupe `(site)` (dont le layout porte le chrome, qu'un layout enfant ne retire pas). Il va dans un **groupe frère `(bare)`** : `app/(bare)/[slug]/iframe/page.tsx` sert `/{slug}/iframe` sans conflit avec `(site)/[slug]` (chemins distincts). C'est le cas du handler `iframe` (ADR 0022).
