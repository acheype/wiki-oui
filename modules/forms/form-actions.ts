"use server";

// Server Actions of the form-administration system pages (ADR 0014): the admin
// components are client-side and read their data through actions too — same
// transport as mutations, no URL. Validation happens here with the same
// engine the FormBuilder uses client-side (modules/forms/form-descriptor).
// The fiches a form holds answer next door, in entry-actions.ts.

import { revalidatePath } from "next/cache";
import type { Form } from "@/lib/generated/prisma/client";
import {
  type FormDescriptor,
  type FormDescriptorIssue,
  formAuthoringIssues,
  parseFormDescriptor,
  unknownFieldReferences,
} from "@/modules/forms/form-descriptor";
import { loadComponentBuilders } from "@/modules/authoring/descriptors";
import { type FieldRename, fieldRenameMapping } from "@/modules/forms/field-rename/rules";
import { titleRecomputeNeeded } from "@/modules/forms/entry-title";
import type { TitleRecomputeImpact } from "@/modules/forms/entry-title/sweep";
import {
  type EntryRightsImpact,
  type FormPermissions,
  bornFormPermissions,
} from "@/modules/permissions/form-level";
import {
  currentCanCreateEntry,
  currentCanCreateForm,
  currentCanEditForm,
  applyFormDefaults,
  countEntriesCarryingField,
  countEntryTitleRecompute,
  countFormDefaults,
  countFormSlugReferences,
  createForm,
  permissionsOf,
  renameFormSlug,
  updateForm,
} from "@/modules/forms/forms";
import {
  canEditForm,
  deleteFormBySlug,
  editableForm,
  formSlugExists,
  listFormNames,
  listFormsWithEntryCount,
  structuredForm,
} from "@/modules/forms/access/guards";
import { listDirectory } from "@/modules/permissions/groups-directory";
import {
  type AclDirectory,
  refusalMessage,
} from "@/modules/permissions/rules";
import { isValidSlug } from "@/lib/slug";
import { type SlugRename, formReferenceProps } from "@/lib/slug-rename";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";

export interface FormSummary {
  slug: string;
  name: string;
  entryCount: number;
  createdAt: Date;
  /** Whether the row offers « Éditer » and « Supprimer » at all. */
  canEdit: boolean;
  /** And « Nouvelle fiche » — the form's own rule, not the wiki's. */
  canCreateEntry: boolean;
}

export async function listForms(): Promise<FormSummary[]> {
  const forms = await listFormsWithEntryCount();
  // An offer nobody can take up informs nobody (docs/permissions.md § Ce que
  // voit qui n'a pas le droit): the row shows the permissions it has, and leaves
  // the others out rather than greying them.
  return Promise.all(
    forms.map(async (form) => ({
      slug: form.slug,
      name: form.name,
      entryCount: form._count.entries,
      createdAt: form.createdAt,
      canEdit: await currentCanEditForm(form),
      canCreateEntry: await currentCanCreateEntry(form),
    }))
  );
}

export interface FormDetail {
  slug: string;
  name: string;
  schema: FormDescriptor;
  template: string | null;
  /** The « Accès » tab's three settings, the wiki's own for an old form. */
  permissions: FormPermissions;
}

/**
 * What the builder mounts on. Refused to anyone but the owner and the
 * administrators — the definition names its restricted fields, so reporting
 * the right instead of applying it published exactly what the right protects.
 */
export async function getForm(slug: string): Promise<FormDetail | null> {
  const form = await editableForm(slug);
  if (!form) return null;
  const parsed = parseFormDescriptor(form.schema);
  if (!parsed.descriptor) {
    // A stored descriptor only gets in through saveForm: reaching this means
    // the vocabulary shrank since. Fail loud rather than render a lie.
    throw new Error(
      `Descripteur invalide en base pour le formulaire «\u00A0${slug}\u00A0»`
    );
  }
  return {
    slug: form.slug,
    name: form.name,
    schema: parsed.descriptor,
    template: form.template,
    permissions: permissionsOf(form),
  };
}

/**
 * Who the « Accès » tab's lists may name. Read only once the person is known
 * to have business posing a right — the whole membership of the wiki is not a
 * visitor's affair, and a form nobody may edit needs no picker at all.
 */
export async function listRightsDirectory(
  formSlug: string | null
): Promise<AclDirectory> {
  // A form being created has no owner yet to hang the editing rung on, so the
  // rung the act itself stops at answers for it: whoever may not create a form
  // has no business reading the wiki's membership either.
  const allowed = formSlug
    ? await canEditForm(formSlug)
    : await currentCanCreateForm();
  return allowed ? listDirectory() : { people: [], groups: [] };
}

/** Whether the system pages offer « Nouveau formulaire » at all. */
export async function canAddForm(): Promise<boolean> {
  return currentCanCreateForm();
}

/**
 * Applying a form's defaults to the fiches already there (docs/permissions.md
 * § Défauts), both halves. The rules counted against are the ones the tab
 * shows, not the ones in base: the confirmation leads to a save, so what it
 * announces is what the form is about to hold. Null when the form has gone, or
 * when the person may not edit it — the button was not on offer either way.
 */
export type EntryDefaultsCount =
  | { error: string }
  | { impact: EntryRightsImpact | null };

export async function countEntryDefaults(
  formSlug: string,
  permissions: FormPermissions
): Promise<EntryDefaultsCount> {
  try {
    return { impact: await countFormDefaults(formSlug, permissions) };
  } catch (error) {
    // The refusal travels as a value, and as itself: a right that went away
    // between opening the builder and clicking must not be reported as a form
    // that no longer exists — `impact: null` is that other ending.
    return { error: refusalMessage(error) };
  }
}

export async function applyEntryDefaults(
  formSlug: string,
  permissions: FormPermissions
): Promise<{ error: string } | void> {
  try {
    await applyFormDefaults(formSlug, permissions);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  // A fiche whose read scope just closed has to leave the menus and the lists
  // of whoever no longer sees it: the whole tree, like a save.
  revalidatePath("/", "layout");
}

export interface SaveFormInput {
  slug: string;
  name: string;
  schema: unknown;
  template: string | null;
  /** True from the ?nouveau view: refuses to overwrite an existing slug. */
  isNew: boolean;
  /** Staged field-identifier renames (ADR 0017): persisted name → new name. */
  renames?: FieldRename[];
}

export type SaveFormResult =
  | { ok: true }
  | { ok: false; issues: FormDescriptorIssue[] };

export async function saveForm(input: SaveFormInput): Promise<SaveFormResult> {
  const issues: FormDescriptorIssue[] = [];

  if (input.name.trim() === "") {
    issues.push({ message: "Le nom du formulaire est obligatoire." });
  }
  if (!isValidSlug(input.slug)) {
    issues.push({
      message: `Identifiant invalide : «\u00A0${input.slug}\u00A0» (minuscules, chiffres et tirets).`,
    });
  }

  const renames = fieldRenameMapping(input.renames ?? []);
  const parsed = parseFormDescriptor(input.schema);
  if (parsed.issues) {
    issues.push(...parsed.issues);
  } else {
    issues.push(...formAuthoringIssues(parsed.descriptor));
    const template = input.template ?? "";
    for (const name of unknownFieldReferences(template, parsed.descriptor)) {
      issues.push({
        message: `Le gabarit référence un champ inconnu : «\u00A0${name}\u00A0».`,
      });
    }
    // The schema arrives already rewritten from the canvas (ADR 0017): every
    // rename must land on a field of the saved descriptor.
    const names = new Set(parsed.descriptor.fields.map((field) => field.name));
    for (const [from, to] of renames) {
      if (!names.has(to)) {
        issues.push({
          message: `Le renommage «\u00A0${from} → ${to}\u00A0» ne vise aucun champ du formulaire.`,
        });
      }
    }
  }

  // Two questions, two rungs. A new identifier only has to be free, which
  // answers to nobody; an existing one is about to be overwritten, which is
  // its owner's rung — so the definition is read through the gate that refuses
  // rather than probed and checked afterwards.
  let existing: Form | null = null;
  if (issues.length === 0) {
    if (input.isNew) {
      if (await formSlugExists(input.slug)) {
        issues.push({
          message: `L'identifiant «\u00A0${input.slug}\u00A0» est déjà pris par un autre formulaire.`,
        });
      }
    } else {
      try {
        existing = await editableForm(input.slug);
      } catch (error) {
        return { ok: false, issues: [{ message: refusalMessage(error) }] };
      }
      if (!existing) issues.push({ message: "Ce formulaire n'existe plus." });
    }
  }

  if (issues.length > 0 || !parsed.descriptor) {
    return { ok: false, issues };
  }

  // No Form history (ADR 0014): saving overwrites, like page tags.
  const data = {
    name: input.name.trim(),
    // A form is born with the wiki's three rules, copied (ADR 0026). The tab
    // sends them, and this stamps them for a descriptor that arrived without
    // — a form created by anything but the builder — so that what is in base
    // is a copy and not a silent reference to the configuration.
    schema: {
      ...parsed.descriptor,
      permissions: parsed.descriptor.permissions ?? bornFormPermissions(),
    },
    template: input.template === "" ? null : input.template,
  };
  // The system pages leave out what they cannot offer, so reaching the refusal
  // means the right went away between opening the builder and saving it: an
  // issue to report in the toast, not an error boundary to fall into.
  try {
    if (existing) {
      // Schema overwrite, data-key retcon and title recompute in the same
      // transaction (ADR 0017/0020): the staged renames apply to every
      // revision of the form's entries, and the recomputed titles to their
      // current one, or nothing does.
      const before = parseFormDescriptor(existing.schema).descriptor;
      await updateForm(existing.id, data, {
        renames,
        recomputeTitlesWith:
          before && titleRecomputeNeeded(before, parsed.descriptor)
            ? parsed.descriptor
            : null,
      });
    } else {
      await createForm(input.slug, data);
    }
  } catch (error) {
    return { ok: false, issues: [{ message: refusalMessage(error) }] };
  }

  // Entry pages render through the form's schema/template: refresh the tree.
  revalidatePath("/", "layout");
  return { ok: true };
}

export type DeleteFormResult = { error: string } | { ok: true };

// Cascade (ADR 0014): deleting a form deletes its entry pages — the UI
// confirmation announces the count beforehand.
export async function deleteForm(slug: string): Promise<DeleteFormResult> {
  try {
    if (!(await deleteFormBySlug(slug))) {
      return { error: "Ce formulaire n'existe pas." };
    }
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The rename dialog's headcount for a form identifier (ADR 0016). */
export async function countFormReferences(
  slug: string
): Promise<SlugReferenceImpact> {
  const referenceProps = formReferenceProps(await loadComponentBuilders());
  return countFormSlugReferences(slug, referenceProps);
}

/**
 * The rename dialog's headcount for a field identifier (ADR 0017): how many
 * of the form's entries carry the key in their current snapshot. Counted on
 * the persisted name — the staged canvas may already say otherwise.
 */
export async function countFieldReferences(
  formSlug: string,
  fieldName: string
): Promise<number> {
  const form = await structuredForm(formSlug);
  if (!form) return 0;
  return countEntriesCarryingField(form.id, fieldName);
}

/**
 * The confirmation's headcount before a form save recomputes stored titles
 * (ADR 0020). Counted against the *candidate* descriptor — the canvas isn't
 * saved yet — and null when this save changes nothing about the titles, so
 * the FormBuilder knows to save straight through.
 */
export async function countTitleImpact(
  formSlug: string,
  schema: unknown
): Promise<TitleRecomputeImpact | null> {
  const form = await editableForm(formSlug);
  if (!form) return null;
  const before = parseFormDescriptor(form.schema).descriptor;
  const after = parseFormDescriptor(schema).descriptor;
  if (!before || !after || !titleRecomputeNeeded(before, after)) return null;
  return countEntryTitleRecompute(form.id, after);
}

export type RenameFormResult = { error: string } | { ok: true };

/**
 * « Changer l'identifiant » (ADR 0016, form namespace): renames Form.slug and
 * retcons every reference in place — <EntryForm id> across all revisions
 * (history included), sourceFormId and customContent MDX in form schemas,
 * form templates. The form's entries are untouched: they hang off the
 * technical UUID, not the identifier. No redirect: the caller owns the
 * navigation to the new ?id= URL.
 */
export async function renameForm(
  slug: string,
  newSlug: string
): Promise<RenameFormResult> {
  if (!isValidSlug(newSlug)) {
    return {
      error: `Identifiant invalide : «\u00A0${newSlug}\u00A0» (minuscules, chiffres et tirets).`,
    };
  }
  if (newSlug === slug) {
    return { error: "Le nouvel identifiant est identique à l'actuel." };
  }
  // Read and refused in one call. The refusal is caught here rather than by
  // the try below, which speaks for a unique-constraint race and would turn a
  // refusal into « réessayez dans un instant » — an invitation to keep trying.
  // It comes before the clash test, that being the one answer which says
  // something about another form.
  let form: { id: string } | null;
  try {
    form = await structuredForm(slug);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  if (!form) {
    return { error: "Ce formulaire n'existe pas." };
  }
  if (await formSlugExists(newSlug)) {
    return {
      error: `L'identifiant «\u00A0${newSlug}\u00A0» est déjà pris par un autre formulaire.`,
    };
  }

  const rename: SlugRename = { oldSlug: slug, newSlug };
  const referenceProps = formReferenceProps(await loadComponentBuilders());
  try {
    await renameFormSlug(form.id, rename, referenceProps);
  } catch {
    return {
      error: "Le changement d'identifiant a échoué. Réessayez dans un instant.",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** The forms a form-list selector or an options source picks from. */
export async function listFormChoices(): Promise<
  { slug: string; name: string }[]
> {
  return listFormNames();
}
