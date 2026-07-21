// When a form save invalidates the titles already stored on its entries
// (ADR 0020). Pure logic — the database side lives in entry-title-db.ts.

import type { FormDescriptor } from "./form-descriptor";

interface TitleMode {
  automatic: boolean;
  template: string;
}

function titleMode(descriptor: FormDescriptor): TitleMode {
  const field = descriptor.fields.find((item) => item.type === "title");
  return field?.type === "title"
    ? { automatic: field.automatic === true, template: field.template ?? "" }
    : { automatic: false, template: "" };
}

/**
 * Two admin gestures invalidate the stored titles: editing the template, and
 * switching the title to automatic. Switching it back to manual does not —
 * the last computed title simply becomes an editable value, already
 * prefilled by initialEntryValues.
 *
 * A field rename is not one of them: the template and the data keys move
 * together (ADR 0017), so every title computes to exactly what it did.
 */
export function titleRecomputeNeeded(
  before: FormDescriptor,
  after: FormDescriptor
): boolean {
  const from = titleMode(before);
  const to = titleMode(after);
  if (!to.automatic) return false;
  return !from.automatic || from.template !== to.template;
}
