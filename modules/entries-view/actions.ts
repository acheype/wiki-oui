"use server";

// Read Server Action of <EntriesView> (docs/entries-view.md, motif ADR
// 0014): the client component loads everything once, then searches, filters
// and sorts in memory. Guard rail: only the *referenced* fields travel —
// the caller announces what its configuration reads, and the payload holds
// nothing else (pseudo-fields excepted: four tiny metadata values).

import { listEntryFieldChoices } from "@/modules/forms/entry-actions";
import type { EntryFieldChoice } from "@/modules/forms/entry-fields";
import type { ViewEntry } from "@/modules/entries-view/rules";
import { readEntryData } from "@/modules/forms/form-descriptor";
import { readableForm } from "@/modules/permissions/readable-form";
import { listFormsWithEntries } from "@/modules/forms/forms";
import { currentPermissions } from "@/modules/permissions/person";
import type { PagePermissions } from "@/modules/permissions/rules";
import {
  FALLBACK_SAMPLE_DESCRIPTOR,
  sampleEntries,
} from "@/modules/forms/sample-entries";
import { TEXT_SEARCH_TYPES } from "@/modules/entries-view/rules";
import { displayName } from "@/modules/accounts/username";

export interface EntriesViewQuery {
  /** Chosen form slugs, in the author's order. */
  forms: string[];
  /** Field names the configuration references (pseudo-fields included). */
  fields: string[];
  /** Every field travels (a Tableau without explicit columns). */
  allFields?: boolean;
  /** The text-searchable fields travel too (search on, no searchFields). */
  allTextFields?: boolean;
  /** The geolocation + image fields travel (the Carte reads them implicitly). */
  mapFields?: boolean;
}

export interface EntriesViewData {
  /** Metadata (label, type, options) for the union fields, author order. */
  fields: EntryFieldChoice[];
  entries: ViewEntry[];
  /** True when the entries are generated samples (preview fallback). */
  sample: boolean;
  /** slug → name of the chosen forms ($form labels). */
  formNames: Record<string, string>;
  /**
   * slug → what the person may do to that entry, for the views that offer a
   * action per row. Beside the entries rather than inside them: what a view
   * searches, sorts and filters on is the entry's own values, and a right is
   * not one of them.
   */
  permissions: Record<string, PagePermissions>;
}

export async function getEntriesViewData(
  query: EntriesViewQuery
): Promise<EntriesViewData> {
  const today = new Date().toISOString().slice(0, 10);

  // No form chosen: the preview shows generated samples over a generic
  // schema, under its "sample data" banner (docs/entries-view.md).
  if (query.forms.length === 0) {
    return {
      fields: [],
      entries: sampleEntries(FALLBACK_SAMPLE_DESCRIPTOR, today),
      sample: true,
      formNames: {},
      permissions: {},
    };
  }

  const choices = await listEntryFieldChoices(query.forms);
  const wanted = new Set(query.fields);
  const kept = choices.filter(
    (choice) =>
      query.allFields ||
      wanted.has(choice.name) ||
      (query.allTextFields === true &&
        (TEXT_SEARCH_TYPES as readonly string[]).includes(choice.type)) ||
      (query.mapFields === true &&
        (choice.type === "geolocation" || choice.type === "image"))
  );
  const keptNames = new Set(kept.map((choice) => choice.name));

  const forms = await listFormsWithEntries(query.forms);
  const bySlug = new Map(forms.map((form) => [form.slug, form]));
  const ordered = query.forms.flatMap((slug) => bySlug.get(slug) ?? []);
  const formNames = Object.fromEntries(
    ordered.map((form) => [form.slug, form.name])
  );

  // Cut form by form, where `kept` is the union over the chosen ones: a name
  // readable on one of them is not thereby readable on the next
  // (docs/permissions.md § Champ). A form whose descriptor no longer parses
  // reads as « no field »: the union was built from the ones that do.
  const seenForms = await Promise.all(
    ordered.map(async (form) => (await readableForm(form.schema))?.readableNames)
  );
  const entries: ViewEntry[] = ordered.flatMap((form, index) => {
    const readable = seenForms[index] ?? new Set<string>();
    return form.entries.map((page) => {
      const data = readEntryData(page.current?.data);
      const values: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(data)) {
        if (keptNames.has(name) && readable.has(name)) values[name] = value;
      }
      values.$form = form.slug;
      values.$owner = displayName(page.owner);
      values.$createdAt = page.createdAt.toISOString();
      values.$editedAt = (page.current?.createdAt ?? page.createdAt).toISOString();
      const title = data.title;
      return {
        slug: page.slug,
        title: typeof title === "string" ? title : page.slug,
        values,
      };
    });
  });

  // Forms chosen but still empty: samples over the first form's real schema,
  // so the preview matches the fields the author configured — cut like the
  // rest, so that a restricted field is not even named by an invented value.
  if (entries.length === 0 && ordered.length > 0) {
    const seen = await readableForm(ordered[0].schema);
    if (seen) {
      return {
        fields: kept,
        entries: sampleEntries(seen.readable, today, ordered[0].slug),
        sample: true,
        formNames,
        permissions: {},
      };
    }
  }

  // Decided here rather than in the row: the person is resolved once for the
  // request (modules/permissions/person.ts), and the rules are pure — so a formful of
  // entries costs the loop and nothing else.
  const permissions: Record<string, PagePermissions> = {};
  for (const form of ordered) {
    for (const page of form.entries) {
      permissions[page.slug] = await currentPermissions(page);
    }
  }

  return { fields: kept, entries, sample: false, formNames, permissions };
}
