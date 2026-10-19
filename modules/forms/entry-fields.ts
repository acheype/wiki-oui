// Field choices offered by the EntriesView builder selectors (docs/
// entries-view.md): pure union logic over the chosen forms' descriptors —
// the Server Action resolves data (forms, sourced options), this module
// decides what a field selector shows. No fs, no Prisma, no React.

import { z } from "zod";
import type { FormDescriptor, FormFieldType } from "./form-descriptor";
import { FORM_FIELD_TYPES, isOptionsField } from "./form-descriptor";
import { isTemporalField } from "./temporal-value/formats";
import { PSEUDO_FIELD_LABELS, PSEUDO_FIELDS } from "./pseudo-fields";

export interface EntryFieldChoice {
  name: string;
  /** Label of the first chosen form carrying the field (union rule). */
  label: string;
  type: FormFieldType;
  /** value → label pairs; resolved by the server for form-sourced options. */
  options?: Record<string, string>;
  /** Carrying form names, present only when some chosen forms lack the field. */
  partialTo?: string[];
  /** A Date / heure or Période in Heure mode: a time with no date. */
  timeOnly?: true;
}

/**
 * Union by `name` over the chosen forms (docs/entries-view.md): first-carrier
 * label and type, order of first appearance, and a carrier list when a field
 * is not on every form. An entry whose form lacks the field will simply read
 * empty — the domain's silent rule — so a partial field stays selectable.
 */
export function unionEntryFields(
  forms: { name: string; descriptor: FormDescriptor }[]
): EntryFieldChoice[] {
  const choices = new Map<string, EntryFieldChoice & { carriers: string[] }>();
  for (const form of forms) {
    for (const field of form.descriptor.fields) {
      if (field.type === "customContent") continue; // never a value
      const known = choices.get(field.name);
      if (known) {
        known.carriers.push(form.name);
        continue;
      }
      choices.set(field.name, {
        name: field.name,
        label: field.label || field.name,
        type: field.type,
        options: isOptionsField(field) ? field.options : undefined,
        ...(isTemporalField(field) &&
          field.format === "time" && { timeOnly: true as const }),
        carriers: [form.name],
      });
    }
  }
  return [...choices.values()].map(({ carriers, ...choice }) => ({
    ...choice,
    ...(carriers.length < forms.length ? { partialTo: carriers } : {}),
  }));
}

/**
 * Which fields a form-field / field-rows selector offers. Declared once, in
 * Zod: the component descriptor schema spreads it, and the widget types
 * extend the type inferred from it (docs/entries-view.md).
 */
export const fieldChoiceRestrictionSchema = z.object({
  /** Restricts the selectable fields to these types. */
  fieldTypes: z.array(z.enum(FORM_FIELD_TYPES)).optional(),
  /** Pseudo-fields offered next to the real fields. */
  pseudoFields: z.array(z.enum(PSEUDO_FIELDS)).optional(),
  /** Only the fields carrying a date: Heure mode is left out. */
  dated: z.boolean().optional(),
});

export type FieldChoiceRestriction = z.infer<typeof fieldChoiceRestrictionSchema>;

/** What a field selector displays for one selectable name. */
export interface FieldChoiceOption {
  name: string;
  label: string;
  /** Carrying form names, when the field is partial (shown as a badge). */
  partialTo?: string[];
}

/**
 * The options a form-field / field-rows selector offers: the union fields
 * restricted to the declared types, then the declared pseudo-fields —
 * `$form` only making sense across several forms (docs/entries-view.md).
 */
export function fieldChoiceOptions(
  choices: EntryFieldChoice[],
  restrict: FieldChoiceRestriction,
  multiForm: boolean
): FieldChoiceOption[] {
  const fields = choices
    .filter(
      (choice) =>
        (!restrict.fieldTypes || restrict.fieldTypes.includes(choice.type)) &&
        !(restrict.dated && choice.timeOnly)
    )
    .map(({ name, label, partialTo }) => ({ name, label, partialTo }));
  const pseudo = (restrict.pseudoFields ?? [])
    .filter((name) => name !== "$form" || multiForm)
    .map((name) => ({ name, label: PSEUDO_FIELD_LABELS[name] }));
  return [...fields, ...pseudo];
}

// The automatic color palette (docs/entries-view.md): stable attribution in
// option order, so the same field always wears the same colors — in the
// builder's pre-filled pickers and in the rendered views alike. Hues picked
// for contrast against both light and dark surfaces.
export const AUTO_PALETTE = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#a855f7", // purple
] as const;

/** value → color for a field's options, cycling the palette in order. */
export function autoColorMapping(
  optionValues: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  optionValues.forEach((value, index) => {
    mapping[value] = AUTO_PALETTE[index % AUTO_PALETTE.length];
  });
  return mapping;
}

/** The colors a view renders: the automatic palette under the author's
 * overrides — so the stored prop can stay minimal (overrides only). */
export function resolveColorMapping(
  optionValues: string[],
  overrides: Record<string, string> | undefined
): Record<string, string> {
  return { ...autoColorMapping(optionValues), ...overrides };
}
