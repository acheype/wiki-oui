import type { FormDescriptor } from "@/lib/form-descriptor";
import type { FieldRenameMapping } from "@/lib/field-rename";
import { countFieldCarriers, sweepFieldRenames } from "@/lib/field-rename-db";
import {
  type TitleRecomputeImpact,
  countTitleRecompute,
  sweepEntryTitles,
} from "@/lib/entry-title-db";
import {
  COLD_ADMIN_TRANSACTION_TIMEOUT_MS,
  PUBLIC_IDENTITY,
  currentReadableWhere,
} from "@/lib/pages";
import { currentUsername } from "@/lib/permissions-db";
import { prisma } from "@/lib/prisma";
import type { SlugRename } from "@/lib/slug-rename";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";

// The only door to `Form` (ADR 0025), alongside lib/pages.ts for `Page`. An
// ESLint rule refuses `prisma.form` anywhere else, so the permission checks
// this layer will host cannot be bypassed by a caller that forgot them — the
// risk being a silent read, which no test would ever catch.

export async function getFormBySlug(slug: string) {
  return prisma.form.findUnique({ where: { slug } });
}

export async function getFormById(id: string) {
  return prisma.form.findUnique({ where: { id } });
}

export async function listFormsWithEntryCount() {
  // The count is filtered like the list it heads: a form announcing 40 entries
  // and then showing 12 would be a leak dressed as a bug.
  const readable = await currentReadableWhere();
  return prisma.form.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { entries: { where: readable } } } },
  });
}

/** slug + name of every form, for the pickers that name forms. */
export async function listFormNames() {
  return prisma.form.findMany({
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
}

export async function listFormsBySlugs(slugs: string[]) {
  return prisma.form.findMany({ where: { slug: { in: slugs } } });
}

/**
 * The forms and their entries, newest first — what <EntriesView> reads. It
 * loads in bulk, which is exactly why the filter is a `where` and not a pass
 * afterwards (docs/permissions.md § Deux temps): the counters, the pagination
 * and « effacer les filtres » then come out right mechanically, since they
 * work on what arrived.
 */
export async function listFormsWithEntries(slugs: string[]) {
  return prisma.form.findMany({
    where: { slug: { in: slugs } },
    include: {
      entries: {
        where: await currentReadableWhere(),
        // `owner` feeds the $owner pseudo-field of <EntriesView>: the display
        // name, read live so a rename shows through (ADR 0024).
        include: { current: true, owner: PUBLIC_IDENTITY },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/** The rename dialog's headcount for a form identifier (ADR 0016). */
export async function countFormSlugReferences(
  slug: string,
  referenceProps: ReadonlyMap<string, ReadonlySet<string>>
): Promise<SlugReferenceImpact> {
  return countSlugReferenceImpact(prisma, slug, referenceProps, "form");
}

/** How many of the form's entries carry this field key today (ADR 0017). */
export async function countEntriesCarryingField(
  formId: string,
  fieldName: string
): Promise<number> {
  return countFieldCarriers(prisma, formId, fieldName);
}

/** What a title recompute would touch, against a candidate descriptor. */
export async function countEntryTitleRecompute(
  formId: string,
  descriptor: FormDescriptor
): Promise<TitleRecomputeImpact> {
  return countTitleRecompute(prisma, formId, descriptor);
}

/** What a form save writes: no history (ADR 0014), saving overwrites. */
export interface FormDefinition {
  name: string;
  schema: FormDescriptor;
  template: string | null;
}

/**
 * The sweeps a form save drags along: the staged field renames (ADR 0017)
 * across every revision of the form's entries, and the stored-title recompute
 * (ADR 0020) when the caller found the automatic title affected. Same
 * transaction as the schema overwrite, or nothing happens.
 */
export interface FormSaveSweeps {
  renames: FieldRenameMapping;
  /** The descriptor to recompute titles against, null when none is needed. */
  recomputeTitlesWith: FormDescriptor | null;
}

export async function updateForm(
  formId: string,
  definition: FormDefinition,
  sweeps: FormSaveSweeps
): Promise<void> {
  const actor = await currentUsername();
  await prisma.$transaction(
    async (tx) => {
      await tx.form.update({ where: { id: formId }, data: definition });
      await sweepFieldRenames(tx, formId, sweeps.renames);
      if (sweeps.recomputeTitlesWith) {
        await sweepEntryTitles(tx, formId, sweeps.recomputeTitlesWith, actor);
      }
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}

export async function createForm(
  slug: string,
  definition: FormDefinition
): Promise<void> {
  const ownerUsername = await currentUsername();
  await prisma.form.create({ data: { ...definition, slug, ownerUsername } });
}

/** The form half of what an erasure would leave without an owner. */
export async function countFormsOwnedByAccount(
  username: string
): Promise<number> {
  return prisma.form.count({ where: { ownerUsername: username } });
}

/** The form half of the reassignment the deletion modal offers. */
export async function reassignOwnedForms(
  fromUsername: string,
  toUsername: string
): Promise<void> {
  await prisma.form.updateMany({
    where: { ownerUsername: fromUsername },
    data: { ownerUsername: toUsername },
  });
}

// Cascade (ADR 0014): deleting a form deletes its entry pages.
export async function deleteFormById(id: string): Promise<void> {
  await prisma.form.delete({ where: { id } });
}

/**
 * « Changer l'identifiant » (ADR 0016, form namespace): flips Form.slug and
 * retcons every reference in the same transaction, so the wiki never observes
 * a state where the form answers to the new identifier but references still
 * say the old. Throws on failure — most likely a unique-constraint race.
 */
export async function renameFormSlug(
  formId: string,
  rename: SlugRename,
  referenceProps: ReadonlyMap<string, ReadonlySet<string>>
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.form.update({
        where: { id: formId },
        data: { slug: rename.newSlug },
      });
      await sweepSlugReferences(tx, rename, referenceProps, "form");
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}
