// ComponentBuilder descriptor engine (docs/component-builder.md): pure logic
// shared by the loader and the editor UI. No fs, no React — the co-located
// YAML files are read and parsed by the server-side loader.

import { z } from "zod";

const FIELD_TYPES = [
  "text",
  "number",
  "url",
  "icon",
  "checkbox",
  "list",
  "page-list",
  "file-list",
  "form-list",
  "divider",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** What a field's prop actually holds once it reaches the component. */
export type PropKind = "string" | "number" | "boolean" | "none";

// Exhaustive on purpose (no `default`): a new field type must state what its
// prop holds, or the compiler objects. The save-time report leans on this to
// tell an author that `width="abc"` or `whiteBorder="false"` will not do what
// they wrote (lib/page-lint.ts).
export function propKind(type: FieldType): PropKind {
  switch (type) {
    case "divider":
      return "none";
    case "checkbox":
      return "boolean";
    case "number":
      return "number";
    case "text":
    case "url":
    case "icon":
    case "list":
    case "page-list":
    case "file-list":
    case "form-list":
      return "string";
  }
}

/** File families (ADR 0012): route uploads and filter file-list fields. */
export const FILE_FAMILIES = ["image", "pdf", "other"] as const;
export type FileFamily = (typeof FILE_FAMILIES)[number];

const propValueSchema = z.union([z.string(), z.number(), z.boolean()]);

// Meta-schema of a descriptor (ADR 0015): the shape contract at the loader
// edge, replacing the hand-maintained interface and its cast. Cross-field
// rules (showif targets, list defaults…) stay imperative in
// validateDescriptor — Zod only covers the shape.
const descriptorFieldSchema = z.object({
  label: z.string(),
  hint: z.string().optional(),
  type: z.enum(FIELD_TYPES),
  /** For `list`: value → display label. The value is what the prop stores. */
  options: z.record(z.string(), z.string()).optional(),
  // Omission-rule reference (ADR 0013): the prop is dropped from the MDX
  // when equal to this, and an absent prop re-edits with it. Must equal the
  // component's destructuring default (verified by lib/verify-descriptors).
  default: propValueSchema.optional(),
  /** Insertion pre-fill; the prop is always written, even when unchanged. */
  value: propValueSchema.optional(),
  /** For `file-list`: restricts the combobox to one file family. */
  family: z.enum(FILE_FAMILIES).optional(),
  required: z.boolean().optional(),
  advanced: z.boolean().optional(),
  showif: z.record(z.string(), z.unknown()).optional(),
});

export const componentDescriptorSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  previewHeight: z.string().optional(),
  /** Serialization target; JSX component tag unless "markdown-link". */
  emits: z.literal("markdown-link").optional(),
  properties: z.record(z.string(), descriptorFieldSchema),
});

export type DescriptorField = z.infer<typeof descriptorFieldSchema>;
export type ComponentDescriptor = z.infer<typeof componentDescriptorSchema>;

/** True for wiki-link: serialized as a markdown link, kept out of the menu. */
export function emitsMarkdownLink(descriptor: ComponentDescriptor): boolean {
  return descriptor.emits === "markdown-link";
}

/** A prop value carried by a field's `default`/`value` and the generated tag. */
export type PropValue = string | number | boolean | undefined;
/** Omission-rule defaults keyed by prop name, derived from the descriptor. */
export type PropDefaults = Record<string, PropValue>;

// Resolves a descriptor path (e.g. ["properties","color","type"]) to its
// 1-based line in the YAML source, or undefined when unknown. Built from the
// parsed document by the loader (lib/descriptor-source.ts); error messages use
// it to point at the exact offending line. Absent = no line shown (e.g. a
// descriptor built by hand in a test).
export type LineLookup = (path: (string | number)[]) => number | undefined;

// The omission-rule defaults come from the descriptor itself (ADR 0013): each
// field's `default` (a divider emits no prop; a field without a `default` is
// empty/undefined). The engine keeps taking `defaults` explicitly so the
// editor can pass the same map it holds on the loaded spec.
export function descriptorDefaults(descriptor: ComponentDescriptor): PropDefaults {
  const defaults: PropDefaults = {};
  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    defaults[field] = spec.default;
  }
  return defaults;
}

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

// Reads the value a failing Zod issue points at, for the error message.
function valueAt(raw: unknown, nodePath: readonly PropertyKey[]): unknown {
  let node: unknown = raw;
  for (const key of nodePath) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  return node;
}

// Structural validation (ADR 0013 / ADR 0015): is the raw parsed YAML a
// well-formed descriptor, without looking at the component? Shape comes from
// the Zod meta-schema (the loader's cast is gone: raw unknown in, typed
// descriptor out), cross-field rules stay imperative below. Same fail-fast
// spirit as buildRegistry in lib/mdx.tsx — a broken descriptor stops the
// loader with an explicit message. The YAML ↔ component match is a separate
// pass (lib/verify-descriptors, dev + build only).
export function validateDescriptor(
  name: string,
  raw: unknown,
  lineOf?: LineLookup
): ComponentDescriptor {
  const source = `components/wiki/${name}.yaml`;
  // Prefixes the message with the file and, when known, the first of the
  // candidate paths that resolves to a line — so it points at the offending
  // key (e.g. the `type:` line), falling back to the field, then the file.
  const at = (...candidates: (string | number)[][]): string => {
    for (const candidate of candidates) {
      const line = lineOf?.(candidate);
      if (line !== undefined) return `${source}:${line}`;
    }
    return source;
  };

  const result = componentDescriptorSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(shapeErrorMessage(raw, result.error.issues[0], at));
  }
  const descriptor = result.data;

  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    for (const [target, condition] of Object.entries(spec.showif ?? {})) {
      const where = at(["properties", field, "showif", target], ["properties", field]);
      if (!(target in descriptor.properties)) {
        throw new Error(
          `${where}: showif of "${field}" points at unknown field "${target}"`
        );
      }
      if (isRegexCondition(condition)) {
        try {
          new RegExp(condition.slice(1, -1));
        } catch {
          throw new Error(
            `${where}: showif of "${field}" holds an invalid regex for "${target}": ${condition}`
          );
        }
      }
    }
    if (spec.type === "list") {
      const options = Object.keys(spec.options ?? {});
      const fallback = spec.default;
      if (typeof fallback !== "string" || !options.includes(fallback)) {
        const got = fallback === undefined ? "undefined" : `"${fallback}"`;
        throw new Error(
          `${at(["properties", field, "default"], ["properties", field])}: list field "${field}" needs a default among its options (${options.join(", ")}), got ${got}`
        );
      }
    }
  }
  return descriptor;
}

// Human wording for the first meta-schema violation, preserving the messages
// the imperative checks used to produce (unknown type/emits/family…).
function shapeErrorMessage(
  raw: unknown,
  issue: { path: readonly PropertyKey[]; message: string },
  at: (...candidates: (string | number)[][]) => string
): string {
  const path = issue.path.map((key) => key as string | number);
  if (
    path.length === 0 ||
    (path.length === 1 && (path[0] === "label" || path[0] === "properties"))
  ) {
    return `${at([])}: a descriptor needs at least "label" and "properties"`;
  }
  if (path[0] === "emits") {
    return `${at(["emits"])}: unknown emits target "${valueAt(raw, path)}" (the only alternative is markdown-link)`;
  }
  if (path[0] === "properties" && path.length >= 3) {
    const field = String(path[1]);
    const where = at(path, ["properties", field]);
    if (path[2] === "type" && path.length === 3) {
      return `${where}: field "${field}" has unknown type "${valueAt(raw, path)}"`;
    }
    if (path[2] === "family" && path.length === 3) {
      return `${where}: file-list field "${field}" has unknown family "${valueAt(raw, path)}" (${FILE_FAMILIES.join(", ")})`;
    }
    return `${where}: field "${field}": ${issue.message} at "${path.slice(2).join(".")}"`;
  }
  return `${at(path)}: ${issue.message} at "${path.join(".")}"`;
}

/** Current builder field values, keyed by prop name. */
export type PropValues = Record<string, PropValue>;

// showif evaluation (docs/component-builder.md): several entries AND up;
// fields react live while typing, so this stays pure and cheap. A key
// absent from values reads as its exported default, so insertion and
// re-edit see the same visibility for the same generated tag.
export function visibleFields(
  descriptor: ComponentDescriptor,
  defaults: PropDefaults,
  values: PropValues
): string[] {
  return Object.keys(descriptor.properties).filter((field) =>
    isVisible(descriptor, defaults, values, field)
  );
}

function isVisible(
  descriptor: ComponentDescriptor,
  defaults: PropDefaults,
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
    const value = isVisible(descriptor, defaults, values, target, [...trail, field])
      ? (target in values ? values[target] : defaults[target])
      : undefined;
    return holds(condition, value);
  });
}

// "Empty" backs the notNull/null keywords, the hidden-field cascade and the
// builder's required-field guard: unset, blank text and unchecked checkbox
// all count as nothing to show.
export function isEmpty(value: PropValue): boolean {
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
  const visible = visibleFields(descriptor, defaults, values);
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

// Parses one self-closing component tag, and reports how far it reaches so
// findComponentTag can locate it inside a document. Returns null on anything
// it does not fully understand — the invariant the pencil rests on: a span is
// only ever returned when every character in it was understood, because that
// span is what gets overwritten. The caller then offers no pencil
// (docs/architecture.md).
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
// Exported so componentAtCursor slices the same window out of the document.
export const TAG_SCAN_WINDOW = 2000;

/** A span of document offsets, as used across the editor (CodeMirror positions). */
export type Range = { from: number; to: number };

/** Finds the well-formed self-closing component tag enclosing `offset`. */
export function findComponentTag(
  text: string,
  offset: number
): (Range & { tag: ParsedTag }) | null {
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
// regeneration.
//
// A known prop bound to a non-literal expression (`width={maVariable}`) has
// no value a field could show, so the field falls back to its default — and
// the expression is dropped on regeneration. That loses nothing: the sandbox
// already refuses to pass it (ADR 0002), so it renders nothing today. The
// builder used to decline the whole tag instead, which left the one value the
// author needed to fix as the only one they could not reach.
export function tagToBuilderState(
  descriptor: ComponentDescriptor,
  defaults: PropDefaults,
  tag: ParsedTag
): { values: PropValues; unknownAttributes: string[] } {
  const values: PropValues = { ...defaults };
  const unknownAttributes: string[] = [];
  for (const attribute of tag.attributes) {
    const spec = descriptor.properties[attribute.name];
    if (!spec || spec.type === "divider") {
      // An unknown prop is carried raw: its expression stays valid JSX, and
      // the builder has no business rewriting what it does not describe.
      unknownAttributes.push(attribute.raw);
      continue;
    }
    if (!attribute.literal) continue;
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

// The markdown-link serialization target (`emits: markdown-link`,
// docs/component-builder.md): fixed field semantics — text, link, target —
// emitting `[text](link)` with a target annotation when not the default
// (ADR 0006). wiki-link is its only user; the rest of the engine (fields,
// showif, preview, inverse mapping) is shared with tag emitters.
export function generateMarkdownLink(
  defaults: PropDefaults,
  values: PropValues
): string {
  const link = String(values.link ?? "").trim();
  const text = String(values.text ?? "").trim() || link;
  const target = values.target ?? defaults.target;
  const annotation =
    target === defaults.target ? "" : `{{ target: '${target}' }}`;
  return `[${text}](${link})${annotation}`;
}
