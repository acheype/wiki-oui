# Attributs (id, classe…) sur les éléments markdown natifs sous MDX 3 — 2e passe

**Date de vérification : 2026-07-08.** Suite de [`remark-attributes-mdx.md`](./remark-attributes-mdx.md), qui a établi que `remark-attributes` exige des accolades échappées `\{…\}` sous MDX (rédhibitoire pour des auteurs de wiki), que `remark-attr` est mort, et que `remark-directive` — le repli retenu — ne couvre pas les attributs sur les éléments markdown natifs (titre, lien, image, paragraphe).

**Question de cette passe : existe-t-il une solution crédible pour écrire, en MDX, une classe sur un lien markdown et un id sur un titre, sans échappement pénible ?**

## Réponse courte

**Oui : `mdx-annotations` (bradlc / Tailwind Labs).** Au lieu de combattre le parseur d'expressions MDX, il l'exploite : `{{ id: 'ancre' }}` est une expression MDX *valide* (objet JS), donc rien à échapper ; le plugin la retire de l'arbre et la fusionne comme props de l'élément qui précède. Vérifié empiriquement sous `@mdx-js/mdx@3.1.1` et `next-mdx-remote@6.0.0` : id sur titre, classe sur lien, attributs sur image, inline, paragraphe, tableau — tout fonctionne, et il **coexiste avec `remark-directive` + `remark-gfm`** (testé dans les deux ordres de plugins).

Syntaxe auteur retenue :

```markdown
# Titre {{ id: 'mon-ancre' }}

Un paragraphe avec un [lien](/page){{ className: 'btn', target: '_blank' }} dedans.
```

Alternative sérieuse si l'on préfère une syntaxe kramdown : `remark-attribute-list` fonctionne aussi sans échappement (découverte de cette passe), mais avec un mode d'échec plus brutal. `rehype-attr` est éliminé (incompatible MDX, hypothèse confirmée). Docusaurus 3 ne « gère » `{#id}` que par un préprocesseur texte de compatibilité MDX v1 — pas une solution réutilisable.

---

## Environnement de test

Scratchpad `mdxtest/` de la première passe, complété le 2026-07-08. Node 24.12.0, pnpm 11.10.0. Versions exactes : `@mdx-js/mdx@3.1.1`, `next-mdx-remote@6.0.0`, `mdx-annotations@0.1.4`, `remark-attribute-list@0.4.0`, `rehype-attr@4.1.3`, `remark-directive@4.0.0`, `remark-gfm@4.0.1`, `react@19.2.7`, `react-dom@19.2.7`. Scripts : `test-annotations.mjs`, `test-annotations-errors.mjs`, `test-attrlist.mjs`, `test-attrlist2.mjs`, `test-rehype-attr.mjs`, `test-coexist.mjs`, `test-coexist2.mjs`.

## 1. `mdx-annotations` — le candidat retenu

### Identité et mécanisme

- [npm `mdx-annotations`](https://www.npmjs.com/package/mdx-annotations) : version **0.1.4**, publiée le **2023-11-12**, mainteneur unique `bradlc` (Brad Cornes, Tailwind Labs). ~86 000 téléchargements/mois (api.npmjs.org, juin 2026) — utilisé notamment par les templates Tailwind Plus (Syntax, Protocol ; le [billet d'annonce de Protocol](https://tailwindcss.com/blog/2022-12-15-protocol-api-documentation-template) décrit le mécanisme d'annotations).
- README ([github.com/bradlc/mdx-annotations](https://github.com/bradlc/mdx-annotations)) : « Markdoc-style annotations for MDX ». **Trois plugins à utiliser ensemble** — `mdxAnnotations.remark` (remarkPlugins), `mdxAnnotations.rehype` (rehypePlugins), `mdxAnnotations.recma` (recmaPlugins) — recommandés *en premier* dans chaque tableau.
- Mécanisme (source lu, `index.js`, 143 lignes, MIT, dépendances : `acorn`, `estree-util-visit`, `unist-util-visit`) : le plugin remark repère les nœuds `mdxTextExpression` de forme `{{…}}`, les retire de l'arbre et stocke le texte de l'objet dans une prop temporaire `annotation` sur l'élément précédent ; le plugin recma re-parse cet objet avec acorn et le fusionne en **spread dans les props JSX** de l'élément. Le plugin rehype ne sert qu'à remonter l'annotation d'un `<code>` vers son `<pre>`.

### Preuve empirique (rendu réel `evaluate` + `renderToStaticMarkup`)

Entrée :

```markdown
# Titre {{ id: 'mon-ancre' }}

Un paragraphe avec un [lien](/page){{ className: 'btn', target: '_blank' }} dedans.

![logo](/img.png){{ className: 'img-fluide', loading: 'lazy' }}

Un **mot fort**{{ className: 'rouge' }} en ligne.

Paragraphe entier annoté. {{ className: 'note' }}
```

Sortie (`test-annotations.mjs`) :

```html
<h1 id="mon-ancre">Titre</h1>
<p>Un paragraphe avec un <a href="/page" class="btn" target="_blank">lien</a> dedans.</p>
<p><img src="/img.png" alt="logo" class="img-fluide" loading="lazy"/></p>
<p>Un <strong class="rouge">mot fort</strong> en ligne.</p>
<p class="note">Paragraphe entier annoté.</p>
```

**Aucun échappement. Tous les cas de référence passent.**

### Intégration next-mdx-remote 6

`serialize(src, {mdxOptions: {remarkPlugins: […], rehypePlugins: […], recmaPlugins: […]}})` : OK (`test-annotations-errors.mjs`) — next-mdx-remote 6 transmet bien les trois familles de plugins à `@mdx-js/mdx`, et le `compiledSource` contient les props fusionnées (`id: "mon-ancre"`, `className`).

### Cas d'erreur et pièges (testés)

| Cas | Résultat |
|---|---|
| `# Titre {{ id: }}` (objet JS invalide) | **Erreur de compilation de toute la page** : `1:16: Could not parse expression with acorn`. C'est MDX lui-même qui rejette l'expression au parsing, avec ligne:colonne — même mode d'échec que n'importe quelle expression MDX invalide, pas un risque *ajouté* par le plugin. |
| `# Titre {{ data-x: 'a' }}` (clé avec tiret non citée) | Erreur acorn idem — il faut écrire `{{ 'data-x': 'a' }}`. |
| `# Titre {{ id: 'a', }}` (virgule finale) | OK (JS laxiste accepté). |
| `[lien](/p){{ class: 'btn' }}` (`class` au lieu de `className`) | **Rendu correct** (`class="btn"`) mais avertissement React en dev (`Invalid DOM property`). Convention à documenter pour les auteurs : `className`. |
| `[lien](/p) {{ className: 'btn' }}` (espace avant `{{`) | L'annotation s'attache au **paragraphe**, pas au lien (règle README : pas d'espace pour annoter un élément inline). Piège auteur à documenter. |
| Annotation de tableau sur sa propre ligne après le tableau | **Cassé avec les versions actuelles** : la ligne `{{…}}` devient un `mdxFlowExpression` frère du tableau (vérifié dans le mdast) au lieu d'une ligne de tableau, d'où une **erreur à l'exécution** (`Objects are not valid as a React child`) — pas à la compilation. Contournement validé : dernière ligne `| {{ className: 'tableau-large' }} |` → `<table class="tableau-large">`. |

### Coexistence avec `remark-directive` (testé, `test-coexist2.mjs`)

```markdown
# Titre {{ id: 'ancre' }}

:::note{.large}
Un [lien](/page){{ className: 'btn' }} dedans.
:::
```

→ `<h1 id="ancre">…` + `<note class="large"><p>… <a href="/page" class="btn">lien</a> …</p></note>`. **OK dans les deux ordres de plugins** (annotations avant ou après directive). Les deux mécanismes ne se disputent pas la syntaxe : `remark-directive` consomme ses accolades `{…}` accrochées aux directives au niveau micromark, `mdx-annotations` ne touche qu'aux expressions `{{…}}` déjà parsées par MDX.

### Risques

- **Maintenance : le vrai point faible.** Dernière publication et dernier commit **novembre 2023** ; mono-mainteneur ; 24 étoiles ; 1 issue ouverte (mineure, contexte Vue). Mitigation forte : 143 lignes MIT sans dépendance exotique, **vendorables telles quelles dans le repo** si le paquet casse un jour ; et il fonctionne aujourd'hui, prouvé, avec MDX 3.1.1 (sorti bien après le plugin).
- **Pas de types TypeScript** (aucun `.d.ts` dans le paquet) : prévoir une petite déclaration locale.
- Les clés d'annotation sont des **props JSX** (`className`, camelCase), pas des attributs HTML — cohérent avec le reste de MDX, mais à dire aux auteurs.
- Régression tableau ci-dessus (contournement documenté).

## 2. `remark-attribute-list` — l'alternative kramdown, qui marche (surprise)

- [npm `remark-attribute-list`](https://www.npmjs.com/package/remark-attribute-list) : **0.4.0**, publiée **2025-09-15**, 4 mainteneurs (organisation [utelecon](https://github.com/utelecon/remark-attribute-list), université de Tokyo), peerDeps unified 11 / `mdast-util-mdx@^3`. ~550 téléchargements/mois. 0 issue ouverte, dernier push 2025-09-15.
- Syntaxe kramdown ([Attribute List Definitions / Inline Attribute Lists](https://kramdown.gettalong.org/syntax.html#attribute-list-definitions)) : noter le `:` après `{`.

**Résultat empirique inattendu (`test-attrlist.mjs`, `test-attrlist2.mjs`) : fonctionne sous MDX 3 sans aucun échappement** pour les IAL — contrairement à `remark-attributes`. Son extension micromark consomme `{:` avant que le tokenizer d'expressions MDX ne voie l'accolade :

| Cas | Syntaxe | Résultat |
|---|---|---|
| id + classe sur titre (IAL bloc, ligne suivante) | `# Titre` ⏎ `{:#mon-ancre .grande}` | OK → `<h1 id="mon-ancre" class="grande">` |
| classe sur lien (IAL inline collée) | `[GitHub](https://github.com/){:.btn target="_blank"}` | OK → `<a … class="btn" target="_blank">` |
| classe sur image | `![logo](/img.png){:.img-fluide}` | OK |
| classe sur paragraphe | `Un paragraphe.` ⏎ `{:.note}` | OK → `<p class="note">` |
| ordre des plugins | avant ou après `remark-gfm` | OK, insensible |
| **définition nommée (ALD)** `{:outlink:target="blank"}` | l'exemple même du README | **ERREUR** `Could not parse expression with acorn` — la moitié « définitions réutilisables » du plugin est inutilisable sous MDX |
| IAL malformée `{: n'importe quoi}` ou `:` oublié `{#id}` | | **ERREUR acorn** = page entière cassée, message sans rapport avec la vraie faute de frappe |

Verdict : techniquement viable pour les deux cas de référence, syntaxe plus compacte que `mdx-annotations`, maintenance plus récente. Mais : adoption confidentielle (~550 dl/mois), mode d'échec piégeux (toute coquille dans `{:…}` fait retomber l'accolade dans le parseur d'expressions MDX → erreur acorn cryptique pour un auteur), fonctionnalité ALD morte sous MDX, et l'IAL de bloc se met sur la **ligne suivante** du titre (moins naturel que sur la même ligne).

## 3. `rehype-attr` — éliminé (hypothèse confirmée)

- [npm `rehype-attr`](https://www.npmjs.com/package/rehype-attr) : 4.1.3, publiée 2026-03-16, mainteneur `wcjiang` (jaywcjlove) — paquet vivant, mais principe incompatible MDX.
- Test (`test-rehype-attr.mjs`) : `[lien](/page)<!--rehype:class=btn-->` → **erreur de compilation MDX** ``Unexpected character `!` … (note: to create a comment in MDX, use `{/* text */}`)`` — MDX ne supporte pas les commentaires HTML. La variante commentaire MDX `[lien](/page){/*rehype:class=btn*/}` **compile mais est silencieusement ignorée** : les commentaires MDX sont des expressions vides, retirées avant l'arbre hast que le plugin visite. Aucun support de cette variante dans le plugin. **À écarter.**

## 4. Docusaurus 3 et `{#id}` : un préprocesseur texte, pas un plugin

Comment Docusaurus 3 (MDX 3) gère `## Titre {#custom-id}` : **par une passe de préprocessing sur la chaîne source avant compilation MDX**. Source lue le 2026-07-08 : [`packages/docusaurus-mdx-loader/src/preprocessor.ts`](https://github.com/facebook/docusaurus/blob/main/packages/docusaurus-mdx-loader/src/preprocessor.ts) — `if (markdownConfig.mdx1Compat.headingIds) { fileContent = escapeMarkdownHeadingIds(fileContent); }`, la fonction venant de `@docusaurus/utils`. Elle échappe `{#id}` en `\{#id}` par regex, puis leur plugin remark de headings ré-interprète l'échappé. La [doc Docusaurus](https://docusaurus.io/docs/migration/v3) dit explicitement que `{#id}` « n'est plus une syntaxe MDX valide » et n'est gardée que par compatibilité v1 (`mdx1Compat.headingIds`), en attendant une nouvelle syntaxe. Autrement dit : même Docusaurus n'a pas de solution plugin propre — il automatise l'échappement, pour les titres seulement. Non réutilisable comme mécanisme général, et confirme le diagnostic de la première passe (§ 2 : la contrainte vient du parseur MDX).

## 5. Coût d'un plugin maison

Sans objet en pratique : `mdx-annotations` **est** déjà le « mini-plugin idéal » (143 lignes, MIT, trois hooks remark/rehype/recma, zéro dépendance lourde). La stratégie raisonnable n'est pas de le réécrire mais de l'adopter, avec le plan de secours *vendoring* : copier `index.js` dans le repo si le paquet devenait incompatible. Le point d'extension utile côté WikiOui serait plutôt un petit garde-fou (linter de contenu ou message d'erreur amical quand la compilation échoue sur une expression), déjà nécessaire pour MDX en général.

## 6. Recommandation

1. **Adopter `mdx-annotations@0.1.4`** pour les attributs sur éléments markdown natifs. Syntaxe auteur :
   - id sur un titre : `# Titre {{ id: 'mon-ancre' }}`
   - classe sur un lien : `[lien](/page){{ className: 'btn' }}` — **sans espace** avant `{{` pour les éléments inline (lien, image, gras, code).
2. **Le combiner avec `remark-directive`** (recommandation de la première passe, inchangée) : les deux coexistent sans conflit — directives pour les conteneurs/encarts (`:::note{.large}`), annotations pour id/classe/attributs sur titres, liens, images, paragraphes. Câblage next-mdx-remote 6 : `mdxAnnotations.remark` en tête de `remarkPlugins`, `mdxAnnotations.rehype` en tête de `rehypePlugins`, `mdxAnnotations.recma` dans `recmaPlugins`.
3. **Accepter et encadrer les risques** : plugin figé depuis 2023 (mitigé par sa taille vendorable et la preuve de compatibilité MDX 3.1.1), annotation de tableau à réserver à la forme `| {{ … }} |`, convention `className`/camelCase et « pas d'espace en inline » à documenter dans le guide auteur. Une expression invalide casse la compilation de la page avec un message acorn ligne:colonne — comportement MDX standard, à couvrir par l'UX d'erreur de compilation du wiki quoi qu'il arrive.
4. **Plan B** si la syntaxe objet-JS déplaît aux auteurs : `remark-attribute-list@0.4.0` (kramdown `{:#id}` / `{:.btn}`), validé empiriquement sous MDX 3 sans échappement, au prix d'erreurs plus cryptiques en cas de coquille et d'une adoption très faible. `remark-attributes` (échappement `\{…\}`) et `rehype-attr` (incompatible) sont écartés.

## Sources

- Tests empiriques du 2026-07-08 (scratchpad `mdxtest/`, scripts listés en préambule), versions exactes ci-dessus
- [npm mdx-annotations](https://registry.npmjs.org/mdx-annotations) · [github.com/bradlc/mdx-annotations](https://github.com/bradlc/mdx-annotations) (README + `index.js` lu dans `node_modules`) · téléchargements : api.npmjs.org (2026-07-08)
- [tailwindcss.com/blog — Protocol template](https://tailwindcss.com/blog/2022-12-15-protocol-api-documentation-template) (usage des annotations chez Tailwind Labs)
- [npm remark-attribute-list](https://registry.npmjs.org/remark-attribute-list) · [github.com/utelecon/remark-attribute-list](https://github.com/utelecon/remark-attribute-list) · [kramdown.gettalong.org — IAL/ALD](https://kramdown.gettalong.org/syntax.html#attribute-list-definitions)
- [npm rehype-attr](https://registry.npmjs.org/rehype-attr) · [github.com/jaywcjlove/rehype-attr](https://github.com/jaywcjlove/rehype-attr)
- [facebook/docusaurus — preprocessor.ts](https://github.com/facebook/docusaurus/blob/main/packages/docusaurus-mdx-loader/src/preprocessor.ts) · [doc migration v3 / `mdx1Compat`](https://docusaurus.io/docs/migration/v3)
- Première passe : [`remark-attributes-mdx.md`](./remark-attributes-mdx.md)
