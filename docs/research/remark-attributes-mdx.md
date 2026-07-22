# `remark-attributes` × MDX 3 / next-mdx-remote — compatibilité et repli

**Date de vérification : 2026-07-08.** Question posée par `docs/architecture.md` § « À valider avant code » : *« `remark-attributes` : vérifier la compatibilité avec MDX récent (lib peu maintenue) ; repli possible `remark-directive`. »*

## Réponse courte

**Oui, `remark-attributes` (0.4.4) est techniquement compatible avec MDX 3 et next-mdx-remote 6 — vérifié empiriquement — mais à deux conditions qui coûtent cher :**

1. il faut passer l'option `{ mdx: true }` au plugin ;
2. **l'auteur doit échapper toutes les accolades** : `# Titre\{#id .classe\}` au lieu de `# Titre{#id .classe}`. Sans échappement, la compilation MDX **échoue** (`Could not parse expression with acorn`) — ce n'est pas le plugin qui casse, c'est le parseur MDX qui réserve `{…}` aux expressions JS avant même que le plugin ne voie le texte.

**Recommandation : basculer sur `remark-directive`** (maintenu par le collectif unified, fonctionne sous MDX 3 sans échappement — vérifié empiriquement), complété par le registre de composants JSX déjà prévu (ADR 0002) pour les cas ponctuels. `remark-attributes` reste un plan B prouvé si les attributs sur éléments markdown natifs deviennent indispensables, en acceptant l'échappement `\{…\}` et le risque de maintenance (plugin mono-mainteneur, marqué « work in progress » par son propre README).

> **Mise à jour (2e passe, 2026-07-08)** : la question des attributs sur éléments natifs (id sur titre, classe sur lien) a été rouverte et **résolue sans échappement** via `mdx-annotations` (syntaxe `# Titre {{ id: 'ancre' }}`), qui coexiste avec `remark-directive`. Voir [`mdx-native-element-attributes.md`](./mdx-native-element-attributes.md) — le § 6 ci-dessous reste valable pour tout le reste.

---

## 1. Identification des paquets candidats

Source : registre npm (`https://registry.npmjs.org/<paquet>`), consulté le 2026-07-08.

| Paquet | Dernière version | Publiée le | Stack ciblée | Verdict |
| --- | --- | --- | --- | --- |
| [`remark-attributes`](https://www.npmjs.com/package/remark-attributes) | 0.4.4 | 2026-05-29 | unified 11, mdast-util-from-markdown 2, micromark-util-symbol 2 — **stack actuelle** | Candidat principal |
| [`remark-attr`](https://www.npmjs.com/package/remark-attr) | 0.11.1 | **2020-05-08** | ancien parseur (dépend de `remark-footnotes@^1`, ère remark ≤ 12) | **Mort pour remark ≥ 13** |
| [`remark-attribute-list`](https://www.npmjs.com/package/remark-attribute-list) | 0.4.0 | 2025-09-15 | micromark 2 / unified 11, peerDep `mdast-util-mdx@^3` | Candidat secondaire (syntaxe kramdown `{:…}`) |
| [`remark-directive`](https://www.npmjs.com/package/remark-directive) | 4.0.0 | 2025-02-27 | mdast-util-directive 3, micromark-extension-directive 4, unified 11 | Repli recommandé |

### `remark-attr` : confirmé bloqué sur remark ≤ 12

- Dernière publication mai 2020, soit **avant** remark 13 (réécriture micromark, octobre 2020) ; ses dépendances (`remark-footnotes@^1.0.0`, `is-whitespace-character`) datent de l'ancien parseur ([npm](https://www.npmjs.com/package/remark-attr)).
- L'issue [arobase-che/remark-attr#22 « remark@next (13) »](https://github.com/arobase-che/remark-attr/issues/22), ouverte par **wooorm** (mainteneur d'unified/remark) le 2020-10-03, est **toujours ouverte** au 2026-07-08. D'autres issues récentes confirment la casse sur les stacks modernes (ex. [#37 « Doesn't work with Astro »](https://github.com/arobase-che/remark-attr/issues/37), sept. 2025). À écarter définitivement.

### `remark-attributes` : architecture moderne, maintenance fragile

- Mécanisme vérifié dans le source installé (`node_modules/remark-attributes/dist/index.js`) : c'est une **vraie extension de syntaxe micromark** + extension `fromMarkdown` (même architecture que `remark-gfm`), pas un hack de re-parsing. L'option `mdx: true` bascule simplement le tokenizer sur les accolades **échappées** (`micromarkAttributes({ escaped: settings.mdx })`).
- README ([github.com/manuelmeister/remark-attributes](https://github.com/manuelmeister/remark-attributes)) : avertissement explicite *« This plugin is a work in progress. It may have bugs, breaking changes and is not fully compatible with markdown-it-attrs »* ; le mode MDX y est documenté (accolades à échapper).
- Issues ouvertes : [#1 « Fix plugin to provide full markdown-it-attrs support »](https://github.com/manuelmeister/remark-attributes/issues/1) (par le mainteneur lui-même, 2023, toujours ouverte) et [#10 « Assertion: expected last token to be open »](https://github.com/manuelmeister/remark-attributes/issues/10) (avr. 2025, assertion micromark qui saute en mode développement, **sans réponse du mainteneur**). Mono-mainteneur, versions 0.x.

## 2. La contrainte vient de MDX lui-même, pas du plugin

Doc officielle MDX, [« What is MDX? » § Markdown](https://mdxjs.com/docs/what-is-mdx/#markdown) : *« Unescaped left angle bracket / less than (`<`) and left curly brace (`{`) have to be escaped: `\<` or `\{` »*. Toute accolade ouvrante démarre une expression JS pour le parseur MDX ; c'est pour cela qu'aucun plugin ne peut offrir la syntaxe `{.classe}` nue sous MDX. La doc [« Extending MDX »](https://mdxjs.com/docs/extending-mdx/) confirme que les plugins remark génériques (remark-gfm…) fonctionnent, et liste les **directives** parmi les plugins compatibles MDX.

## 3. next-mdx-remote : versions

[`next-mdx-remote` 6.0.0](https://www.npmjs.com/package/next-mdx-remote) (publiée 2026-02-12) dépend de `@mdx-js/mdx@^3.0.1` et `@mdx-js/react@^3.0.1` (registre npm, 2026-07-08) — donc MDX 3. Les `remarkPlugins` sont passés tels quels au compilateur MDX : tout ce qui vaut pour `@mdx-js/mdx` 3 vaut pour next-mdx-remote 6.

## 4. Preuve empirique (test scratch, 2026-07-08)

Environnement : Node 24.12.0, pnpm 11.10.0. Versions **exactes** installées : `@mdx-js/mdx@3.1.1`, `next-mdx-remote@6.0.0`, `remark-attributes@0.4.4`, `remark-directive@4.0.0`, `remark-gfm@4.0.1`, `react@19.2.7`, `react-dom@19.2.7`, `unist-util-visit@5.1.0`, `hastscript@9.0.1`.

### 4a. `remark-attributes` via `compile()` de `@mdx-js/mdx`

| Cas | Résultat |
| --- | --- |
| `# Titre{#mon-id .grande}` — sans option | **ERREUR** `Could not parse expression with acorn` |
| idem avec `{mdx: true}` | **ERREUR** identique (l'échappement reste requis) |
| `# Titre\{#mon-id .grande\}` avec `{mdx: true}` | **OK** — compile en `_jsx(_components.h1, {id: "mon-id", className: "grande", …})` |
| `# Titre\{#mon-id .grande\}` sans option | Compile, mais attributs **ignorés** (texte échappé rendu tel quel) |

### 4b. Rendu HTML réel (`evaluate` + `renderToStaticMarkup`), `{mdx: true}` + accolades échappées

Entrée : titre, lien `[lien](/page)\{target=_blank .btn\}`, liste suivie de `\{.ma-liste\}`. Sortie :

```html
<h1 id="mon-id" class="grande">Titre</h1>
<p>Un paragraphe avec un <a href="/page" target="_blank" class="btn">lien</a> et du <strong>gras</strong>.</p>
<ul><li>item un</li><li class="ma-liste">item deux</li></ul>
```

Attributs appliqués correctement sur titre et lien. **Bug de sémantique constaté** : `\{.ma-liste\}` après une liste s'attache au **dernier `<li>`**, pas au `<ul>` (markdown-it-attrs l'attache à la liste) — illustration concrète de l'issue #1 « pas totalement compatible markdown-it-attrs ».

### 4c. `remark-attributes` via `next-mdx-remote/serialize`

`serialize(src, {mdxOptions: {remarkPlugins: [remarkGfm, [remarkAttributes, {mdx: true}]]}})` : OK, le `compiledSource` contient bien `"mon-id"`, `"grande"`, `"_blank"`.

### 4d. Repli `remark-directive` sous MDX 3

Avec le transformateur générique du [README de remark-directive](https://github.com/remarkjs/remark-directive) (visite des nœuds `*Directive` → `hName`/`hProperties` via hastscript) :

Entrée :

```markdown
:::div{#mon-id .grande}
Contenu de la boite
:::

Un mot :span[important]{.rouge} dans une phrase.
```

Sortie :

```html
<div id="mon-id" class="grande"><p>Contenu de la boite</p></div>
<p>Un mot <span class="rouge">important</span> dans une phrase.</p>
```

**Point clé : aucun échappement nécessaire.** Les accolades d'attributs de directive sont consommées par l'extension micromark de la directive avant que le parseur d'expressions MDX ne les voie. Syntaxe `{#id .classe clé=val}` identique à celle visée, mais uniquement accrochée à une directive (`:::nom{…}`, `::nom{…}`, `:nom[texte]{…}`).

## 5. Impact syntaxe pour l'auteur de pages wiki

| Besoin | `remark-attributes` (mdx:true) | `remark-directive` | JSX pur (MDX natif) |
| --- | --- | --- | --- |
| Classe/id sur un titre existant | `# Titre\{#id .grande\}` | impossible directement (il faudrait `:::` autour, ou un plugin maison) | `<h1 id="id" className="grande">Titre</h1>` |
| Lien stylé | `[lien](/p)\{.btn target=_blank\}` | `:a[lien]{href=/p .btn target=_blank}` (lourd) | `<a href="/p" className="btn">lien</a>` |
| Span/mot stylé | `mot\{.rouge\}` (porte sur le nœud précédent) | `:span[mot]{.rouge}` | `<span className="rouge">mot</span>` |
| Bloc/encart (note, warning…) | non couvert (pas de conteneur) | `:::note{.large}` … `:::` — **cas d'usage idéal** | `<Note large>…</Note>` via le registre (ADR 0002) |
| Coût cognitif | échappement `\{ \}` systématique : contre-intuitif, source d'erreurs silencieuses (attributs ignorés si on oublie `mdx:true`) ou d'erreurs de compilation (si accolade nue) | syntaxe nouvelle mais cohérente, sans échappement ; standard de fait de l'écosystème (proposée pour CommonMark, [talk.commonmark.org « Generic directives »](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444)) | déjà du MDX ; verbeux mais zéro plugin |

## 6. Conclusion et recommandation

1. **Compatibilité : oui.** `remark-attributes@0.4.4` fonctionne avec `@mdx-js/mdx@3.1.1` et `next-mdx-remote@6.0.0` (preuves § 4a–4c), contrairement à `remark-attr` qui est bien mort sur remark ≥ 13 (§ 1).
2. **Mais le coût auteur est réel** : accolades échappées `\{…\}` obligatoires (contrainte du parseur MDX lui-même, § 2 — aucun plugin ne peut la lever), plugin 0.x mono-mainteneur auto-déclaré « work in progress », avec au moins un écart de sémantique constaté (attribut de liste → dernier `<li>`, § 4b).
3. **Recommandation : `remark-directive` comme mécanisme principal** (encarts, conteneurs, spans stylés — sans échappement, plugin du collectif unified publié en 2025), **plus le registre de composants JSX** (ADR 0002) pour les besoins riches. Renoncer aux attributs sur éléments markdown natifs (`# Titre{.x}`) : sous MDX, cette syntaxe n'existe proprement dans aucun plugin sans échappement. Si ce besoin devient bloquant, `remark-attributes` + `mdx:true` est le plan B validé.

## Sources

- npm registry : [remark-attributes](https://registry.npmjs.org/remark-attributes), [remark-attr](https://registry.npmjs.org/remark-attr), [remark-attribute-list](https://registry.npmjs.org/remark-attribute-list), [remark-directive](https://registry.npmjs.org/remark-directive), [next-mdx-remote](https://registry.npmjs.org/next-mdx-remote) (consultés le 2026-07-08)
- [github.com/manuelmeister/remark-attributes](https://github.com/manuelmeister/remark-attributes) — README (option `mdx`, avertissement WIP), [issue #1](https://github.com/manuelmeister/remark-attributes/issues/1), [issue #10](https://github.com/manuelmeister/remark-attributes/issues/10), et code installé `remark-attributes@0.4.4/dist/index.js`
- [arobase-che/remark-attr issue #22](https://github.com/arobase-che/remark-attr/issues/22) (wooorm, 2020, ouverte)
- [mdxjs.com/docs/what-is-mdx/#markdown](https://mdxjs.com/docs/what-is-mdx/#markdown) — échappement obligatoire de `{` ; [mdxjs.com/docs/extending-mdx](https://mdxjs.com/docs/extending-mdx/)
- [github.com/remarkjs/remark-directive](https://github.com/remarkjs/remark-directive) — README et transformateur générique
- [github.com/utelecon/remark-attribute-list](https://github.com/utelecon/remark-attribute-list) — syntaxe kramdown `{:…}`
- Tests empiriques du 2026-07-08 (scratchpad `mdxtest/`, scripts `test-attrs.mjs`, `test-render.mjs`, `test-nmr.mjs`, `test-directive.mjs`), versions exactes en § 4
