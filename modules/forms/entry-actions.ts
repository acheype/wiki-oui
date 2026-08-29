"use server";

// Server Actions of the fiches (ADR 0014): the generated entry form and the
// fiche-administration system page read their data and write their revisions
// through the same transport, no URL. The forms these fiches hang off answer
// next door, in form-actions.ts.

import { revalidatePath } from "next/cache";
import { scopeRefusal } from "@/modules/forms/refusal";
import {
  type EntryData,
  type FormDescriptor,
  type FormField,
  computeAutomaticTitle,
  deriveEntrySchema,
  emptyTitleMessage,
  isOptionsField,
  readEntryData,
  withTitleOrdered,
} from "@/modules/forms/form-descriptor";
import {
  fieldWriteRule,
  writableDescriptor,
} from "@/modules/permissions/field-level";
import { type EntryFieldChoice, unionEntryFields } from "@/modules/forms/entry-fields";
import {
  currentCanCreateEntry,
  permissionsOf,
  readableFormBySlug,
} from "@/modules/forms/forms";
import {
  canCreateEntryIn,
  readableFormsBySlugs,
} from "@/modules/forms/access/guards";
import {
  groupDisplayNames,
  groupNamesBySlug,
} from "@/modules/permissions/groups-directory";
import { hasForm } from "@/modules/pages/entry-page";
import { getPageWithCurrent, slugExists } from "@/modules/pages/content";
import { isRefused } from "@/modules/pages/rights";
import {
  createEntryPage,
  listEntryPages,
  listEntrySnapshots,
  writeEntryRevision,
} from "@/modules/pages/entries";
import { refusalMessage } from "@/modules/permissions/rules";
import { currentPerson, currentIdentity } from "@/modules/permissions/person";
import { isValidSlug, reservedSlugRefusal, slugify } from "@/lib/slug";
import { rankByFrequency } from "@/modules/forms/suggested-values";

/**
 * The values a « Mots-clés » field already carries, most used first (issue
 * #15).
 *
 * A Server Action is a public entry point, reachable with any
 * `(formSlug, fieldName)` pair whatever is on screen: the field's own read
 * right is re-checked here, not only where the entry form built its schema.
 * A filter left to the widget would be a UI mask, not a right.
 */
export async function listUsedFieldValues(
  formSlug: string,
  fieldName: string
): Promise<string[]> {
  const form = await readableFormBySlug(formSlug);
  if (!form?.seen) return [];
  const field = form.seen.readable.fields.find(
    (candidate) => candidate.name === fieldName
  );
  if (!field || field.type !== "tags") return [];

  // Already cut to what this person may read (currentReadableWhere) and to
  // the current revision (modules/pages/entries.ts listEntrySnapshots) —
  // nothing left to check for rights here.
  const snapshots = await listEntrySnapshots(formSlug);
  const values = snapshots.flatMap((snapshot) => {
    const value = readEntryData(snapshot)[fieldName];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  });
  return rankByFrequency(values);
}

/** value (entry slug) → label (current title), for form-sourced options. */
export async function listFormOptions(
  formSlug: string
): Promise<{ value: string; label: string }[]> {
  const entries = await listEntries(formSlug);
  return entries.map((entry) => ({ value: entry.slug, label: entry.title }));
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
  // Cut to what this person may read, and so are the zones, the filters and
  // the sorts built from it: a field they cannot see is not one they can be
  // offered to sort on (docs/permissions.md § Champ). The gate makes the cut
  // form by form — a name readable on one of the chosen forms is not thereby
  // readable on the next — and the values are cut again where the payload is
  // assembled.
  const forms = await readableFormsBySlugs(formSlugs);
  const bySlug = new Map(forms.map((form) => [form.slug, form]));
  const ordered = formSlugs.flatMap((slug) => {
    const form = bySlug.get(slug); // a slug typed by hand may not exist (yet)
    return form?.seen ? [{ name: form.name, descriptor: form.seen.readable }] : [];
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
    // Ordered by the form's own fields (docs/permissions.md § /{slug}/raw) —
    // title lands wherever the form's own author placed it, never forced to
    // the front.
    stored: withTitleOrdered(descriptor, data, title),
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
  if (isEdit || (await currentCanCreateEntry(form))) return null;
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
  const form = await readableFormBySlug(formSlug);
  if (!form) return null;
  // What this person may not read never reaches the browser — neither the
  // field nor the value it holds (docs/permissions.md § Champ). The gate has
  // already made the cut; a null here means the stored descriptor no longer
  // parses at all.
  const seen = form.seen;
  if (!seen) {
    throw new Error(`Descripteur invalide en base : «\u00A0${formSlug}\u00A0»`);
  }

  let values: EntryData | null = null;
  let slug: string | null = null;
  if (entrySlug) {
    const page = await getPageWithCurrent(entrySlug);
    // A refused read reads as « no such entry » here: the caller is the entry
    // form, and the refusal view has already answered on the way in.
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

/** Whether a system page offers « Nouvelle fiche » for this form at all. */
export async function canAddEntry(formSlug: string): Promise<boolean> {
  return canCreateEntryIn(formSlug);
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
  const form = await readableFormBySlug(input.formSlug);
  if (!form) return { ok: false, formError: "Ce formulaire n'existe plus." };
  if (!form.seen) {
    return { ok: false, formError: "Descripteur du formulaire invalide." };
  }
  // `whole`, not `readable`: a save decides on fields it never showed
  // (modules/permissions/readable-form.ts) — one of the two readers that
  // field exists for. The right on the write itself is the fiche's and not
  // the form's: createEntryPage refuses a creation and writeEntryRevision an
  // edit, both behind the Page guards and both from the revision they read
  // themselves.
  const descriptor = form.seen.whole;

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
    // guards, which merge from the revision they read themselves and compute the
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
  // entry would be written and never open, so the view asks for another.
  if (!isValidSlug(slug) || reservedSlugRefusal(slug)) {
    return { ok: false, slugCollision: true };
  }
  // Collision with any page (MDX or entry): explicit, never a silent suffix.
  if (await slugExists(slug)) return { ok: false, slugCollision: true };

  try {
    await createEntryPage({
      slug,
      formId: form.id,
      formName: form.name,
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
    if (!hasForm(page)) return [];
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
