// An entry value as plain display text (docs/forms.md): the text the entry
// template and the automatic title substitute for a {champ}. Kept apart from
// form-descriptor.ts so the temporal formatting it reaches never imports back.

import type { FormField } from "../form-descriptor";
import { formatTemporalValue } from "../temporal-value";
import { isTemporalType } from "../temporal-value/formats";

// A single entry value as plain display text: absent → "", multiple → joined,
// a structured value (geolocation point) → "" (rendered elsewhere).
export function valueToText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return "";
  return String(value);
}

/** A field's value as display text: a Date / heure or Période in French. */
export function fieldValueText(
  field: FormField | undefined,
  value: unknown
): string {
  return field && isTemporalType(field.type)
    ? formatTemporalValue(value)
    : valueToText(value);
}
