// ComponentBuilder descriptor engine (docs/component-builder.md): pure logic
// shared by the loader and the editor UI. No fs, no React — the co-located
// YAML files are read and parsed by the server-side loader.

const FIELD_TYPES = [
  "text",
  "number",
  "url",
  "icon",
  "checkbox",
  "list",
  "page-list",
  "file-list",
  "divider",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface DescriptorField {
  label: string;
  hint?: string;
  type: FieldType;
  /** For `list`: value → display label. The value is what the prop stores. */
  options?: Record<string, string>;
  /** Insertion pre-fill; the prop is always written, even when unchanged. */
  value?: string | number | boolean;
  required?: boolean;
  advanced?: boolean;
  showif?: Record<string, unknown>;
}

export interface ComponentDescriptor {
  label: string;
  description?: string;
  previewHeight?: string;
  /** Serialization target; JSX component tag unless "markdown-link". */
  emits?: "markdown-link";
  properties: Record<string, DescriptorField>;
}

/** Prop values as the component exports them (`xxxDefaults`). */
export type PropValue = string | number | boolean | undefined;
export type PropDefaults = Record<string, PropValue>;

// A showif condition written between slashes is a regex (search semantics);
// ambiguous literals are spelled in regex form (docs/component-builder.md).
function isRegexCondition(condition: unknown): condition is string {
  return (
    typeof condition === "string" &&
    condition.length >= 2 &&
    condition.startsWith("/") &&
    condition.endsWith("/")
  );
}

// Fail-fast validation (same spirit as buildRegistry in lib/mdx.tsx): a
// broken descriptor must stop the loader with an explicit message, never
// produce a half-working builder.
export function validateDescriptor(
  name: string,
  descriptor: ComponentDescriptor,
  defaults: PropDefaults
): void {
  const source = `components/wiki/${name}.yaml`;
  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (!FIELD_TYPES.includes(spec.type)) {
      throw new Error(
        `${source}: field "${field}" has unknown type "${spec.type}"`
      );
    }
    if (spec.type === "divider") continue;
    if (!(field in defaults)) {
      throw new Error(
        `${source}: field "${field}" has no matching key in the exported defaults`
      );
    }
    for (const [target, condition] of Object.entries(spec.showif ?? {})) {
      if (!(target in descriptor.properties)) {
        throw new Error(
          `${source}: showif of "${field}" points at unknown field "${target}"`
        );
      }
      if (isRegexCondition(condition)) {
        try {
          new RegExp(condition.slice(1, -1));
        } catch {
          throw new Error(
            `${source}: showif of "${field}" holds an invalid regex for "${target}": ${condition}`
          );
        }
      }
    }
    if (spec.type === "list") {
      const options = Object.keys(spec.options ?? {});
      const fallback = defaults[field];
      if (typeof fallback !== "string" || !options.includes(fallback)) {
        const got = fallback === undefined ? "undefined" : `"${fallback}"`;
        throw new Error(
          `${source}: list field "${field}" needs an exported default among its options (${options.join(", ")}), got ${got}`
        );
      }
    }
  }
}

/** Current builder field values, keyed by prop name. */
export type PropValues = Record<string, PropValue>;

// showif evaluation (docs/component-builder.md): several entries AND up;
// fields react live while typing, so this stays pure and cheap.
export function visibleFields(
  descriptor: ComponentDescriptor,
  values: PropValues
): string[] {
  return Object.keys(descriptor.properties).filter((field) =>
    isVisible(descriptor, values, field)
  );
}

function isVisible(
  descriptor: ComponentDescriptor,
  values: PropValues,
  field: string,
  trail: string[] = []
): boolean {
  const showif = descriptor.properties[field].showif;
  if (!showif) return true;
  // A dependency cycle would recurse forever; treat re-entered fields as
  // hidden (their value reads as empty) rather than crash the builder.
  if (trail.includes(field)) return false;
  return Object.entries(showif).every(([target, condition]) => {
    const value = isVisible(descriptor, values, target, [...trail, field])
      ? values[target]
      : undefined;
    return holds(condition, value);
  });
}

// "Empty" backs both the notNull/null keywords and the hidden-field cascade:
// unset, blank text and unchecked checkbox all count as nothing to show.
function isEmpty(value: PropValue): boolean {
  return value === undefined || value === "" || value === false;
}

function holds(condition: unknown, value: PropValue): boolean {
  if (condition === null) return isEmpty(value);
  if (condition === "notNull") return !isEmpty(value);
  if (typeof condition === "boolean") return (value === true) === condition;
  if (isRegexCondition(condition)) {
    return new RegExp(condition.slice(1, -1)).test(String(value ?? ""));
  }
  return String(value) === String(condition);
}

// MDX generation (docs/component-builder.md). The generated MDX is a user
// interface: omit whatever the reader can infer (the omission rule) so the
// source stays short. Fields carrying a YAML `value` pre-fill are the
// exception: their prop is always written, even unchanged.
export function generateTag(
  name: string,
  descriptor: ComponentDescriptor,
  defaults: PropDefaults,
  values: PropValues,
  unknownAttributes: string[] = []
): string {
  const visible = visibleFields(descriptor, values);
  const attributes: string[] = [];
  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    if (!visible.includes(field)) continue;
    // A key absent from values reads as its default (the builder shows
    // defaults for omitted props — same convention as the inverse mapping).
    const value = field in values ? values[field] : defaults[field];
    if (value === defaults[field] && spec.value === undefined) continue;
    if (isEmpty(value) && isEmpty(defaults[field])) continue;
    attributes.push(serializeAttribute(field, value));
  }
  attributes.push(...unknownAttributes);
  const body = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  return `<${name}${body} />`;
}

function serializeAttribute(field: string, value: PropValue): string {
  if (value === true) return field;
  if (typeof value === "string") {
    // Double quotes by default; fall back on single quotes, then on the
    // &quot; entity, so any text stays a plain JSX string attribute.
    if (!value.includes('"')) return `${field}="${value}"`;
    if (!value.includes("'")) return `${field}='${value}'`;
    return `${field}="${value.replaceAll('"', "&quot;")}"`;
  }
  return `${field}={${JSON.stringify(value)}}`;
}

export interface TagAttribute {
  name: string;
  /** Attribute exactly as written, e.g. `className="text-right"`. */
  raw: string;
  /** Decoded literal; undefined when the value is a non-literal expression. */
  value: PropValue;
  literal: boolean;
}

export interface ParsedTag {
  name: string;
  attributes: TagAttribute[];
}

// Parses one self-closing component tag. Returns null on anything it does
// not fully understand: the caller then treats the tag as malformed and
// offers no pencil (docs/architecture.md).
export function parseTag(source: string): ParsedTag | null {
  const prefix = parseTagPrefix(source);
  return prefix && prefix.length === source.length ? prefix.tag : null;
}

// Same parse, but on a text that continues after the tag; reports how far
// the tag reaches so findComponentTag can locate it inside a document.
function parseTagPrefix(
  source: string
): { tag: ParsedTag; length: number } | null {
  const open = source.match(/^<([A-Z][A-Za-z0-9]*)/);
  if (!open) return null;
  const name = open[1];
  let offset = open[0].length;
  const attributes: TagAttribute[] = [];
  for (;;) {
    const spacing = source.slice(offset).match(/^\s*/)![0];
    offset += spacing.length;
    if (source.startsWith("/>", offset)) {
      return { tag: { name, attributes }, length: offset + 2 };
    }
    if (spacing === "") return null;
    const attribute = matchAttribute(source.slice(offset));
    if (!attribute) return null;
    attributes.push(attribute.parsed);
    offset += attribute.length;
  }
}

// How far behind the cursor a tag opening may start. Generated tags are
// one-liners; hand-written ones larger than this window just get no pencil.
const TAG_SCAN_WINDOW = 2000;

/** Finds the well-formed self-closing component tag enclosing `offset`. */
export function findComponentTag(
  text: string,
  offset: number
): { from: number; to: number; tag: ParsedTag } | null {
  const windowStart = Math.max(0, offset - TAG_SCAN_WINDOW);
  for (let from = offset; from >= windowStart; from--) {
    if (text[from] !== "<" || !/[A-Z]/.test(text[from + 1] ?? "")) continue;
    const prefix = parseTagPrefix(text.slice(from, from + TAG_SCAN_WINDOW));
    if (!prefix) continue;
    const to = from + prefix.length;
    if (to < offset) return null; // nearest tag ends before the cursor
    return { from, to, tag: prefix.tag };
  }
  return null;
}

function matchAttribute(
  source: string
): { parsed: TagAttribute; length: number } | null {
  const name = source.match(/^[A-Za-z_][A-Za-z0-9_-]*/)?.[0];
  if (!name) return null;
  if (!source.slice(name.length).startsWith("=")) {
    // Bare attribute: JSX shorthand for true.
    return {
      parsed: { name, raw: name, value: true, literal: true },
      length: name.length,
    };
  }
  const rest = source.slice(name.length + 1);
  const quoted = rest.match(/^"([^"]*)"|^'([^']*)'/);
  if (quoted) {
    const text = quoted[1] ?? quoted[2];
    return {
      parsed: {
        name,
        raw: source.slice(0, name.length + 1 + quoted[0].length),
        value: text.replaceAll("&quot;", '"'),
        literal: true,
      },
      length: name.length + 1 + quoted[0].length,
    };
  }
  if (!rest.startsWith("{")) return null;
  const expression = matchBraces(rest);
  if (!expression) return null;
  const inner = expression.slice(1, -1).trim();
  const literal = decodeLiteral(inner);
  return {
    parsed: {
      name,
      raw: source.slice(0, name.length + 1 + expression.length),
      value: literal?.value,
      literal: literal !== null,
    },
    length: name.length + 1 + expression.length,
  };
}

// Consumes a balanced {…} block, quote-aware so braces inside strings don't
// derail the count. Returns the block including its outer braces.
function matchBraces(source: string): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return source.slice(0, i + 1);
  }
  return null;
}

function decodeLiteral(expression: string): { value: PropValue } | null {
  if (expression === "true") return { value: true };
  if (expression === "false") return { value: false };
  if (/^-?\d+(\.\d+)?$/.test(expression)) return { value: Number(expression) };
  return null;
}

// Inverse mapping (docs/component-builder.md): tag → builder state. Absent
// known props show their default; unknown props are carried verbatim to the
// regeneration. A known prop bound to a non-literal expression cannot be
// represented by a field: the whole tag is not builder-editable.
export function tagToBuilderState(
  descriptor: ComponentDescriptor,
  defaults: PropDefaults,
  tag: ParsedTag
): { values: PropValues; unknownAttributes: string[] } | null {
  const values: PropValues = { ...defaults };
  const unknownAttributes: string[] = [];
  for (const attribute of tag.attributes) {
    const spec = descriptor.properties[attribute.name];
    if (!spec || spec.type === "divider") {
      unknownAttributes.push(attribute.raw);
      continue;
    }
    if (!attribute.literal) return null;
    values[attribute.name] = attribute.value;
  }
  return { values, unknownAttributes };
}

export function pascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function camelCase(kebab: string): string {
  const pascal = pascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
