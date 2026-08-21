// A fiche or a page, told apart the one shared way (docs/architecture.md):
// pure predicates over a plain shape, no Prisma or session behind them, so
// this file carries none of the server-only imports modules/pages/queries.ts
// (ADR 0025) does — a Client Component (modules/pages/pages-admin.tsx) can
// call these directly without pulling next/headers into its bundle. Being a
// root file of the module (ADR 0029), it is imported directly wherever it is
// needed — server or client side alike — rather than re-exported through the
// door.

/**
 * A fiche is a Page whose `formId` is set — the one scalar every query
 * carries, whatever else it selects. Reach for this over testing `form`
 * (the loaded relation) directly: a query that never included `form` would
 * see it as `undefined`, not `null`, and read as a plain page regardless of
 * `formId`. A type guard, not a plain boolean, so a caller that goes on to
 * use `page.formId` itself — an `EntryContent` prop, a `getFormById`
 * argument — gets it narrowed from `string | null` to `string` for free,
 * the same way `if (page.formId)` already did before this existed.
 */
export function isEntryPage<T extends { formId: string | null }>(
  page: T
): page is T & { formId: string } {
  return page.formId !== null;
}

/**
 * Narrows `form` from nullable to present, for the few callers that need to
 * read it rather than just branch on isEntryPage(). The check is only ever
 * `formId`, same as isEntryPage() — `form: Form? @relation(..., onDelete:
 * Cascade)` (prisma/schema.prisma) means a Page can never carry a `formId`
 * whose Form is gone, so a `formId` alone already promises a loaded `form`
 * is not null. TypeScript cannot see that database-level guarantee on its
 * own; this is where it is written down for the type checker.
 */
export function hasForm<T extends { formId: string | null; form: unknown }>(
  page: T
): page is T & { formId: string; form: NonNullable<T["form"]> } {
  return page.formId !== null;
}
