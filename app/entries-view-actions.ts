"use server";

// Read Server Action of <EntriesView> (docs/entries-view.md, motif ADR
// 0014): the client component loads everything once, then searches, filters
// and sorts in memory. Guard rail: only the *referenced* fields travel —
// the caller announces what its configuration reads, and the payload holds
// nothing else (pseudo-fields excepted: four tiny metadata values).

import { listEntryFieldChoices } from "@/app/form-actions";
import type { EntryFieldChoice } from "@/lib/entry-fields";
import type { ViewEntry } from "@/lib/entries-view";
import { parseFormDescriptor, readEntryData } from "@/lib/form-descriptor";
import { listFormsWithEntries } from "@/lib/forms";
import {
  FALLBACK_SAMPLE_DESCRIPTOR,
  sampleEntries,
} from "@/lib/sample-entries";
import { TEXT_SEARCH_TYPES } from "@/lib/entries-view";
import { displayName } from "@/lib/username";

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

  const entries: ViewEntry[] = ordered.flatMap((form) =>
    form.entries.map((page) => {
      const data = readEntryData(page.current?.data);
      const values: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(data)) {
        if (keptNames.has(name)) values[name] = value;
      }
      // The Page's tags mirror the tags field but the Page is the source of
      // truth (docs/forms.md): serve them under the form's tags field name.
      const tagsField = kept.find((choice) => choice.type === "tags");
      if (tagsField) values[tagsField.name] = page.tags;
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
    })
  );

  // Forms chosen but still empty: samples over the first form's real schema,
  // so the preview matches the fields the author configured.
  if (entries.length === 0 && ordered.length > 0) {
    const parsed = parseFormDescriptor(ordered[0].schema);
    if (parsed.descriptor) {
      return {
        fields: kept,
        entries: sampleEntries(parsed.descriptor, today, ordered[0].slug),
        sample: true,
        formNames,
      };
    }
  }

  return { fields: kept, entries, sample: false, formNames };
}
