import { type FormDescriptor, parseFormDescriptor } from "@/modules/forms/form-descriptor";
import {
  type EntryRightsImpact,
  type FormPermissions,
  bornFormPermissions,
  canCreateEntry,
  formPermissions,
} from "@/modules/permissions/form-level";
import type { FieldRenameMapping } from "@/modules/forms/field-rename/rules";
import { countFieldCarriers, sweepFieldRenames } from "@/modules/forms/field-rename/sweep";
import {
  type TitleRecomputeImpact,
  countTitleRecompute,
  sweepEntryTitles,
} from "@/modules/forms/entry-title/sweep";
import {
  COLD_ADMIN_TRANSACTION_TIMEOUT_MS,
  WITH_RIGHTS,
} from "@/modules/pages/rights";
import { applyFormDefaultsToEntries, countEntryRightsImpact } from "@/modules/pages/entries";
import { refuse } from "@/modules/permissions/rules";
import {
  currentAllows,
  currentOwns,
  currentPerson,
  currentReadableWhere,
  currentUsername,
} from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import type { SlugRename } from "@/lib/slug-rename";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";
import { wikiConfig } from "@/wiki.config";
import {
  type OwnedForm,
  assertFormStructuringOf,
  editableForm,
} from "@/modules/forms/access/guards";
import { type ReadableForm, readableForm } from "@/modules/permissions/readable-form";
import type { Form } from "@/lib/generated/prisma/client";

// The public half of the access layer of `Form` (ADR 0025), alongside
// modules/pages/access/guards.ts for
// `Page`. An ESLint rule refuses `prisma.form` anywhere else, so the
// permission checks this layer hosts cannot be bypassed by a caller that
// forgot them — the risk being a silent read, which no test would ever catch.
//
// Split at the access layer like modules/pages/ was (ADR 0029): this file is the
// public API, modules/forms/access/guards.ts holds the guards and the reads
// nothing outside the module needs. Where Page had to split into four
// subjects, this one was small enough to stay a single file.

/** Whether the system pages offer those permissions at all, or simply leave them out. */
export async function currentCanEditForm(form: OwnedForm): Promise<boolean> {
  return currentOwns(form.ownerUsername);
}

/**
 * Creating a form reads the wiki's own rule, the twin of currentCanCreatePage
 * on the other side of the access layer (docs/permissions.md § Où s'appliquent les
 * droits). Distinct from createPage because the two acts differ in reach: a
 * page engages a page, a form shapes every fiche written with it and takes
 * them all with it when it goes (ADR 0014).
 *
 * Posed on the wiki, so there is no owner under the rule — a « seulement »
 * with an empty list, which the shipped configuration writes, means the
 * administrators alone.
 */
export async function currentCanCreateForm(): Promise<boolean> {
  return currentAllows(wikiConfig.permissions.createForm);
}

/**
 * The three rules a form poses today (docs/permissions.md § Formulaire). Read
 * back through the descriptor engine, so a form saved before the « Accès »
 * tab existed answers with the wiki's own defaults rather than with nothing.
 */
export function permissionsOf(form: { schema: unknown }): FormPermissions {
  const parsed = parseFormDescriptor(form.schema);
  // A descriptor this engine can no longer read is not a form without rights:
  // it answers with what it would have been born with, rather than with
  // nothing at all — which no scope could stand for.
  return parsed.descriptor
    ? formPermissions(parsed.descriptor)
    : bornFormPermissions();
}

/**
 * A form read for showing: its definition already cut to what this person may
 * see (docs/permissions.md § Champ), so that no caller has to remember the cut
 * — the mistake this ticket exists to make unwritable.
 *
 * `seen` is null when the stored descriptor no longer parses. What to do about
 * that is the caller's own: the fiche renders nothing, the history falls back
 * on the raw snapshot, the entry form throws so the mistake is loud.
 */
export type SeenForm = Form & { seen: ReadableForm | null };

/** The form a fiche, a history or a field picker names, by identifier. */
export async function readableFormBySlug(slug: string): Promise<SeenForm | null> {
  const form = await prisma.form.findUnique({ where: { slug } });
  return form && { ...form, seen: await readableForm(form.schema) };
}

/** The same read from the technical id a fiche carries (Page.formId). */
export async function readableFormById(id: string): Promise<SeenForm | null> {
  const form = await prisma.form.findUnique({ where: { id } });
  return form && { ...form, seen: await readableForm(form.schema) };
}

/** Whether the person may add a fiche to this form — what the entry form asks. */
export async function currentCanCreateEntry(form: {
  schema: unknown;
}): Promise<boolean> {
  return canCreateEntry(await currentPerson(), permissionsOf(form));
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
        // name, read live so a rename shows through (ADR 0024). The rights
        // ride along because the Tableau offers a action on each row, and
        // an offer nobody can take up informs nobody.
        include: { current: true, ...WITH_RIGHTS },
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
  await assertFormStructuringOf(formId);
  const person = await currentUsername();
  await prisma.$transaction(
    async (tx) => {
      await tx.form.update({ where: { id: formId }, data: definition });
      await sweepFieldRenames(tx, formId, sweeps.renames);
      if (sweeps.recomputeTitlesWith) {
        await sweepEntryTitles(tx, formId, sweeps.recomputeTitlesWith, person);
      }
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}

/**
 * The creator owns what they made, which is what makes the rung above
 * coherent: opening the creation to someone opens the editing of theirs, and
 * of nothing else.
 */
export async function createForm(
  slug: string,
  definition: FormDefinition
): Promise<void> {
  if (!(await currentCanCreateForm())) refuse("createForm");
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

// --- applying the defaults to the fiches already there -----------------------

// The one path from a form's defaults to the fiches already written with it
// (ADR 0026): the copy made at creation is never a link, so nothing else
// reaches them. The rules travel in rather than being read back, because the
// tab poses them and the save carries them in the same action.

export async function countFormDefaults(
  slug: string,
  permissions: FormPermissions
): Promise<EntryRightsImpact | null> {
  const form = await editableForm(slug);
  if (!form) return null;
  return countEntryRightsImpact(form.id, permissions);
}

export async function applyFormDefaults(
  slug: string,
  permissions: FormPermissions
): Promise<void> {
  const form = await editableForm(slug);
  if (!form) throw new Error("Ce formulaire n'existe plus.");
  await applyFormDefaultsToEntries(form.id, permissions);
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
  await assertFormStructuringOf(formId);
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
