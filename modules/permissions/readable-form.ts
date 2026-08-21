// The database side of the field rules (docs/permissions.md § Champ): who is
// acting, and the cuts that follow from it. The rules themselves are pure and
// live next door in field-rights.ts — the pairing this project uses throughout
// (permissions, slug-rename, field-rename, entry-title).
//
// Five screens read a form to show it: the fiche, its history, the entry form,
// the entry views and their field pickers. Each of them wants the same thing
// said once — the descriptor as this person may see it — so it is said here,
// with the person resolved rather than passed in (ADR 0025): an argument can be
// forgotten, and a forgotten person reads as a visitor, which is the one
// mistake that fails open.

import {
  readOnlyFields,
  readableDescriptor,
  readableEntryData,
} from "@/modules/permissions/field-level";
import {
  type EntryData,
  type FormDescriptor,
  type FormField,
  parseFormDescriptor,
  readEntryData,
} from "@/lib/form-descriptor";
import { currentPerson } from "@/modules/permissions/person";

/**
 * A form's definition as the current person may see it. The whole descriptor
 * rides along because two readers need the fields that were cut: a gabarit,
 * which must go on knowing a `{salaire}` it will render as the empty string,
 * and the write, which decides on fields it never showed.
 */
export interface ReadableForm {
  /** Every field, as the form was saved. */
  whole: FormDescriptor;
  /** The same, minus the fields this person may not read. */
  readable: FormDescriptor;
  /** Their names, for a payload assembled value by value. */
  readableNames: ReadonlySet<string>;
  /** The fields shown greyed: readable, and not fillable. */
  readOnly: FormField[];
  /** A stored snapshot with the unreadable values dropped. */
  readableValues: (data: unknown) => EntryData;
}

/**
 * Null when the descriptor cannot be parsed: what to do about a form this
 * engine can no longer read is the caller's own — the fiche renders nothing,
 * the history falls back on the raw snapshot, the builder throws so the
 * mistake is loud (getForm's rule).
 */
export async function readableForm(
  schema: unknown
): Promise<ReadableForm | null> {
  const parsed = parseFormDescriptor(schema);
  if (!parsed.descriptor) return null;
  const whole = parsed.descriptor;
  const person = await currentPerson();
  const readable = readableDescriptor(person, whole);
  return {
    whole,
    readable,
    readableNames: new Set(readable.fields.map((field) => field.name)),
    readOnly: readOnlyFields(person, readable),
    readableValues: (data) => readableEntryData(person, whole, readEntryData(data)),
  };
}
