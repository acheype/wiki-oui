// When a form save invalidates the titles already stored on its entries
// (ADR 0020). Pure logic — the database side lives in entry-title-db.ts.

import {
  type EntryData,
  type FormDescriptor,
  computeAutomaticTitle,
  orderedEntryData,
  withTitleOrdered,
} from "./form-descriptor";

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
 * Two admin permissions invalidate the stored titles: editing the template, and
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

/**
 * The values a restore writes. The restored revision becomes the *current*
 * state, so it follows the form's *current* definition (ADR 0020): an
 * automatic title is recomputed rather than copied back.
 *
 * `titleKept` reports the one case that betrays the rule — the gabarit
 * computes to nothing, so the archived title survives and the entry ends up
 * current with a title its form would not produce. Keeping it is what stops
 * a stale entry from blocking a restore outright; saying so is the caller's
 * job.
 */
export function restoredEntryValues(
  descriptor: FormDescriptor,
  values: EntryData
): { values: EntryData; titleKept: boolean } {
  const title = computeAutomaticTitle(descriptor, values);
  return title.trim() === ""
    ? { values: orderedEntryData(descriptor, values), titleKept: true }
    : { values: withTitleOrdered(descriptor, values, title), titleKept: false };
}
