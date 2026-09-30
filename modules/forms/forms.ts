import type { Prisma } from "@/lib/generated/prisma/client";
import { parseFormDescriptor } from "@/modules/forms/form-descriptor";
import {
  type EntryRightsImpact,
  type FormPermissions,
  bornFormPermissions,
  canCreateEntry,
  formPermissions,
} from "@/modules/permissions/form-level";
import { countFieldCarriers } from "@/modules/forms/field-rename/sweep";
import {
  COLD_ADMIN_TRANSACTION_TIMEOUT_MS,
  WITH_RIGHTS,
} from "@/modules/pages/rights";
import { applyFormDefaultsToEntries, countEntryRightsImpact } from "@/modules/pages/entries";
import {
  currentOwns,
  currentPerson,
  currentReadableWhere,
} from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import type { SlugRename } from "@/lib/slug-rename";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";
import {
  type OwnedForm,
  assertFormStructuringOf,
  editableForm,
} from "@/modules/forms/access/guards";
import { type ReadableForm, readableForm } from "@/modules/permissions/readable-form";
import type { Form } from "@/lib/generated/prisma/client";

// The public subjects of the `Form` access layer (ADR 0025). Private guarded
// reads live in access/guards.ts; save/form.ts owns creation and the complete
// save transaction. The canonical list in lib/access-layer-files.json lets
// ESLint refuse every Prisma import outside that explicit boundary.

/** Whether the system pages offer those permissions at all, or simply leave them out. */
export async function currentCanEditForm(form: OwnedForm): Promise<boolean> {
  return currentOwns(form.ownerUsername);
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

/** The form half of what an erasure would leave without an owner. */
export async function countFormsOwnedByAccount(
  username: string
): Promise<number> {
  return prisma.form.count({ where: { ownerUsername: username } });
}

/** The form half of the reassignment the deletion modal offers. */
export async function reassignOwnedForms(
  fromUsername: string,
  toUsername: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.form.updateMany({
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
