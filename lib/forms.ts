import type { FormDescriptor } from "@/lib/form-descriptor";
import type { FieldRenameMapping } from "@/lib/field-rename";
import { sweepFieldRenames } from "@/lib/field-rename-db";
import { sweepEntryTitles } from "@/lib/entry-title-db";
import { prisma } from "@/lib/prisma";
import type { SlugRename } from "@/lib/slug-rename";
import { sweepSlugReferences } from "@/lib/slug-rename-db";

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
  return prisma.form.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { entries: true } } },
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

/** The forms and their entries, newest first — what <EntriesView> reads. */
export async function listFormsWithEntries(slugs: string[]) {
  return prisma.form.findMany({
    where: { slug: { in: slugs } },
    include: {
      entries: { include: { current: true }, orderBy: { createdAt: "desc" } },
    },
  });
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
  recomputeTitles: FormDescriptor | null;
  authorName: string;
}

export async function updateForm(
  formId: string,
  definition: FormDefinition,
  sweeps: FormSaveSweeps
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.form.update({ where: { id: formId }, data: definition });
      await sweepFieldRenames(tx, formId, sweeps.renames);
      if (sweeps.recomputeTitles) {
        await sweepEntryTitles(
          tx,
          formId,
          sweeps.recomputeTitles,
          sweeps.authorName
        );
      }
    },
    // Same cold-admin-action allowance as renameFormSlug below.
    { timeout: 60_000 }
  );
}

export async function createForm(
  slug: string,
  definition: FormDefinition,
  ownerName: string
): Promise<void> {
  await prisma.form.create({ data: { ...definition, slug, ownerName } });
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
    // A large wiki means many rewrites in one sweep; the default 5s is for
    // hot-path transactions, this is a rare cold admin action.
    { timeout: 60_000 }
  );
}
