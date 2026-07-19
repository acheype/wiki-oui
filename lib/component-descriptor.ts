// ComponentBuilder descriptor engine (docs/component-builder.md): pure logic
// shared by the loader and the editor UI. No fs, no React — the co-located
// YAML files are read and parsed by the server-side loader.

import { z } from "zod";
import { FORM_FIELD_TYPES } from "./form-descriptor";
import { PSEUDO_FIELDS } from "./pseudo-fields";

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
  "view-picker",
  "form-field",
  "field-rows",
  "color-mapping",
  "icon-mapping",
  "map-view",
  "divider",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/**
 * What a field's prop actually holds once it reaches the component.
 * Beyond the scalar kinds, the structured ones (ADR 0019):
 * - `strings`: one or several names — a string, or an array of strings;
 * - `rows`: ordered `{ field, title?, icon? }` objects (field-rows);
 * - `mapping`: a value → string record (color/icon mappings);
 * - `area`: a `{ lat, lng, zoom }` object (map-view).
 */
export type PropKind =
  | "string"
  | "number"
  | "boolean"
  | "none"
  | "strings"
  | "rows"
  | "mapping"
  | "area";

// Exhaustive on purpose (no `default`): a new field type must state what its
// prop holds, or the compiler objects. The save-time report leans on this to
// tell an author that `width="abc"` or `whiteBorder="false"` will not do what
// they wrote (lib/page-lint.ts).
export function propKind(
  field: Pick<DescriptorField, "type" | "multiple">
): PropKind {
  switch (field.type) {
    case "divider":
      return "none";
    case "checkbox":
      return "boolean";
    case "number":
      return "number";
    case "field-rows":
      return "rows";
    case "color-mapping":
    case "icon-mapping":
      return "mapping";
    case "map-view":
      return "area";
    case "form-list":
    case "form-field":
      return field.multiple ? "strings" : "string";
    case "text":
    case "url":
    case "icon":
    case "list":
    case "view-picker":
    case "page-list":
    case "file-list":
      return "string";
  }
}

/** Does a decoded literal fit what a kind's prop can hold? The save-time
 * report words the complaint (lib/page-lint.ts); the inverse mapping uses the
 * same yardstick to decide whether a structured literal is re-editable. */
export function propKindFits(kind: PropKind, value: unknown): boolean {
  switch (kind) {
    case "none":
      return true;
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number";
    case "string":
      // A number reads back as its text; a boolean renders as nothing at all.
      return typeof value === "string" || typeof value === "number";
    case "strings":
      return (
        typeof value === "string" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string"))
      );
    case "rows":
      return (
        Array.isArray(value) &&
        value.every(
          (row) =>
            row !== null &&
            typeof row === "object" &&
            !Array.isArray(row) &&
            typeof (row as Record<string, unknown>).field === "string"
        )
      );
    case "mapping":
      return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.values(value).every((item) => typeof item === "string")
      );
    case "area": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const area = value as Record<string, unknown>;
      return (
        typeof area.lat === "number" &&
        typeof area.lng === "number" &&
        typeof area.zoom === "number"
      );
    }
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
  // Prop-name override (docs/entries-view.md): several fields with disjoint
  // showif may emit the same prop — e.g. entryDisplay whose options and
  // default depend on the chosen view. Absent = the field key is the prop.
  prop: z.string().optional(),
  /** For `list`/`view-picker`: value → display label. The value is what the prop stores. */
  options: z.record(z.string(), z.string()).optional(),
  /** For `view-picker`: value → Iconify icon shown on the tile. */
  icons: z.record(z.string(), z.string()).optional(),
  // Choice-driven sibling pre-fills (docs/entries-view.md): picking value V
  // sets each listed sibling to the given value — only when the sibling
  // still holds its default (an author's explicit choice is never clobbered).
  // E.g. choosing the Agenda view pre-fills period: future.
  prefill: z
    .record(z.string(), z.record(z.string(), propValueSchema))
    .optional(),
  // Omission-rule reference (ADR 0013): the prop is dropped from the MDX
  // when equal to this, and an absent prop re-edits with it. Must equal the
  // component's destructuring default (verified by lib/verify-descriptors).
  default: propValueSchema.optional(),
  /** Insertion pre-fill; the prop is always written, even when unchanged. */
  value: propValueSchema.optional(),
  /** For `file-list`: restricts the combobox to one file family. */
  family: z.enum(FILE_FAMILIES).optional(),
  /** For `form-list`/`form-field`: the prop holds one name or an array of names. */
  multiple: z.boolean().optional(),
  // form-field / field-rows (ADR 0018): the sibling field holding the chosen
  // form slug(s) the selectable fields come from. Defaults to "form".
  formFrom: z.string().optional(),
  /** form-field / field-rows: restricts the selectable fields to these types. */
  fieldTypes: z.array(z.enum(FORM_FIELD_TYPES)).optional(),
  /** form-field / field-rows: pseudo-fields offered next to the real fields. */
  pseudoFields: z.array(z.enum(PSEUDO_FIELDS)).optional(),
  /** For `field-rows`: each row also carries an optional icon. */
  withIcon: z.boolean().optional(),
  // color-mapping / icon-mapping: the sibling form-field whose selected
  // field's options are the mapping keys.
  fieldFrom: z.string().optional(),
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

/** What a literal JSX expression can evaluate to (ADR 0019). */
export type LiteralValue =
  | string
  | number
  | boolean
  | null
  | LiteralValue[]
  | { [key: string]: LiteralValue };

/** An array or object literal, the payload of the structured field types. */
export type StructuredValue = LiteralValue[] | { [key: string]: LiteralValue };

/** A prop value carried by a field's `default`/`value` and the generated tag. */
export type PropValue = string | number | boolean | StructuredValue | undefined;
/** Omission-rule defaults keyed by field key, derived from the descriptor. */
export type PropDefaults = Record<string, PropValue>;

/** The prop a field emits: its `prop` override, or the field key itself. */
export function fieldProp(field: string, spec: DescriptorField): string {
  return spec.prop ?? field;
}

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
    if (spec.type === "list" || spec.type === "view-picker") {
      const options = Object.keys(spec.options ?? {});
      const fallback = spec.default;
      if (typeof fallback !== "string" || !options.includes(fallback)) {
        const got = fallback === undefined ? "undefined" : `"${fallback}"`;
        throw new Error(
          `${at(["properties", field, "default"], ["properties", field])}: ${spec.type} field "${field}" needs a default among its options (${options.join(", ")}), got ${got}`
        );
      }
      for (const icon of Object.keys(spec.icons ?? {})) {
        if (!options.includes(icon)) {
          throw new Error(
            `${at(["properties", field, "icons", icon], ["properties", field])}: ${spec.type} field "${field}" declares an icon for unknown option "${icon}"`
          );
        }
      }
      for (const [option, targets] of Object.entries(spec.prefill ?? {})) {
        const where = at(["properties", field, "prefill", option], ["properties", field]);
        if (!options.includes(option)) {
          throw new Error(
            `${where}: ${spec.type} field "${field}" declares a prefill for unknown option "${option}"`
          );
        }
        for (const target of Object.keys(targets)) {
          if (!(target in descriptor.properties)) {
            throw new Error(
              `${where}: prefill of "${field}" targets unknown field "${target}"`
            );
          }
        }
      }
    }
    if (spec.type === "form-field" || spec.type === "field-rows") {
      const source = spec.formFrom ?? "form";
      if (!(source in descriptor.properties)) {
        throw new Error(
          `${at(["properties", field, "formFrom"], ["properties", field])}: ${spec.type} field "${field}" reads its forms from unknown sibling "${source}"`
        );
      }
    }
    if (spec.type === "color-mapping" || spec.type === "icon-mapping") {
      const source = spec.fieldFrom;
      if (source === undefined || !(source in descriptor.properties)) {
        throw new Error(
          `${at(["properties", field, "fieldFrom"], ["properties", field])}: ${spec.type} field "${field}" needs "fieldFrom" pointing at a sibling form-field, got ${source === undefined ? "nothing" : `unknown "${source}"`}`
        );
      }
      if (descriptor.properties[source].type !== "form-field") {
        throw new Error(
          `${at(["properties", field, "fieldFrom"], ["properties", field])}: ${spec.type} field "${field}" points "fieldFrom" at "${source}", which is not a form-field`
        );
      }
    }
  }

  // Aliased fields (same emitted prop) rely on disjoint showif to never be
  // visible together; requiring showif on every alias is the checkable part.
  const carriers = new Map<string, string[]>();
  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    const prop = fieldProp(field, spec);
    carriers.set(prop, [...(carriers.get(prop) ?? []), field]);
  }
  for (const [prop, fields] of carriers) {
    if (fields.length < 2) continue;
    for (const field of fields) {
      if (!descriptor.properties[field].showif) {
        throw new Error(
          `${at(["properties", field], [])}: fields ${fields.map((name) => `"${name}"`).join(", ")} all emit prop "${prop}", so each needs a showif keeping them apart`
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
// builder's required-field guard: unset, blank text, unchecked checkbox and
// bare structured values all count as nothing to show.
export function isEmpty(value: PropValue): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (value !== null && typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return value === undefined || value === "" || value === false;
}

// Deep equality, the omission rule's yardstick now that values may be
// structured (ADR 0019): two literals with the same shape and content are the
// same value, whatever object identity says.
export function sameValue(
  a: LiteralValue | undefined,
  b: LiteralValue | undefined
): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (
    a !== null && typeof a === "object" && !Array.isArray(a) &&
    b !== null && typeof b === "object" && !Array.isArray(b)
  ) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => key in b && sameValue(a[key], b[key]))
    );
  }
  return false;
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
    if (sameValue(value, defaults[field]) && spec.value === undefined) continue;
    if (isEmpty(value) && isEmpty(defaults[field])) continue;
    attributes.push(serializeAttribute(fieldProp(field, spec), value));
  }
  attributes.push(...unknownAttributes);
  const body = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  return `<${name}${body} />`;
}

function serializeAttribute(prop: string, value: PropValue): string {
  // An empty value facing a non-empty default (the only way to get here
  // empty): an explicit empty string, the "cleared" spelling (captionField).
  if (value === undefined) return `${prop}=""`;
  if (value === true) return prop;
  if (typeof value === "string") {
    // Double quotes by default; fall back on single quotes, then on the
    // &quot; entity, so any text stays a plain JSX string attribute.
    if (!value.includes('"')) return `${prop}="${value}"`;
    if (!value.includes("'")) return `${prop}='${value}'`;
    return `${prop}="${value.replaceAll('"', "&quot;")}"`;
  }
  if (value !== null && typeof value === "object") {
    return `${prop}={${serializeLiteral(value)}}`;
  }
  return `${prop}={${JSON.stringify(value)}}`;
}

// The canonical written form of a structured prop (ADR 0019): the literal a
// JS author would write — unquoted identifier keys, spaces inside braces.
// parseLiteral reads this exact form back, the round-trip's other half.
export function serializeLiteral(value: LiteralValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(serializeLiteral).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(
      ([key, item]) =>
        `${/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)}: ${serializeLiteral(item)}`
    );
    return `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value);
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

// Decodes a brace expression when it is a static literal (ADR 0019): the
// values the sandbox itself lets through (lib/mdx-literal-props.ts), parsed
// here from source text since the builder works outside any MDX compilation.
// A top-level `null` reads as "no value" — the prop falls back to its default.
function decodeLiteral(expression: string): { value: PropValue } | null {
  const literal = parseLiteral(expression);
  if (!literal) return null;
  return { value: literal.value === null ? undefined : literal.value };
}

/** Parses a JS literal expression (scalars, arrays, objects). Null when the
 * source is not a pure literal — an identifier, a call, a spread… */
export function parseLiteral(source: string): { value: LiteralValue } | null {
  const parser = new LiteralParser(source);
  const value = parser.parseValue();
  if (value === null) return null;
  parser.skipSpace();
  return parser.atEnd() ? { value: value.value } : null;
}

class LiteralParser {
  private pos = 0;
  constructor(private source: string) {}

  atEnd(): boolean {
    return this.pos >= this.source.length;
  }

  skipSpace(): void {
    while (/\s/.test(this.source[this.pos] ?? "")) this.pos++;
  }

  parseValue(): { value: LiteralValue } | null {
    this.skipSpace();
    const char = this.source[this.pos];
    if (char === undefined) return null;
    if (char === "[") return this.parseArray();
    if (char === "{") return this.parseObject();
    if (char === '"' || char === "'" || char === "`") {
      const text = this.parseString(char);
      return text === null ? null : { value: text };
    }
    if (this.consume("true")) return { value: true };
    if (this.consume("false")) return { value: false };
    if (this.consume("null")) return { value: null };
    const number = this.source
      .slice(this.pos)
      .match(/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (number) {
      this.pos += number[0].length;
      return { value: Number(number[0]) };
    }
    return null;
  }

  // Keywords must not swallow an identifier prefix (`trueish` is no literal).
  private consume(keyword: string): boolean {
    if (!this.source.startsWith(keyword, this.pos)) return false;
    const next = this.source[this.pos + keyword.length];
    if (next !== undefined && /[A-Za-z0-9_$]/.test(next)) return false;
    this.pos += keyword.length;
    return true;
  }

  private parseString(quote: string): string | null {
    this.pos++; // opening quote
    let text = "";
    while (this.pos < this.source.length) {
      const char = this.source[this.pos];
      if (char === quote) {
        this.pos++;
        return text;
      }
      if (char === "\\") {
        const escaped = this.source[this.pos + 1];
        if (escaped === undefined) return null;
        const named: Record<string, string> = { n: "\n", t: "\t", r: "\r" };
        if (escaped === "u") {
          const hex = this.source.slice(this.pos + 2, this.pos + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
          text += String.fromCharCode(parseInt(hex, 16));
          this.pos += 6;
          continue;
        }
        text += named[escaped] ?? escaped;
        this.pos += 2;
        continue;
      }
      // A template hole would be an expression, not a literal.
      if (quote === "`" && char === "$" && this.source[this.pos + 1] === "{") {
        return null;
      }
      text += char;
      this.pos++;
    }
    return null; // unterminated
  }

  private parseArray(): { value: LiteralValue } | null {
    this.pos++; // [
    const items: LiteralValue[] = [];
    for (;;) {
      this.skipSpace();
      if (this.source[this.pos] === "]") {
        this.pos++;
        return { value: items };
      }
      const item = this.parseValue();
      if (!item) return null;
      items.push(item.value);
      this.skipSpace();
      if (this.source[this.pos] === ",") this.pos++;
      else if (this.source[this.pos] !== "]") return null;
    }
  }

  private parseObject(): { value: LiteralValue } | null {
    this.pos++; // {
    const object: Record<string, LiteralValue> = {};
    for (;;) {
      this.skipSpace();
      if (this.source[this.pos] === "}") {
        this.pos++;
        return { value: object };
      }
      const key = this.parseKey();
      if (key === null) return null;
      this.skipSpace();
      if (this.source[this.pos] !== ":") return null;
      this.pos++;
      const item = this.parseValue();
      if (!item) return null;
      object[key] = item.value;
      this.skipSpace();
      if (this.source[this.pos] === ",") this.pos++;
      else if (this.source[this.pos] !== "}") return null;
    }
  }

  private parseKey(): string | null {
    const char = this.source[this.pos];
    if (char === '"' || char === "'") return this.parseString(char);
    const name = this.source.slice(this.pos).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    if (!name) return null;
    this.pos += name[0].length;
    return name[0];
  }
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
// author needed to fix as the only one they could not reach. The rule is
// refined for structured fields (ADR 0019): they parse their literal and
// re-edit it; only a literal their kind cannot hold is dropped the same way.
export function tagToBuilderState(
  descriptor: ComponentDescriptor,
  defaults: PropDefaults,
  tag: ParsedTag
): { values: PropValues; unknownAttributes: string[] } {
  const values: PropValues = { ...defaults };
  const unknownAttributes: string[] = [];

  const carriers = new Map<string, string[]>();
  for (const [field, spec] of Object.entries(descriptor.properties)) {
    if (spec.type === "divider") continue;
    const prop = fieldProp(field, spec);
    carriers.set(prop, [...(carriers.get(prop) ?? []), field]);
  }

  const assign = (field: string, value: PropValue) => {
    const spec = descriptor.properties[field];
    const kind = propKind(spec);
    const structuredValue = value !== null && typeof value === "object";
    const structuredKind =
      kind === "strings" || kind === "rows" || kind === "mapping" || kind === "area";
    // Structured kinds are strict about shape; scalar kinds stay permissive
    // between themselves (the widget shows what it can, the lint reports).
    if ((structuredValue || structuredKind) && !propKindFits(kind, value)) {
      return;
    }
    values[field] = value;
  };

  const aliased: { fields: string[]; value: PropValue }[] = [];
  for (const attribute of tag.attributes) {
    const fields = carriers.get(attribute.name);
    if (!fields) {
      // An unknown prop is carried raw: its expression stays valid JSX, and
      // the builder has no business rewriting what it does not describe.
      unknownAttributes.push(attribute.raw);
      continue;
    }
    if (!attribute.literal) continue;
    if (fields.length === 1) assign(fields[0], attribute.value);
    else aliased.push({ fields, value: attribute.value });
  }

  // An aliased prop belongs to whichever carrier is visible once the plain
  // values are in — the discriminating siblings (e.g. `view`) are plain props,
  // so visibility is already decided by the first pass.
  for (const { fields, value } of aliased) {
    const visible = visibleFields(descriptor, defaults, values);
    const field = fields.find((name) => visible.includes(name)) ?? fields[0];
    assign(field, value);
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
