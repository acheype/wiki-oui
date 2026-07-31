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
  countEntriesCarryingField,
  countEntryTitleRecompute,
  countFormSlugReferences,
  createForm,
  deleteFormById,
  getFormBySlug,
  listFormNames,
  listFormsBySlugs,
  listFormsWithEntryCount,
  renameFormSlug,
  updateForm,
} from "@/lib/forms";
import {
  createEntryPage,
  getPage,
  getPageWithCurrent,
  listEntryPages,
  writeEntryRevision,
} from "@/lib/pages";
import { isValidSlug, reservedSlugRefusal, slugify } from "@/lib/slug";
import { type SlugRename, formReferenceProps } from "@/lib/slug-rename";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";

export interface FormSummary {
  slug: string;
  name: string;
  entryCount: number;
  createdAt: Date;
}

export async function listForms(): Promise<FormSummary[]> {
  const forms = await listFormsWithEntryCount();
  return forms.map((form) => ({
    slug: form.slug,
    name: form.name,
    entryCount: form._count.entries,
    createdAt: form.createdAt,
  }));
}

export interface FormDetail {
  slug: string;
  name: string;
  schema: FormDescriptor;
  template: string | null;
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
  };
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
    schema: parsed.descriptor,
    template: input.template === "" ? null : input.template,
  };
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
  await deleteFormById(form.id);
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
    if (!page || page.formId !== form.id) return null;
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
  };
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
    await writeEntryRevision({ pageId: page.id, data: stored, tags });
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

  await createEntryPage({ slug, formId: form.id, data: stored, tags });
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
