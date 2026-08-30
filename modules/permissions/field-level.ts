// What one field of a form decides about who sees it and who fills it
// (docs/permissions.md § Champ : la fusion, et deux fuites colmatées). Pure,
// like permissions.ts and form-rights.ts next door: the settings panel poses
// the two rules, the views read them back to know what to leave out, and
// the write applies the second one again on the server — where it is the only
// application that counts.
//
// This is the second of the two moments (docs/permissions.md § Deux temps):
// SQL says which pages, memory says which fields inside them. It is
// irreducibly in memory, the rights of a field living in `Form.schema`, which
// is JSON no `where` clause reaches.

import type {
  EntryData,
  FormDescriptor,
  FormField,
} from "@/modules/forms/form-descriptor";
import type { AccessRule, Person } from "@/modules/permissions/rules";
import { isAdmin, ruleAllows } from "@/modules/permissions/decide/rules";

/** What an unposed rule stands for: a field is open until one says otherwise. */
const UNRESTRICTED: AccessRule = { scope: "everyone" };

export function fieldReadRule(field: FormField): AccessRule {
  return field.readAcl ?? UNRESTRICTED;
}

export function fieldWriteRule(field: FormField): AccessRule {
  return field.writeAcl ?? UNRESTRICTED;
}

export function canReadField(person: Person, field: FormField): boolean {
  return isAdmin(person) || ruleAllows(person, fieldReadRule(field));
}

/**
 * Reading comes first here, where on a page writing implies reading (docs/
 * permissions.md § Le droit) — the two rules are not posed on the same footing.
 * A page carries both of its own; a field carries neither until an author
 * writes one, and an unwritten rule means « rien de plus que ce que la fiche
 * demande déjà ». Read the other way round, an unposed writing would answer
 * « tout le monde », and that answer — through « écrire implique lire » —
 * would hand back every field whose reading had just been closed. The
 * restriction that was posed has to be the one that decides, so writing is
 * what reading opens: « on ne remplit pas ce qu'on ne voit pas ».
 */
export function canWriteField(person: Person, field: FormField): boolean {
  if (isAdmin(person)) return true;
  return (
    canReadField(person, field) && ruleAllows(person, fieldWriteRule(field))
  );
}

/**
 * The form as this person may see it. A field they cannot read is **absent** —
 * from the entry form, from the rendered fiche, and from the zones, filters
 * and sorts of the entry views — rather than shown empty, which would read as
 * a fiche someone forgot to fill in.
 */
export function readableDescriptor(
  person: Person,
  descriptor: FormDescriptor
): FormDescriptor {
  return {
    ...descriptor,
    fields: descriptor.fields.filter((field) => canReadField(person, field)),
  };
}

/** The same cut, for deriving the schema a save is allowed to move. */
export function writableDescriptor(
  person: Person,
  descriptor: FormDescriptor
): FormDescriptor {
  return {
    ...descriptor,
    fields: descriptor.fields.filter((field) => canWriteField(person, field)),
  };
}

/**
 * The fields shown greyed with their motif: readable, and not fillable. Making
 * them disappear instead would leave the fiche looking incomplete
 * (docs/permissions.md § Ce que voit qui n'a pas le droit) — where a greyed
 * field says both that there is something there and that it is not yours.
 */
export function readOnlyFields(
  person: Person,
  descriptor: FormDescriptor
): FormField[] {
  return descriptor.fields.filter(
    (field) => canReadField(person, field) && !canWriteField(person, field)
  );
}

/**
 * A snapshot as this person may read it. A value whose field has gone from the
 * descriptor is kept: no rule was ever posed on it, and the old snapshots
 * carry such values by design (docs/forms.md) — deciding against it here would
 * be inventing a verdict.
 */
export function readableEntryData(
  person: Person,
  descriptor: FormDescriptor,
  data: EntryData
): EntryData {
  const hidden = new Set(
    descriptor.fields
      .filter((field) => !canReadField(person, field))
      .map((field) => field.name)
  );
  return Object.fromEntries(
    Object.entries(data).filter(([name]) => !hidden.has(name))
  );
}

/**
 * What a save writes: the current revision, with only the fields this person
 * may write laid over it (docs/permissions.md § Champ). A revision stores a
 * **complete** snapshot, so a client that never received a field would erase
 * it by sending back what it holds — the merge is what keeps someone who
 * cannot see a salary from destroying it by saving the fiche.
 *
 * What the client sends on the other fields is **ignored, not refused**: a
 * mere difference of rights must never be what makes a save fail. At a
 * fiche's creation the base is empty, and the same rule applies — a field the
 * author may not fill is born empty rather than born with what a forged
 * payload said.
 */
export function mergedEntryData(
  person: Person,
  descriptor: FormDescriptor,
  current: EntryData,
  submitted: EntryData
): EntryData {
  const merged: EntryData = { ...current };
  for (const field of descriptor.fields) {
    if (!canWriteField(person, field)) continue;
    if (!(field.name in submitted)) continue;
    merged[field.name] = submitted[field.name];
  }
  return merged;
}
