import type { Node } from "estree";
import { SKIP, visit } from "unist-util-visit";

// The sandbox's attribute rule (ADR 0002): JSX props may carry an expression,
// but only a *static literal* one — `width={400}`, `toolbar={false}`,
// `items={["a", "b"]}`. This is an allowlist, safe by construction: a literal
// has no evaluation semantics, it compiles to a constant. Nothing to reach,
// so nothing to escape from — unlike a denylist of dangerous globals, which
// has to anticipate every path to the Function constructor.
//
// It replaces next-mdx-remote's `blockJS`, a blunt filter that drops every
// attribute expression whatever its content: that filter is what made
// `<Image width={400} />` silently lose its width. Content expressions
// ({variable}, {func()}) and spreads stay barred — a wiki page is data.

/** An attribute value expression we refuse, for the compile-time report. */
export interface RejectedProp {
  component: string;
  attribute: string;
}

// A factory returning the remark plugin, so a caller can collect what was
// refused: unified calls the plugin, and the plugin returns the transformer.
export function allowLiteralPropsOnly(rejected: RejectedProp[] = []) {
  return function attributeSandbox() {
    return (tree: unknown) => {
      visit(tree as never, (rawNode, index, rawParent) => {
        const node = rawNode as MdxNode;
        const parent = rawParent as MdxNode | undefined;
        // Content expressions stay barred. mdx-annotations runs before us and
        // has already consumed its own {{ … }}, so this only sees author JS.
        if (
          node.type === "mdxFlowExpression" ||
          node.type === "mdxTextExpression"
        ) {
          if (parent && typeof index === "number") {
            parent.children?.splice(index, 1);
            return [SKIP, index];
          }
        }
        if (
          node.type !== "mdxJsxFlowElement" &&
          node.type !== "mdxJsxTextElement"
        ) {
          return;
        }
        node.attributes = (node.attributes ?? []).filter((attribute) => {
          // {...spread}: an identifier by nature, never a literal.
          if (attribute.type !== "mdxJsxAttribute") return false;
          const value = attribute.value;
          // `prop` alone (=== true) or prop="text": no expression at all.
          if (value === null || value === undefined) return true;
          if (typeof value === "string") return true;
          if (value.type !== "mdxJsxAttributeValueExpression") return true;
          if (isStaticLiteralExpression(value.data?.estree)) return true;
          rejected.push({
            component: node.name ?? "?",
            attribute: attribute.name ?? "?",
          });
          return false;
        });
      });
    };
  };
}

// The estree of `{…}` is a Program wrapping one expression statement.
function isStaticLiteralExpression(program: EstreeProgram | undefined): boolean {
  const body = program?.body;
  if (!body || body.length !== 1) return false;
  const statement = body[0];
  if (statement.type !== "ExpressionStatement") return false;
  return isStaticLiteral(statement.expression);
}

// Every node here evaluates to itself, with no name to resolve and no call to
// make: numbers, strings, booleans, null, and arrays/objects built only from
// those. Anything else — an identifier, a call, a member access, a template
// with a hole, a function — is not a literal and is refused.
function isStaticLiteral(node: Node): boolean {
  switch (node.type) {
    case "Literal":
      // A regex literal builds a RegExp object and can backtrack forever; a
      // bigint is useless as a prop. Keep the surface to plain scalars.
      return !("regex" in node) && !("bigint" in node && node.bigint);
    case "UnaryExpression":
      // Negative numbers parse as -(1), not as a single literal.
      return (
        (node.operator === "-" || node.operator === "+") &&
        isStaticLiteral(node.argument)
      );
    case "TemplateLiteral":
      // `foo` is a constant; `foo${bar}` interpolates and is not.
      return node.expressions.length === 0;
    case "ArrayExpression":
      return node.elements.every(
        (element): boolean =>
          element !== null &&
          element.type !== "SpreadElement" &&
          isStaticLiteral(element)
      );
    case "ObjectExpression":
      return node.properties.every(
        (property): boolean =>
          property.type === "Property" &&
          !property.computed &&
          (property.key.type === "Identifier" ||
            property.key.type === "Literal") &&
          isStaticLiteral(property.value as Node)
      );
    default:
      return false;
  }
}

// Minimal shapes of the mdast-util-mdx-jsx nodes we touch; the upstream types
// are not exported in a form usable from a plain remark plugin here.
type EstreeProgram = { body: { type: string; expression: Node }[] };

interface MdxAttribute {
  type: string;
  name?: string;
  value?:
    | string
    | null
    | { type: string; data?: { estree?: EstreeProgram } };
}

interface MdxNode {
  type: string;
  name?: string;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
}
