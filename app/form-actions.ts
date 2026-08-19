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
  type FormField,
  computeAutomaticTitle,
  deriveEntrySchema,
  emptyTitleMessage,
  formAuthoringIssues,
  isOptionsField,
  parseFormDescriptor,
  readEntryData,
  unknownFieldReferences,
} from "@/lib/form-descriptor";
import {
  fieldWriteRule,
  writableDescriptor,
} from "@/lib/field-rights";
import { readableForm } from "@/lib/field-rights-db";
import { type EntryFieldChoice, unionEntryFields } from "@/lib/entry-fields";
import { loadComponentBuilders } from "@/lib/component-descriptors";
import { type FieldRename, fieldRenameMapping } from "@/lib/field-rename";
import { titleRecomputeNeeded } from "@/lib/entry-title";
import type { TitleRecomputeImpact } from "@/lib/entry-title-db";
import {
  type EntryRightsImpact,
  type FormPermissions,
  bornFormPermissions,
} from "@/lib/form-rights";
import {
  personCanCreateEntry,
  personCanCreateForm,
  personCanEditForm,
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
import {
  groupDisplayNames,
  groupNamesBySlug,
  listDirectory,
} from "@/lib/groups-db";
import {
  createEntryPage,
  getPage,
  getPageWithCurrent,
  isRefused,
  listEntryPages,
  listEntrySnapshots,
  writeEntryRevision,
} from "@/lib/pages";
import {
  type AclDirectory,
  FORM_EDIT_REFUSED,
  refusalMessage,
  scopeRefusal,
} from "@/lib/permissions";
import { currentPerson, currentIdentity } from "@/lib/permissions-db";
import { isValidSlug, reservedSlugRefusal, slugify } from "@/lib/slug";
import { rankByFrequency } from "@/lib/tag-suggestions";
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
      canEdit: await personCanEditForm(form),
      canCreateEntry: await personCanCreateEntry(form),
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
  /** Whether this person may save what the builder shows (owner or admin). */
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
    canEdit: await personCanEditForm(form),
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
  const form = formSlug ? await getFormBySlug(formSlug) : null;
  // A form being created has no owner yet to hang the editing rung on, so the
  // rung the act itself stops at answers for it: whoever may not create a form
  // has no business reading the wiki's membership either.
  const allowed = form
    ? await personCanEditForm(form)
    : await personCanCreateForm();
  return allowed ? listDirectory() : { people: [], groups: [] };
}

/** Whether the screens offer « Nouveau formulaire » at all. */
export async function canAddForm(): Promise<boolean> {
  return personCanCreateForm();
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
  if (!(await personCanEditForm(form))) {
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

/**
 * The values a « Mots-clés » field already carries, most used first (issue
 * #15): what its widget offers at focus, before anyone has typed anything.
 *
 * A Server Action is a public entry point, reachable with any
 * `(formSlug, fieldName)` pair whatever widget is or isn't on screen — so the
 * field's own read right is re-checked here, not only where the entry form
 * built its schema. Looking the name up in `seen.readable.fields` answers
 * both the illegible field and the field that isn't a « Mots-clés » field at
 * once: absent from that list either way. Without this guard, a caller could
 * read any field's values through this action regardless of its type or its
 * rights — a filter left to the widget would be a UI mask, not a right.
 */
export async function listUsedFieldValues(
  formSlug: string,
  fieldName: string
): Promise<string[]> {
  const form = await getFormBySlug(formSlug);
  if (!form) return [];
  const seen = await readableForm(form.schema);
  if (!seen) return [];
  const field = seen.readable.fields.find((candidate) => candidate.name === fieldName);
  if (!field || field.type !== "tags") return [];

  // Already cut to what this person may read (currentReadableWhere) and to
  // the current revision (lib/pages.ts listEntrySnapshots) — nothing left to
  // check for rights here.
  const snapshots = await listEntrySnapshots(formSlug);
  const values = snapshots.flatMap((snapshot) => {
    const value = readEntryData(snapshot)[fieldName];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  });
  return rankByFrequency(
    values.map((value) => value.trim()).filter((value) => value !== "")
  );
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
  // Cut to what this person may read, and so are the zones, the filters and
  // the sorts built from it: a field they cannot see is not one they can be
  // offered to sort on (docs/permissions.md § Champ). The values are cut
  // again, form by form, where the payload is assembled — a name readable on
  // one of the chosen forms is not thereby readable on the next.
  const ordered = (
    await Promise.all(
      formSlugs.map(async (slug) => {
        const form = bySlug.get(slug);
        if (!form) return []; // a slug typed by hand may not exist (yet)
        const seen = await readableForm(form.schema);
        return seen ? [{ name: form.name, descriptor: seen.readable }] : [];
      })
    )
  ).flat();
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

/**
 * The values a save writes, their title among them (ADR 0020): every reader
 * reads `data.title`, none recomputes it. In automatic mode the client never
 * submits it — deriveEntrySchema strips it — so it is worked out here, from
 * the very values the save is about to write, and the refusal an empty one
 * earns travels with it rather than being computed a second time.
 */
function titledEntry(
  descriptor: FormDescriptor,
  data: EntryData
): { stored: EntryData; title: string; refusal: string | null } {
  const title = computeAutomaticTitle(descriptor, data);
  return {
    stored: { ...data, title },
    title,
    refusal: title.trim() === "" ? emptyTitleMessage(descriptor) : null,
  };
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
  /**
   * Field name → why it is shown greyed, for the fields this person may see but
   * not fill (docs/permissions.md § Champ). A field they may not even see is
   * not in here: it is absent from `schema` altogether.
   */
  readOnly: Record<string, string>;
  /** Whether « Se connecter » is worth offering beside that motif. */
  signedIn: boolean;
}

/**
 * The refusal the entry form shows, with the groups it names resolved to
 * their display names. Null once the person may add a fiche — and for an edit,
 * which this right has nothing to say about.
 */
async function creationRefusalOf(
  form: { schema: unknown },
  isEdit: boolean
): Promise<string | null> {
  if (isEdit || (await personCanCreateEntry(form))) return null;
  const rule = permissionsOf(form).createEntry;
  return scopeRefusal(rule, await groupDisplayNames(rule.groupSlugs ?? []));
}

/**
 * The motif under each greyed field, in the words its own rule was posed in.
 * The group names are resolved once for the whole form: a form reserving a
 * dozen fields to the same group would otherwise ask as many times.
 */
async function readOnlyMotifs(
  fields: FormField[]
): Promise<Record<string, string>> {
  if (fields.length === 0) return {};
  const named = await groupNamesBySlug(
    fields.flatMap((field) => [...(fieldWriteRule(field).groupSlugs ?? [])])
  );
  return Object.fromEntries(
    fields.flatMap((field) => {
      const rule = fieldWriteRule(field);
      const motif = scopeRefusal(
        rule,
        (rule.groupSlugs ?? []).flatMap((slug) => named.get(slug) ?? [])
      );
      return motif ? [[field.name, motif]] : [];
    })
  );
}

// Loads what the generated entry form needs. `entrySlug` set = edit mode,
// prefilled from the current snapshot.
export async function getEntryForm(
  formSlug: string,
  entrySlug?: string
): Promise<EntryFormData | null> {
  const form = await getFormBySlug(formSlug);
  if (!form) return null;
  // What this person may not read never reaches the browser — neither the
  // field nor the value it holds (docs/permissions.md § Champ).
  const seen = await readableForm(form.schema);
  if (!seen) {
    throw new Error(`Descripteur invalide en base : «\u00A0${formSlug}\u00A0»`);
  }

  let values: EntryData | null = null;
  let slug: string | null = null;
  if (entrySlug) {
    const page = await getPageWithCurrent(entrySlug);
    // A refused read reads as « no such entry » here: the caller is the entry
    // form, and the refusal screen has already answered on the way in.
    if (!page || isRefused(page) || page.formId !== form.id) return null;
    values = seen.readableValues(page.current?.data);
    slug = page.slug;
  }

  return {
    formSlug: form.slug,
    formName: form.name,
    schema: seen.readable,
    values,
    slug,
    creationRefusal: await creationRefusalOf(form, entrySlug !== undefined),
    readOnly: await readOnlyMotifs(seen.readOnly),
    signedIn: (await currentIdentity()) !== null,
  };
}

/** Whether a screen offers « Nouvelle fiche » for this form at all. */
export async function canAddEntry(formSlug: string): Promise<boolean> {
  const form = await getFormBySlug(formSlug);
  return form !== null && personCanCreateEntry(form);
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

  // Same schema as the client resolver (ADR 0015): one source of truth. Cut
  // to the fields this person may write, so that what they send on the others
  // is stripped rather than refused (docs/permissions.md § Champ) — a mere
  // difference of rights must never be what makes a save fail. A required
  // field they may not fill is not asked of them either, for the same reason.
  const person = await currentPerson();
  const writable = writableDescriptor(person, descriptor);
  const validation = deriveEntrySchema(writable).safeParse(input.data);
  if (!validation.success) {
    return { ok: false, formError: "Des champs sont invalides." };
  }
  const data = validation.data as EntryData;

  // Editing keeps the frozen slug; a new entry derives it from the title
  // (revealable, personalizable) and freezes it on this first save.
  if (input.entrySlug) {
    const page = await getPageWithCurrent(input.entrySlug);
    if (!page || isRefused(page) || page.formId !== form.id) {
      return { ok: false, formError: "Cette fiche n'existe plus." };
    }
    // Nothing is merged here, and no title worked out: both belong to the
    // door, which merges from the revision it reads itself and computes the
    // title from that merge (ADR 0020). What comes back as a refusal — a
    // right that went away, a title the merge leaves empty — travels in the
    // toast rather than into an error boundary.
    try {
      await writeEntryRevision({ pageId: page.id, data, descriptor });
    } catch (error) {
      return { ok: false, formError: refusalMessage(error) };
    }
    revalidatePath("/", "layout");
    return { ok: true, slug: page.slug };
  }

  const { stored, title, refusal } = titledEntry(descriptor, data);
  if (refusal) return { ok: false, formError: refusal };

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
