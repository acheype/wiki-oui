// The slugs and labels of the e2e-only fixtures (ADR 0032), the one source both
// the seed (prisma/seed/e2e-fixtures.ts) and the permission specs read. Kept
// here — free of Prisma and descriptor imports — so a spec can name a fixture
// without pulling the seeding code into its bundle.

export const E2E = {
  /** Form whose « créer une fiche » is closed to ordinary users (P1). */
  restrictedForm: "e2e-restreint",
  /** Form with a read-restricted and a write-restricted field (P2). */
  fieldsForm: "e2e-champs",
  /** Fiche readable by all — the control (P4). */
  openEntry: "e2e-fiche-ouverte",
  /** Fiche readable by administrators alone (P3). */
  restrictedEntry: "e2e-fiche-restreinte",
  /** Fiche of the fields form, for the entry-form field cut and the merge (P2). */
  fieldsEntry: "e2e-champs-fiche",
  /** MDX page hosting <EntryForm id="e2e-restreint"> (P1). */
  entryFormPage: "e2e-saisie",
  /** MDX page readable by administrators alone (page read). */
  restrictedPage: "e2e-page-restreinte",
  /** MDX page readable by all, writable by administrators (page write). */
  readOnlyPage: "e2e-page-lecture",

  /** Field only an administrator may read: absent for anyone else. */
  restrictedFieldLabel: "Salaire",
  restrictedFieldName: "salaire",
  /** Field all may read, only an administrator may fill: greyed for the rest. */
  readOnlyFieldLabel: "Note interne",
  readOnlyFieldName: "note",
  openFieldLabel: "Poste",
  openFieldName: "poste",
} as const;
