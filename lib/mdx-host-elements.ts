import { SKIP, visit } from "unist-util-visit";

// Which HTML tags an author may write in a page (ADR 0002). The registry has
// always gated capitalized tags; lowercase ones went straight to React, so
// `<script src>` and `<iframe srcdoc>` reached every reader — both verified
// running in a browser before this list existed.
//
// It gates only what an author *types*. Markdown's own output — a table, a
// list, a task-list checkbox — is built from mdast nodes that never take the
// JSX path, so it is untouched by this rule.
//
// The list is what marks up prose. Out is anything that loads a subresource,
// executes, collects input, or reaches outside the page: script, style,
// iframe, object, embed, form and their kin. That makes the rule an allowlist
// like the registry (ADR 0002) and the class safelist (ADR 0011) — a tag
// nobody thought about is refused, rather than waiting to be denied.
//
// Embedding a third-party page keeps its use case through <Embed>, which can
// force sandbox, https and a title where a raw <iframe> cannot.
export const WIKI_HOST_ELEMENTS: ReadonlySet<string> = new Set([
  // Flow and sectioning
  "div", "span", "section", "article", "aside", "header", "footer", "nav",
  "figure", "figcaption", "details", "summary", "hr", "br",
  // Prose
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
  "em", "strong", "b", "i", "u", "s", "del", "ins", "mark", "small",
  "sub", "sup", "kbd", "samp", "var", "abbr", "cite", "q", "dfn", "time",
  // Lists
  "ul", "ol", "li", "dl", "dt", "dd",
  // Tables
  "table", "caption", "colgroup", "col", "thead", "tbody", "tfoot",
  "tr", "th", "td",
  // Links and images: markdown writes these anyway, gating them here would
  // only push authors back to `[…](…)` for the same result.
  "a", "img", "picture", "source",
  // iframe is in because embedding another site is not typed, it is *pasted*:
  // YouTube, OpenStreetMap and umap all hand out a ready-made snippet, and
  // refusing the tag would break that gesture for no security gain. The tag's
  // whole risk is `srcdoc`, refused by name in mdx-literal-props.ts; a
  // cross-origin `src` is walled off by the same-origin policy. <Embed> covers
  // the other gesture — no snippet in hand, just a URL — and adds sandbox,
  // https and a title, which a pasted tag cannot be made to carry.
  "iframe",
]);

/** JSX reads a lowercase tag as an HTML element, a capitalized one as a component. */
export function isHostElement(name: string): boolean {
  return /^[a-z]/.test(name);
}

/** True for a tag an author may write; false is what the sandbox drops. */
export function isAllowedHostElement(name: string): boolean {
  return WIKI_HOST_ELEMENTS.has(name);
}

// Drops refused tags, children and all — a <script> without its body is still
// a <script>. Silent here, like the rest of the sandbox: the author is told at
// save time instead (lib/page-lint.ts), the only moment a page has an author.
export function allowListedHostElementsOnly() {
  return function hostElementSandbox() {
    return (tree: unknown) => {
      visit(tree as never, (rawNode, index, rawParent) => {
        const node = rawNode as MdxNode;
        const parent = rawParent as MdxNode | undefined;
        if (
          node.type !== "mdxJsxFlowElement" &&
          node.type !== "mdxJsxTextElement"
        ) {
          return;
        }
        // A null name is a fragment (<>…</>); a capitalized one is a
        // component, which the registry gates instead (lib/mdx.tsx).
        const name = node.name;
        if (!name || !isHostElement(name)) return;
        if (isAllowedHostElement(name)) return;
        if (parent && typeof index === "number") {
          parent.children?.splice(index, 1);
          return [SKIP, index];
        }
      });
    };
  };
}

// HTML attribute names as pasted, mapped to the JSX names React answers to.
//
// MDX reads pasted HTML as JSX, where attribute names are React's own. That
// mostly goes unnoticed: React writes through any unknown attribute holding a
// *string*, which is why `frameborder="0"`, `referrerpolicy` and even `class`
// survive untouched. But a **bare** attribute is JSX's `{true}`, and React
// drops an unknown attribute holding a boolean rather than write it.
//
// So the mismatch only bites on boolean attributes whose React spelling
// differs from HTML's — and on the tags we allow, that is exactly one:
// `allowfullscreen`, carried by every YouTube embed snippet. Without this,
// pasting one silently loses fullscreen. Verified attribute by attribute in a
// browser: `open`, `download` and `reversed` need no alias, React knows them
// under their HTML names.
const HTML_ATTRIBUTE_ALIASES: Record<string, string> = {
  allowfullscreen: "allowFullScreen",
};

/** Makes pasted HTML behave like HTML on the tags an author may write. */
export function normalizePastedHtmlAttributes() {
  return function htmlAttributeNames() {
    return (tree: unknown) => {
      visit(tree as never, (rawNode) => {
        const node = rawNode as MdxNode;
        if (
          node.type !== "mdxJsxFlowElement" &&
          node.type !== "mdxJsxTextElement"
        ) {
          return;
        }
        // Host elements only: a component's prop named `allowfullscreen` is
        // its own business, and renaming it would be us breaking its contract.
        const name = node.name;
        if (!name || !isHostElement(name)) return;
        for (const attribute of node.attributes ?? []) {
          const jsxName = attribute.name && HTML_ATTRIBUTE_ALIASES[attribute.name];
          if (jsxName) attribute.name = jsxName;
        }
      });
    };
  };
}

interface MdxNode {
  type: string;
  name?: string | null;
  children?: MdxNode[];
  attributes?: { name?: string | null }[];
}
