import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { ComponentBuilderSpec } from "./component-descriptors";
import { type EstreeProgram, isStaticLiteralExpression } from "./mdx-literal-props";

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

      const value = attribute.value;
      if (
        value !== null &&
        value !== undefined &&
        typeof value !== "string" &&
        value.type === "mdxJsxAttributeValueExpression" &&
        !isStaticLiteralExpression(value.data?.estree)
      ) {
        warnings.push({
          line,
          message: `« ${attributeName} » sur « ${name} » sera ignoré : seules les valeurs littérales sont acceptées, pas une expression à évaluer.`,
        });
        continue;
      }

      const declared = property.options;
      if (declared && typeof value === "string" && !(value in declared)) {
        warnings.push({
          line,
          message: `« ${attributeName}="${value}" » sur « ${name} » n'est pas une valeur attendue (${Object.keys(declared).join(", ")}).`,
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

// Minimal shape of the mdast-util-mdx-jsx nodes walked here.
interface MdxJsxNode {
  type: string;
  name?: string | null;
  position?: { start: { line: number } };
  attributes?: {
    type: string;
    name?: string | null;
    value?:
      | string
      | null
      | { type: string; data?: { estree?: EstreeProgram } };
  }[];
}
