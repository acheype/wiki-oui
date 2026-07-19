// Pseudo-fields (docs/entries-view.md): synthetic entry fields offered next
// to the real ones in the EntriesView builder, prefixed `$` so they can never
// collide with a form field `name` (SLUG_PATTERN forbids `$`). Each one reads
// from Page/Revision metadata instead of the entry's data snapshot.

export const PSEUDO_FIELDS = [
  "$form",
  "$owner",
  "$createdAt",
  "$editedAt",
] as const;

export type PseudoField = (typeof PSEUDO_FIELDS)[number];

/** French labels, shown wherever a field selector offers pseudo-fields. */
export const PSEUDO_FIELD_LABELS: Record<PseudoField, string> = {
  $form: "Formulaire",
  $owner: "Auteur",
  $createdAt: "Date de création",
  $editedAt: "Dernière modification",
};

export function isPseudoField(name: string): name is PseudoField {
  return (PSEUDO_FIELDS as readonly string[]).includes(name);
}

/** The pseudo-fields carrying a date value (usable as period/sort dates). */
export const DATE_PSEUDO_FIELDS: readonly PseudoField[] = [
  "$createdAt",
  "$editedAt",
];
