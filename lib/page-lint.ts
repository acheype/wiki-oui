import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { type PropKind, propKind } from "./component-descriptor";
import type { ComponentBuilderSpec } from "./component-descriptors";
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
        message: `le MDX de cette page ne compile pas, rien ne s'affichera : ${
          error instanceof Error ? error.message : String(error)
        }`,
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
    // A null name is a fragment (<>…</>), a lowercase one a plain html tag.
    const name = node.name;
    if (!name || !/^[A-Z]/.test(name)) return;
    const line = node.position?.start.line;

    if (!known.has(name)) {
      warnings.push({
        line,
        message: `le composant « ${name} » n'existe pas : rien ne sera affiché.`,
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
          message: `sur « ${name} », les attributs étalés ({...}) sont ignorés.`,
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
          message: `« ${name} » n'a pas d'attribut « ${attributeName} » : il sera ignoré.`,
        });
        continue;
      }

      const received = attributeValue(attribute.value);
      if (received === UNREADABLE) {
        warnings.push({
          line,
          message: `« ${attributeName} » sur « ${name} » sera ignoré : seules les valeurs littérales sont acceptées, pas une expression à évaluer.`,
        });
        continue;
      }

      const misfit = propMisfit(propKind(property.type), received);
      if (misfit) {
        warnings.push({
          line,
          message: `« ${attributeName} » sur « ${name} » ${misfit}`,
        });
        continue;
      }

      const declared = property.options;
      if (declared && typeof received === "string" && !(received in declared)) {
        warnings.push({
          line,
          message: `« ${attributeName}="${received}" » sur « ${name} » n'est pas une valeur attendue (${Object.keys(declared).join(", ")}).`,
        });
      }
    }

    for (const [attributeName, property] of Object.entries(properties)) {
      if (property.required && !written.has(attributeName)) {
        warnings.push({
          line,
          message: `« ${name} » attend l'attribut « ${attributeName} » : sans lui, rien ne sera affiché.`,
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

// Whether a value will do what the author meant, phrased as the complaint
// when it will not. The test is usability, not type identity: JSX coerces, so
// `width="400"` works and must not be nagged about, while `width="abc"` and a
// bare `width` (which means `width={true}`) reach the resize API as `?w=abc`
// and `?w=true` and are dropped — verified, both render the full-size image.
//
// A checkbox is the sharpest trap: every non-empty string is truthy, so
// `whiteBorder="false"` turns the border *on*. That is worse than doing
// nothing — it does the opposite of what is written.
function propMisfit(kind: PropKind, value: unknown): string | null {
  switch (kind) {
    case "none":
      return null; // a divider is builder chrome, it carries no prop
    case "boolean":
      return typeof value === "boolean"
        ? null
        : "attend {true} ou {false} : toute autre valeur est comprise comme vraie, y compris « false ».";
    case "number":
      if (typeof value === "number") return null;
      // A numeric string is coerced on the way in and works as written.
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return null;
      }
      return "attend un nombre : la valeur sera ignorée.";
    case "string":
      // A number reads back as its text; a boolean renders as nothing at all.
      return typeof value === "string" || typeof value === "number"
        ? null
        : "attend du texte : rien ne sera affiché.";
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
