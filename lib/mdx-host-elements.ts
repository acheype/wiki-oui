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

interface MdxNode {
  type: string;
  name?: string | null;
  children?: MdxNode[];
}
