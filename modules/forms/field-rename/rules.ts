import {
  type EntryData,
  type FormField,
  extractFieldReferences,
  fieldReferencePattern,
} from "@/modules/forms/form-descriptor";

// The pure side of a field-identifier rename (ADR 0017): staged in the
// FormBuilder, applied at save. Every rewrite takes the whole mapping
// (persisted name → new name) and applies it in a single pass, so crossed
// swaps (a↔b) stay correct.

export interface FieldRename {
  from: string;
  to: string;
}

export type FieldRenameMapping = ReadonlyMap<string, string>;

/** The renames as a mapping, identity pairs dropped. */
export function fieldRenameMapping(renames: FieldRename[]): Map<string, string> {
  return new Map(
    renames.filter(({ from, to }) => from !== to).map(({ from, to }) => [from, to])
  );
}

/** An entry snapshot with its keys renamed; null when untouched. */
export function renameDataKeys(
  data: EntryData,
  mapping: FieldRenameMapping
): EntryData | null {
  let changed = false;
  const renamed: EntryData = {};
  for (const [key, value] of Object.entries(data)) {
    const target = mapping.get(key) ?? key;
    if (target !== key) changed = true;
    renamed[target] = value;
  }
  return changed ? renamed : null;
}

/** A text with its {champ} references renamed; null when untouched. */
export function renameFieldReferences(
  text: string,
  mapping: FieldRenameMapping
): string | null {
  let changed = false;
  const renamed = text.replace(
    fieldReferencePattern(),
    (reference, name: string) => {
      const target = mapping.get(name);
      if (target === undefined) return reference;
      changed = true;
      return `{${target}}`;
    }
  );
  return changed ? renamed : null;
}

// The geolocation props that bind sibling address fields by name
// (form-descriptor schema).
const GEOLOCATION_BINDINGS = [
  "streetField",
  "street1Field",
  "street2Field",
  "postalCodeField",
  "townField",
  "countyField",
  "stateField",
] as const;

/**
 * A field with everything aimed at a renamed name updated: its own name,
 * geolocation address bindings, the automatic-title template. Null when
 * untouched. Generic over the field shape so the FormBuilder can rewrite its
 * canvas fields without losing their bookkeeping. The title field's name is
 * the literal `title` and never renames (ADR 0017).
 */
export function renameFieldBindings<F extends FormField>(
  field: F,
  mapping: FieldRenameMapping
): F | null {
  const patch: Record<string, string> = {};
  const name = mapping.get(field.name);
  if (name !== undefined && field.type !== "title") patch.name = name;
  if (field.type === "geolocation") {
    for (const binding of GEOLOCATION_BINDINGS) {
      const bound = field[binding];
      const target = bound === undefined ? undefined : mapping.get(bound);
      if (target !== undefined) patch[binding] = target;
    }
  }
  if (field.type === "title" && field.template !== undefined) {
    const template = renameFieldReferences(field.template, mapping);
    if (template !== null) patch.template = template;
  }
  return Object.keys(patch).length > 0 ? ({ ...field, ...patch } as F) : null;
}

/** What a rename would rewrite besides the entries, for the dialog's impact. */
export interface FieldReferenceCounts {
  /** In the form definition: geolocation bindings + automatic-title template. */
  schema: number;
  /** {champ} references in the entry template. */
  template: number;
}

/** How many references aim at the name across the builder's local state. */
export function countFieldReferenceUses(
  fields: FormField[],
  template: string,
  name: string
): FieldReferenceCounts {
  let schema = 0;
  for (const field of fields) {
    if (field.type === "geolocation") {
      for (const binding of GEOLOCATION_BINDINGS) {
        if (field[binding] === name) schema += 1;
      }
    }
    if (field.type === "title" && field.template !== undefined) {
      schema += countReferences(field.template, name);
    }
  }
  return { schema, template: countReferences(template, name) };
}

function countReferences(text: string, name: string): number {
  return extractFieldReferences(text).filter((reference) => reference === name)
    .length;
}
