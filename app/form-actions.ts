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
  isOptionsField,
  parseFormDescriptor,
  readEntryData,
  unknownFieldReferences,
} from "@/lib/form-descriptor";
import { type EntryFieldChoice, unionEntryFields } from "@/lib/entry-fields";
import { loadComponentBuilders } from "@/lib/component-descriptors";
import { type FieldRename, fieldRenameMapping } from "@/lib/field-rename";
import { countFieldCarriers, sweepFieldRenames } from "@/lib/field-rename-db";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidSlug, slugify } from "@/lib/slug";
import { type SlugRename, formReferenceProps } from "@/lib/slug-rename";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";

// MVP: no auth, everyone is "Anonyme" (see docs/architecture.md).
const AUTHOR = "Anonyme";

export interface FormSummary {
  slug: string;
  name: string;
  entryCount: number;
  createdAt: Date;
}

export async function listForms(): Promise<FormSummary[]> {
  const forms = await prisma.form.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { entries: true } } },
  });
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
  const form = await prisma.form.findUnique({ where: { slug } });
  if (!form) return null;
  const parsed = parseFormDescriptor(form.schema);
  if (!parsed.descriptor) {
    // A stored descriptor only gets in through saveForm: reaching this means
    // the vocabulary shrank since. Fail loud rather than render a lie.
    throw new Error(
      `Descripteur invalide en base pour le formulaire « ${slug} »`
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
      message: `Identifiant invalide : « ${input.slug} » (minuscules, chiffres et tirets).`,
    });
  }

  const renames = fieldRenameMapping(input.renames ?? []);
  const parsed = parseFormDescriptor(input.schema);
  if (parsed.issues) {
    issues.push(...parsed.issues);
  } else {
    const template = input.template ?? "";
    for (const name of unknownFieldReferences(template, parsed.descriptor)) {
      issues.push({
        message: `Le gabarit référence un champ inconnu : « ${name} ».`,
      });
    }
    // The schema arrives already rewritten from the canvas (ADR 0017): every
    // rename must land on a field of the saved descriptor.
    const names = new Set(parsed.descriptor.fields.map((field) => field.name));
    for (const [from, to] of renames) {
      if (!names.has(to)) {
        issues.push({
          message: `Le renommage « ${from} → ${to} » ne vise aucun champ du formulaire.`,
        });
      }
    }
  }

  const existing = issues.length === 0
    ? await prisma.form.findUnique({ where: { slug: input.slug } })
    : null;
  if (input.isNew && existing) {
    issues.push({
      message: `L'identifiant « ${input.slug} » est déjà pris par un autre formulaire.`,
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
    // Schema overwrite and data-key retcon in the same transaction (ADR
    // 0017): the staged renames apply to every revision of the form's
    // entries, or not at all.
    await prisma.$transaction(
      async (tx) => {
        await tx.form.update({ where: { id: existing.id }, data });
        await sweepFieldRenames(tx, existing.id, renames);
      },
      // Same cold-admin-action allowance as renameForm below.
      { timeout: 60_000 }
    );
  } else {
    await prisma.form.create({
      data: { ...data, slug: input.slug, ownerName: AUTHOR },
    });
  }

  // Entry pages render through the form's schema/template: refresh the tree.
  revalidatePath("/", "layout");
  return { ok: true };
}

export type DeleteFormResult = { error: string } | { ok: true };

// Cascade (ADR 0014): deleting a form deletes its entry pages — the UI
// confirmation announces the count beforehand.
export async function deleteForm(slug: string): Promise<DeleteFormResult> {
  const form = await prisma.form.findUnique({ where: { slug } });
  if (!form) {
    return { error: "Ce formulaire n'existe pas." };
  }
  await prisma.form.delete({ where: { id: form.id } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The rename dialog's headcount for a form identifier (ADR 0016). */
export async function countFormReferences(
  slug: string
): Promise<SlugReferenceImpact> {
  const referenceProps = formReferenceProps(await loadComponentBuilders());
  return countSlugReferenceImpact(prisma, slug, referenceProps, "form");
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
  const form = await prisma.form.findUnique({ where: { slug: formSlug } });
  if (!form) return 0;
  return countFieldCarriers(prisma, form.id, fieldName);
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
      error: `Identifiant invalide : « ${newSlug} » (minuscules, chiffres et tirets).`,
    };
  }
  if (newSlug === slug) {
    return { error: "Le nouvel identifiant est identique à l'actuel." };
  }
  const form = await prisma.form.findUnique({ where: { slug } });
  if (!form) {
    return { error: "Ce formulaire n'existe pas." };
  }
  if (await prisma.form.findUnique({ where: { slug: newSlug } })) {
    return {
      error: `L'identifiant « ${newSlug} » est déjà pris par un autre formulaire.`,
    };
  }

  const rename: SlugRename = { oldSlug: slug, newSlug };
  const referenceProps = formReferenceProps(await loadComponentBuilders());
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.form.update({
          where: { id: form.id },
          data: { slug: newSlug },
        });
        await sweepSlugReferences(tx, rename, referenceProps, "form");
      },
      // Same cold-admin-action allowance as renamePage (app/actions.ts).
      { timeout: 60_000 }
    );
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
  const forms = await prisma.form.findMany({
    orderBy: { name: "asc" },
    select: { slug: true, name: true },
  });
  return forms;
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
  const forms = await prisma.form.findMany({
    where: { slug: { in: formSlugs } },
  });
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
  const form = await prisma.form.findUnique({ where: { slug: formSlug } });
  if (!form) return null;
  const parsed = parseFormDescriptor(form.schema);
  if (!parsed.descriptor) {
    throw new Error(`Descripteur invalide en base : « ${formSlug} »`);
  }

  let values: EntryData | null = null;
  let slug: string | null = null;
  if (entrySlug) {
    const page = await prisma.page.findUnique({
      where: { slug: entrySlug },
      include: { current: true },
    });
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
  const form = await prisma.form.findUnique({ where: { slug: input.formSlug } });
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
    return { ok: false, formError: "Le titre de la fiche est vide." };
  }

  const tagsField = tagsFieldName(descriptor);
  const tags = tagsField && Array.isArray(data[tagsField])
    ? (data[tagsField] as string[])
    : [];

  // Editing keeps the frozen slug; a new entry derives it from the title
  // (revealable, personalizable) and freezes it on this first save.
  if (input.entrySlug) {
    const page = await prisma.page.findUnique({
      where: { slug: input.entrySlug },
    });
    if (!page || page.formId !== form.id) {
      return { ok: false, formError: "Cette fiche n'existe plus." };
    }
    await writeEntryRevision(page.id, data, tags);
    revalidatePath("/", "layout");
    return { ok: true, slug: page.slug };
  }

  const slug = input.slug && input.slug.trim() !== ""
    ? input.slug
    : slugify(title);
  if (!isValidSlug(slug)) {
    return { ok: false, slugCollision: true };
  }
  // Collision with any page (MDX or entry): explicit, never a silent suffix.
  const clash = await prisma.page.findUnique({ where: { slug } });
  if (clash) return { ok: false, slugCollision: true };

  await prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: { slug, ownerName: AUTHOR, formId: form.id, tags },
    });
    const revision = await tx.revision.create({
      data: { pageId: page.id, data: data as Prisma.InputJsonValue, authorName: AUTHOR },
    });
    await tx.page.update({
      where: { id: page.id },
      data: { currentRevisionId: revision.id },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, slug };
}

// A new snapshot for an existing entry, unless the data is unchanged
// (revisions are the content's history, ADR 0003). Tags live on the Page and
// update without a revision (ADR 0007).
async function writeEntryRevision(
  pageId: string,
  data: EntryData,
  tags: string[]
): Promise<void> {
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { current: true },
  });
  const unchanged =
    JSON.stringify(readEntryData(page.current?.data)) === JSON.stringify(data);
  await prisma.$transaction(async (tx) => {
    await tx.page.update({ where: { id: pageId }, data: { tags } });
    if (unchanged) return;
    const revision = await tx.revision.create({
      data: { pageId, data: data as Prisma.InputJsonValue, authorName: AUTHOR },
    });
    await tx.page.update({
      where: { id: pageId },
      data: { currentRevisionId: revision.id },
    });
  });
}

export interface EntrySummary {
  slug: string;
  title: string;
  formSlug: string;
  formName: string;
  updatedAt: Date;
}

export async function listEntries(formSlug?: string): Promise<EntrySummary[]> {
  const pages = await prisma.page.findMany({
    where: formSlug ? { form: { slug: formSlug } } : { formId: { not: null } },
    include: { form: true, current: true },
    orderBy: { createdAt: "desc" },
  });
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
