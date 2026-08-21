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
//
// Two prop names are refused outright, whatever their value (REFUSED_PROP_NAMES
// below). The literal allowlist cannot see them: their payload *is* a valid
// literal, and what makes it dangerous is what React or the browser does with
// the name. Both were verified scripting a real browser before the rule.

// An allowlist of prop *names* is impossible here — the project means to host
// any third-party component, so any name is legitimate. These two are named
// refusals instead, each for its own reason:
//
//   - dangerouslySetInnerHTML: React's escape hatch. `{__html: '<img src=x
//     onerror=…>'}` is an ordinary literal object; only React's reading of the
//     name turns that data into markup. React fixes the name, its whole
//     purpose is to bypass escaping, and no descriptor can declare it.
//   - srcDoc: an `<iframe srcdoc>` inherits the *embedding* document's origin,
//     so its scripts run inside the wiki. It is the whole risk of the tag —
//     its sibling `src`, the case authors want, is walled off by the
//     same-origin policy. Both spellings go: JSX says `srcDoc`, and a pasted
//     lowercase `srcdoc` still reaches the DOM, since React writes through any
//     unknown attribute holding a string.
const REFUSED_PROP_NAMES = new Set([
  "dangerouslySetInnerHTML",
  "srcDoc",
  "srcdoc",
]);

// A factory returning the remark plugin: unified calls the plugin, and the
// plugin returns the transformer. Refusals are dropped in silence here — the
// author is told at save time instead (lib/page-lint.ts), the only moment a
// page has an author to tell.
export function allowLiteralPropsOnly() {
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
          if (attribute.name && REFUSED_PROP_NAMES.has(attribute.name)) {
            return false;
          }
          const value = attribute.value;
          // `prop` alone (=== true) or prop="text": no expression at all.
          if (value === null || value === undefined) return true;
          if (typeof value === "string") return true;
          if (value.type !== "mdxJsxAttributeValueExpression") return true;
          return isStaticLiteralExpression(value.data?.estree);
        });
      });
    };
  };
}

/**
 * The value of `{…}` when it is a static literal, boxed so a literal `null`
 * or `false` stays distinguishable from "not a literal". The estree of an
 * attribute expression is a Program wrapping one expression statement.
 *
 * Shared with the save-time report (lib/page-lint.ts): the sandbox asks
 * whether the value survives, the report asks what it will be — one traversal
 * answers both, so they can never drift apart.
 */
export function staticLiteralValue(
  program: EstreeProgram | undefined
): { value: unknown } | null {
  const body = program?.body;
  if (!body || body.length !== 1) return null;
  const statement = body[0];
  if (statement.type !== "ExpressionStatement") return null;
  return literalValue(statement.expression);
}

export function isStaticLiteralExpression(
  program: EstreeProgram | undefined
): boolean {
  return staticLiteralValue(program) !== null;
}

// Every node here evaluates to itself, with no name to resolve and no call to
// make: numbers, strings, booleans, null, and arrays/objects built only from
// those. Anything else — an identifier, a call, a member access, a template
// with a hole, a function — is not a literal, and returns null.
//
// Evaluating is what makes it an allowlist rather than a shape check: a node
// we cannot compute is a node we do not let through.
function literalValue(node: Node): { value: unknown } | null {
  switch (node.type) {
    case "Literal":
      // A regex literal builds a RegExp object and can backtrack forever; a
      // bigint is useless as a prop. Keep the surface to plain scalars.
      if ("regex" in node || ("bigint" in node && node.bigint)) return null;
      return { value: node.value };
    case "UnaryExpression": {
      // Negative numbers parse as -(1), not as a single literal.
      if (node.operator !== "-" && node.operator !== "+") return null;
      const argument = literalValue(node.argument);
      if (!argument || typeof argument.value !== "number") return null;
      return {
        value: node.operator === "-" ? -argument.value : argument.value,
      };
    }
    case "TemplateLiteral":
      // `foo` is a constant; `foo${bar}` interpolates and is not.
      if (node.expressions.length !== 0) return null;
      return { value: node.quasis[0]?.value.cooked ?? "" };
    case "ArrayExpression": {
      const items: unknown[] = [];
      for (const element of node.elements) {
        if (element === null || element.type === "SpreadElement") return null;
        const item = literalValue(element);
        if (!item) return null;
        items.push(item.value);
      }
      return { value: items };
    }
    case "ObjectExpression": {
      const object: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (property.type !== "Property" || property.computed) return null;
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal"
              ? String(property.key.value)
              : null;
        if (key === null) return null;
        const entry = literalValue(property.value as Node);
        if (!entry) return null;
        object[key] = entry.value;
      }
      return { value: object };
    }
    default:
      return null;
  }
}

// Minimal shapes of the mdast-util-mdx-jsx nodes we touch; the upstream types
// are not exported in a form usable from a plain remark plugin here.
export type EstreeProgram = { body: { type: string; expression: Node }[] };

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
