"use server";

// Server Actions of the form-administration screens (ADR 0014): the admin
// components are client-side and read their data through actions too — same
// transport as mutations, no URL. Validation happens here with the same
// engine the FormBuilder uses client-side (lib/form-descriptor).

import { revalidatePath } from "next/cache";
import {
  type EntryData,
  type FormDescriptor,
  type FormDescriptorIssue,
  computeAutomaticTitle,
  deriveEntrySchema,
  emptyTitleMessage,
  formAuthoringIssues,
  isOptionsField,
  parseFormDescriptor,
  readEntryData,
  unknownFieldReferences,
} from "@/lib/form-descriptor";
import { type EntryFieldChoice, unionEntryFields } from "@/lib/entry-fields";
import { loadComponentBuilders } from "@/lib/component-descriptors";
import { type FieldRename, fieldRenameMapping } from "@/lib/field-rename";
import { titleRecomputeNeeded } from "@/lib/entry-title";
import type { TitleRecomputeImpact } from "@/lib/entry-title-db";
import {
  type EntryRightsImpact,
  type FormPermissions,
  bornFormPermissions,
  entryCreationRefusal,
} from "@/lib/form-rights";
import {
  actorCanCreateEntry,
  actorCanCreateForm,
  actorCanEditForm,
  applyFormDefaults,
  countEntriesCarryingField,
  countEntryTitleRecompute,
  countFormDefaults,
  countFormSlugReferences,
  createForm,
  deleteFormById,
  getFormBySlug,
  listFormNames,
  listFormsBySlugs,
  listFormsWithEntryCount,
  permissionsOf,
  renameFormSlug,
  updateForm,
} from "@/lib/forms";
import { groupDisplayNames, listDirectory } from "@/lib/groups-db";
import {
  createEntryPage,
  getPage,
  getPageWithCurrent,
  isRefused,
  listEntryPages,
  writeEntryRevision,
} from "@/lib/pages";
import {
  type AclDirectory,
  FORM_EDIT_REFUSED,
  refusalMessage,
} from "@/lib/permissions";
import { currentIdentity } from "@/lib/permissions-db";
import { isValidSlug, reservedSlugRefusal, slugify } from "@/lib/slug";
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
      canEdit: await actorCanEditForm(form),
      canCreateEntry: await actorCanCreateEntry(form),
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
  /** Whether this actor may save what the builder shows (owner or admin). */
  canEdit: boolean;
}

export async function getForm(slug: string): Promise<FormDetail | null> {
  const form = await getFormBySlug(slug);
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
    canEdit: await actorCanEditForm(form),
  };
}

/**
 * Who the « Accès » tab's lists may name. Read only once the actor is known
 * to have business posing a right — the whole membership of the wiki is not a
 * visitor's affair, and a form nobody may edit needs no picker at all.
 */
export async function listRightsDirectory(
  formSlug: string | null
): Promise<AclDirectory> {
  const form = formSlug ? await getFormBySlug(formSlug) : null;
  // A form being created has no owner yet to hang the editing rung on, so the
  // rung the act itself stops at answers for it: whoever may not create a form
  // has no business reading the wiki's membership either.
  const allowed = form
    ? await actorCanEditForm(form)
    : await actorCanCreateForm();
  return allowed ? listDirectory() : { people: [], groups: [] };
}

/** Whether the screens offer « Nouveau formulaire » at all. */
export async function canAddForm(): Promise<boolean> {
  return actorCanCreateForm();
}

/**
 * Applying a form's defaults to the fiches already there (docs/permissions.md
 * § Défauts), both halves. The rules counted against are the ones the tab
 * shows, not the ones in base: the confirmation leads to a save, so what it
 * announces is what the form is about to hold. Null when the form has gone, or
 * when the actor may not edit it — the button was not on offer either way.
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
  /** True from the ?nouveau screen: refuses to overwrite an existing slug. */
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

  const existing = issues.length === 0 ? await getFormBySlug(input.slug) : null;
  if (input.isNew && existing) {
    issues.push({
      message: `L'identifiant «\u00A0${input.slug}\u00A0» est déjà pris par un autre formulaire.`,
    });
  }
  if (!input.isNew && !existing && issues.length === 0) {
    issues.push({ message: "Ce formulaire n'existe plus." });
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
  // The screens leave out what they cannot offer, so reaching the refusal
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
  const form = await getFormBySlug(slug);
  if (!form) {
    return { error: "Ce formulaire n'existe pas." };
  }
  try {
    await deleteFormById(form.id);
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
  const form = await getFormBySlug(formSlug);
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
  const form = await getFormBySlug(formSlug);
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
  const form = await getFormBySlug(slug);
  if (!form) {
    return { error: "Ce formulaire n'existe pas." };
  }
  // Checked here rather than only at the door: the generic failure message
  // below is for a unique-constraint race, and would turn a refusal into
  // « réessayez dans un instant » — an invitation to keep trying.
  if (!(await actorCanEditForm(form))) {
    return { error: FORM_EDIT_REFUSED };
  }
  if (await getFormBySlug(newSlug)) {
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

/** value (entry slug) → label (current title), for form-sourced options. */
export async function listFormOptions(
  formSlug: string
): Promise<{ value: string; label: string }[]> {
  const entries = await listEntries(formSlug);
  return entries.map((entry) => ({ value: entry.slug, label: entry.title }));
}

/** The forms a form-list selector or an options source picks from. */
export async function listFormChoices(): Promise<
  { slug: string; name: string }[]
> {
  return listFormNames();
}

/**
 * The field choices a form-field / field-rows selector lists (docs/
 * entries-view.md): the union by name of the chosen forms' fields, in the
 * order the author picked the forms. Form-sourced options are resolved here
 * (their values are entry slugs), so the color/icon mapping widgets can show
 * one row per option without another round trip.
 */
export async function listEntryFieldChoices(
  formSlugs: string[]
): Promise<EntryFieldChoice[]> {
  const forms = await listFormsBySlugs(formSlugs);
  const bySlug = new Map(forms.map((form) => [form.slug, form]));
  const ordered = formSlugs.flatMap((slug) => {
    const form = bySlug.get(slug);
    if (!form) return []; // a slug typed by hand may not exist (yet)
    const parsed = parseFormDescriptor(form.schema);
    return parsed.descriptor
      ? [{ name: form.name, descriptor: parsed.descriptor }]
      : [];
  });
  const choices = unionEntryFields(ordered);
  return Promise.all(
    choices.map(async (choice) => {
      if (choice.options !== undefined || !isSourcedOptionsChoice(choice)) {
        return choice;
      }
      const sourceFormId = sourcedFormSlug(ordered, choice.name);
      if (!sourceFormId) return choice;
      const options = Object.fromEntries(
        (await listFormOptions(sourceFormId)).map(({ value, label }) => [
          value,
          label,
        ])
      );
      return { ...choice, options };
    })
  );
}

function isSourcedOptionsChoice(choice: EntryFieldChoice): boolean {
  return (
    choice.type === "list" ||
    choice.type === "radio" ||
    choice.type === "multiChoice"
  );
}

// The source form feeding a form-sourced options field: read from the first
// chosen form carrying the field (the union's label rule, applied to options).
function sourcedFormSlug(
  forms: { descriptor: FormDescriptor }[],
  fieldName: string
): string | undefined {
  for (const form of forms) {
    for (const field of form.descriptor.fields) {
      if (field.name !== fieldName || !isOptionsField(field)) continue;
      if (field.sourceFormId) return field.sourceFormId;
    }
  }
  return undefined;
}

// The field whose value drives Page.tags (docs/forms.md): tags are not
// historized, so the snapshot mirrors them but Page.tags is the source of
// truth on prefill.
function tagsFieldName(descriptor: FormDescriptor): string | undefined {
  return descriptor.fields.find((field) => field.type === "tags")?.name;
}

export interface EntryFormData {
  formSlug: string;
  formName: string;
  schema: FormDescriptor;
  /** Prefilled values when editing an existing entry; empty for a new one. */
  values: EntryData | null;
  /** Existing entry slug when editing; null for a new entry. */
  slug: string | null;
  /**
   * Why adding a fiche is refused, null when it is not — creation only,
   * editing being the fiche's own write right. The block says its motif
   * rather than disappearing (docs/permissions.md § Ce que voit qui n'a pas
   * le droit): a form that vanished reads as a page that failed to load.
   */
  creationRefusal: string | null;
  /** Whether « Se connecter » is worth offering beside that motif. */
  signedIn: boolean;
}

/**
 * The refusal the entry form shows, with the groups it names resolved to
 * their display names. Null once the actor may add a fiche — and for an edit,
 * which this right has nothing to say about.
 */
async function creationRefusalOf(
  form: { schema: unknown },
  isEdit: boolean
): Promise<string | null> {
  if (isEdit || (await actorCanCreateEntry(form))) return null;
  const rule = permissionsOf(form).createEntry;
  return entryCreationRefusal(
    rule,
    await groupDisplayNames(rule.groupSlugs ?? [])
  );
}

// Loads what the generated entry form needs. `entrySlug` set = edit mode
// (prefilled from the current snapshot, tags from Page.tags).
export async function getEntryForm(
  formSlug: string,
  entrySlug?: string
): Promise<EntryFormData | null> {
  const form = await getFormBySlug(formSlug);
  if (!form) return null;
  const parsed = parseFormDescriptor(form.schema);
  if (!parsed.descriptor) {
    throw new Error(`Descripteur invalide en base : «\u00A0${formSlug}\u00A0»`);
  }

  let values: EntryData | null = null;
  let slug: string | null = null;
  if (entrySlug) {
    const page = await getPageWithCurrent(entrySlug);
    // A refused read reads as « no such entry » here: the caller is the entry
    // form, and the refusal screen has already answered on the way in.
    if (!page || isRefused(page) || page.formId !== form.id) return null;
    values = readEntryData(page.current?.data);
    const tagsField = tagsFieldName(parsed.descriptor);
    if (tagsField) values = { ...values, [tagsField]: page.tags };
    slug = page.slug;
  }

  return {
    formSlug: form.slug,
    formName: form.name,
    schema: parsed.descriptor,
    values,
    slug,
    creationRefusal: await creationRefusalOf(form, entrySlug !== undefined),
    signedIn: (await currentIdentity()) !== null,
  };
}

/** Whether a screen offers « Nouvelle fiche » for this form at all. */
export async function canAddEntry(formSlug: string): Promise<boolean> {
  const form = await getFormBySlug(formSlug);
  return form !== null && actorCanCreateEntry(form);
}

export interface SaveEntryInput {
  formSlug: string;
  data: EntryData;
  /** Desired slug (revealed field or derived); used only when creating. */
  slug?: string;
  /** Existing entry slug when editing; absent when creating. */
  entrySlug?: string;
}

export type SaveEntryResult =
  | { ok: true; slug: string }
  | { ok: false; formError?: string; slugCollision?: boolean };

export async function saveEntry(
  input: SaveEntryInput
): Promise<SaveEntryResult> {
  const form = await getFormBySlug(input.formSlug);
  if (!form) return { ok: false, formError: "Ce formulaire n'existe plus." };
  const parsed = parseFormDescriptor(form.schema);
  if (!parsed.descriptor) {
    return { ok: false, formError: "Descripteur du formulaire invalide." };
  }
  const descriptor = parsed.descriptor;

  // Same schema as the client resolver (ADR 0015): one source of truth.
  const validation = deriveEntrySchema(descriptor).safeParse(input.data);
  if (!validation.success) {
    return { ok: false, formError: "Des champs sont invalides." };
  }
  const data = validation.data as EntryData;

  const title = computeAutomaticTitle(descriptor, data);
  if (title.trim() === "") {
    return { ok: false, formError: emptyTitleMessage(descriptor) };
  }
  // The title is stored like any other field value (ADR 0020): every reader
  // reads `data.title`, none recomputes it. In automatic mode the client
  // never submits it — deriveEntrySchema strips it — so it is injected here,
  // after validation.
  const stored: EntryData = { ...data, title };

  const tagsField = tagsFieldName(descriptor);
  const tags = tagsField && Array.isArray(data[tagsField])
    ? (data[tagsField] as string[])
    : [];

  // Editing keeps the frozen slug; a new entry derives it from the title
  // (revealable, personalizable) and freezes it on this first save.
  if (input.entrySlug) {
    const page = await getPage(input.entrySlug);
    if (!page || page.formId !== form.id) {
      return { ok: false, formError: "Cette fiche n'existe plus." };
    }
    // The form refuses long before this, so reaching it means the right went
    // away between opening the fiche and saving it: a refusal to report, not
    // an error boundary to fall into.
    try {
      await writeEntryRevision({ pageId: page.id, data: stored, tags });
    } catch (error) {
      return { ok: false, formError: refusalMessage(error) };
    }
    revalidatePath("/", "layout");
    return { ok: true, slug: page.slug };
  }

  const slug = input.slug && input.slug.trim() !== ""
    ? input.slug
    : slugify(title);
  // The reserved segment is taken like an existing page is (ADR 0028): the
  // entry would be written and never open, so the screen asks for another.
  if (!isValidSlug(slug) || reservedSlugRefusal(slug)) {
    return { ok: false, slugCollision: true };
  }
  // Collision with any page (MDX or entry): explicit, never a silent suffix.
  const clash = await getPage(slug);
  if (clash) return { ok: false, slugCollision: true };

  try {
    await createEntryPage({
      slug,
      formId: form.id,
      data: stored,
      tags,
      // The form decides who may add a fiche, and what that fiche is born
      // with (docs/permissions.md § Formulaire) — not the wiki's own rules,
      // which govern pages.
      permissions: permissionsOf(form),
    });
  } catch (error) {
    return { ok: false, formError: refusalMessage(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true, slug };
}

export interface EntrySummary {
  slug: string;
  title: string;
  formSlug: string;
  formName: string;
  updatedAt: Date;
}

export async function listEntries(formSlug?: string): Promise<EntrySummary[]> {
  const pages = await listEntryPages(formSlug);
  return pages.flatMap((page) => {
    if (!page.form) return [];
    const title = String(readEntryData(page.current?.data).title ?? page.slug);
    return [
      {
        slug: page.slug,
        title,
        formSlug: page.form.slug,
        formName: page.form.name,
        updatedAt: page.current?.createdAt ?? page.createdAt,
      },
    ];
  });
}
