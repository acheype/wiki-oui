import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { type PropKind, propKind } from "./component-descriptor";
import type { ComponentBuilderSpec } from "./component-descriptors";
import { isAllowedHostElement, isHostElement } from "./mdx-host-elements";
import { type EstreeProgram, staticLiteralValue } from "./mdx-literal-props";

// What a page's MDX says versus what the registry and the descriptors can
// honour (ADR 0002). Every rule here answers the same question — "will this
// silently do nothing?" — and reports it at save, the only moment the page
// has an author to tell. Never blocking: a wiki tolerates a work in progress.
//
// The real MDX AST, not the tag parser of component-descriptor.ts: that one
// reads a single self-closing tag under the cursor, so it would miss
// `<Menu>…</Menu>` and mistake JSX inside a code fence for a component.

export interface PageWarning {
  /** French, author-facing: it goes straight to the editor's panel. */
  message: string;
  /** Raw technical text (a compiler's own words), shown in monospace. */
  details?: string;
  line?: number;
}

/**
 * The warnings a source raises against the registry and the descriptors.
 * Pure: callers inject what they loaded (`lib/mdx.tsx`, `component-descriptors`).
 */
export function lintPageSource(
  source: string,
  registry: string[],
  builders: ComponentBuilderSpec[]
): PageWarning[] {
  const warnings: PageWarning[] = [];
  const known = new Set(registry);
  const specs = new Map(builders.map((spec) => [spec.name, spec]));

  // MDX that does not parse cannot be walked — and saving must stay possible:
  // the page is the author's, broken or not, and it will say so itself (the
  // render shows a compile-error box). So the parse failure *is* the warning,
  // pointing at its line, rather than an exception that would break the save.
  let tree;
  try {
    tree = unified().use(remarkParse).use(remarkMdx).parse(source);
  } catch (error) {
    return [
      {
        line: (error as { line?: number }).line,
        message:
          "Le contenu MDX de cette page contient une erreur de compilation. La page ne pourra pas être affichée.",
        details: error instanceof Error ? error.message : String(error),
      },
    ];
  }

  visit(tree, (rawNode) => {
    const node = rawNode as MdxJsxNode;
    if (
      node.type !== "mdxJsxFlowElement" &&
      node.type !== "mdxJsxTextElement"
    ) {
      return;
    }
    // A null name is a fragment (<>…</>).
    const name = node.name;
    if (!name) return;
    const line = node.position?.start.line;

    if (isHostElement(name)) {
      if (!isAllowedHostElement(name)) {
        warnings.push({
          line,
          message: `La balise « <${name}> » n'est pas autorisée dans une page. Elle ne sera pas affichée.`,
        });
      }
      return;
    }
    if (!/^[A-Z]/.test(name)) return;

    if (!known.has(name)) {
      warnings.push({
        line,
        message: `Le composant « ${name} » n'existe pas. Il ne sera pas affiché.`,
      });
      return;
    }

    // menu, entries-admin and forms-admin carry no .yaml: their props cannot
    // be checked, and inventing rules for them would be worse than silence.
    const spec = specs.get(name);
    if (!spec) return;

    const properties = spec.descriptor.properties;
    const written = new Set<string>();

    for (const attribute of node.attributes ?? []) {
      if (attribute.type === "mdxJsxExpressionAttribute") {
        warnings.push({
          line,
          message: `Sur « ${name} », les propriétés étalées ({...}) sont ignorées.`,
        });
        continue;
      }
      const attributeName = attribute.name;
      if (!attributeName) continue;
      written.add(attributeName);

      const property = properties[attributeName];
      if (!property || property.type === "divider") {
        warnings.push({
          line,
          message: `Le composant « ${name} » n'a pas de propriété « ${attributeName} ». Elle sera ignorée.`,
        });
        continue;
      }

      const received = attributeValue(attribute.value);
      if (received === UNREADABLE) {
        warnings.push({
          line,
          message: `La propriété « ${attributeName} » de « ${name} » contient une expression à évaluer. Seules les valeurs littérales sont acceptées, elle sera ignorée.`,
        });
        continue;
      }

      const misfit = propMisfit(propKind(property.type), received);
      if (misfit) {
        warnings.push({
          line,
          message: `La propriété « ${attributeName} » de « ${name} » ${misfit}`,
        });
        continue;
      }

      const declared = property.options;
      if (declared && typeof received === "string" && !(received in declared)) {
        warnings.push({
          line,
          message: `La propriété « ${attributeName} » de « ${name} » n'accepte pas la valeur « ${received} ». Valeurs possibles : ${Object.keys(declared).join(", ")}.`,
        });
      }
    }

    for (const [attributeName, property] of Object.entries(properties)) {
      if (property.required && !written.has(attributeName)) {
        warnings.push({
          line,
          message: `La propriété « ${attributeName} » est obligatoire sur « ${name} ». Sans elle, le composant ne sera pas affiché.`,
        });
      }
    }
  });

  return warnings;
}

/** A well-formed expression the sandbox will drop, so it has no value at all. */
const UNREADABLE = Symbol("unreadable");

// The value the component will actually receive, in JSX's own terms: a bare
// attribute is `true`, a quoted one is that string, an expression is what it
// evaluates to.
function attributeValue(value: MdxAttributeValue): unknown {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value;
  if (value.type !== "mdxJsxAttributeValueExpression") return value;
  const literal = staticLiteralValue(value.data?.estree);
  return literal ? literal.value : UNREADABLE;
}

// Whether the value honours what the descriptor promised, phrased as the
// complaint when it does not. The reference is the contract, not what one
// component happens to survive: `type: number` promises the component a
// number, and `<Image>` only tolerates `width="200"` because imageUrl calls
// String() on it — another component doing `width.toFixed(0)` would throw.
//
// The builder's own field is that contract in code, and the yardstick here:
// the number widget shows `typeof value === "number"` alone, the text widget
// shows a string or a number, the checkbox only `true`. A value its field
// cannot display is a value the source and the tooling disagree about.
//
// A checkbox is the sharpest trap: every non-empty string is truthy, so
// `whiteBorder="false"` turns the border *on* — worse than doing nothing, it
// does the opposite of what is written.
function propMisfit(kind: PropKind, value: unknown): string | null {
  switch (kind) {
    case "none":
      return null; // a divider is builder chrome, it carries no prop
    case "boolean":
      return typeof value === "boolean"
        ? null
        : "attend {true} ou {false}.";
    case "number":
      return typeof value === "number"
        ? null
        : "attend un nombre entre accolades, par exemple {200}.";
    case "string":
      // A number reads back as its text; a boolean renders as nothing at all.
      return typeof value === "string" || typeof value === "number"
        ? null
        : "attend du texte.";
  }
}

// Minimal shape of the mdast-util-mdx-jsx nodes walked here.
type MdxAttributeValue =
  | string
  | null
  | undefined
  | { type: string; data?: { estree?: EstreeProgram } };

interface MdxJsxNode {
  type: string;
  name?: string | null;
  position?: { start: { line: number } };
  attributes?: {
    type: string;
    name?: string | null;
    value?: MdxAttributeValue;
  }[];
}
