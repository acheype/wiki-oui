import { type FormDescriptor, parseFormDescriptor } from "@/lib/form-descriptor";
import {
  type EntryRightsImpact,
  type FormPermissions,
  bornFormPermissions,
  canCreateEntry,
  formPermissions,
} from "@/lib/form-rights";
import type { FieldRenameMapping } from "@/lib/field-rename";
import { countFieldCarriers, sweepFieldRenames } from "@/lib/field-rename-db";
import {
  type TitleRecomputeImpact,
  countTitleRecompute,
  sweepEntryTitles,
} from "@/lib/entry-title-db";
import {
  COLD_ADMIN_TRANSACTION_TIMEOUT_MS,
  WITH_RIGHTS,
  applyFormDefaultsToEntries,
  countEntryRightsImpact,
  currentReadableWhere,
} from "@/lib/pages";
import {
  CREATE_FORM_REFUSED,
  FORM_EDIT_REFUSED,
  isAdmin,
  ownsSubject,
  ruleAllows,
} from "@/lib/permissions";
import { currentActor, currentUsername } from "@/lib/permissions-db";
import { prisma } from "@/lib/prisma";
import type { SlugRename } from "@/lib/slug-rename";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";
import { wikiConfig } from "@/wiki.config";

// The only door to `Form` (ADR 0025), alongside lib/pages.ts for `Page`. An
// ESLint rule refuses `prisma.form` anywhere else, so the permission checks
// this layer will host cannot be bypassed by a caller that forgot them — the
// risk being a silent read, which no test would ever catch.

/** What deciding on a form's definition needs, and nothing more. */
type OwnedForm = { ownerUsername: string | null };

/**
 * The rung the permissions on a form's definition stop at: its owner, or an
 * administrator (docs/permissions.md § Droits au niveau du formulaire). The
 * same rule as on a page, posed on the other subject — editing a form reaches
 * every fiche ever written with it, so it never opens with the writing.
 */
async function assertFormStructuring(form: OwnedForm): Promise<void> {
  if (ownsSubject(await currentActor(), form.ownerUsername)) return;
  throw new Error(FORM_EDIT_REFUSED);
}

/** Whether the screens offer those permissions at all, or simply leave them out. */
export async function actorCanEditForm(form: OwnedForm): Promise<boolean> {
  return ownsSubject(await currentActor(), form.ownerUsername);
}

/**
 * Creating a form reads the wiki's own rule, the twin of actorCanCreatePage
 * on the other side of the door (docs/permissions.md § Où s'appliquent les
 * droits). Distinct from createPage because the two acts differ in reach: a
 * page engages a page, a form shapes every fiche written with it and takes
 * them all with it when it goes (ADR 0014).
 *
 * Posed on the wiki, so there is no owner under the rule — a « seulement »
 * with an empty list, which the shipped configuration writes, means the
 * administrators alone.
 */
export async function actorCanCreateForm(): Promise<boolean> {
  const actor = await currentActor();
  return isAdmin(actor) || ruleAllows(actor, wikiConfig.permissions.createForm);
}

/** The same read, from the identifier a screen holds. */
async function ownerOf(formId: string): Promise<OwnedForm> {
  return prisma.form.findUniqueOrThrow({
    where: { id: formId },
    select: { ownerUsername: true },
  });
}

export async function getFormBySlug(slug: string) {
  return prisma.form.findUnique({ where: { slug } });
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

/** Whether the actor may add a fiche to this form — what the entry form asks. */
export async function actorCanCreateEntry(form: {
  schema: unknown;
}): Promise<boolean> {
  return canCreateEntry(await currentActor(), permissionsOf(form));
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
  await assertFormStructuring(await ownerOf(formId));
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

/**
 * The creator owns what they made, which is what makes the rung above
 * coherent: opening the creation to someone opens the editing of theirs, and
 * of nothing else.
 */
export async function createForm(
  slug: string,
  definition: FormDefinition
): Promise<void> {
  if (!(await actorCanCreateForm())) throw new Error(CREATE_FORM_REFUSED);
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

// Cascade (ADR 0014): deleting a form deletes its entry pages — which is why
// it stops at the same rung as editing the definition, and not at the writing.
export async function deleteFormById(id: string): Promise<void> {
  await assertFormStructuring(await ownerOf(id));
  await prisma.form.delete({ where: { id } });
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
  const form = await getFormBySlug(slug);
  if (!form) return null;
  await assertFormStructuring(form);
  return countEntryRightsImpact(form.id, permissions);
}

export async function applyFormDefaults(
  slug: string,
  permissions: FormPermissions
): Promise<void> {
  const form = await getFormBySlug(slug);
  if (!form) throw new Error("Ce formulaire n'existe plus.");
  await assertFormStructuring(form);
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
  await assertFormStructuring(await ownerOf(formId));
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
