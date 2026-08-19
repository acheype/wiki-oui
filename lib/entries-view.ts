// EntriesView client logic (docs/entries-view.md): the pure in-memory rules
// the component applies on the loaded entries — search, filters with live
// counts, sort, period, pagination. Everything runs on the full payload the
// Server Action returned (latency-zero interactions); server-side filtering
// would slot in behind these signatures if scale ever demands it.

import type { EntryFieldChoice } from "./entry-fields";
import { valueToText } from "./form-descriptor";
import { isPseudoField } from "./pseudo-fields";
import { fold } from "./tag-suggestions";

/** One entry as the view consumes it: referenced field values only. */
export interface ViewEntry {
  slug: string;
  title: string;
  // Field values under their names; pseudo-fields under their $ names
  // ($createdAt/$editedAt as ISO datetimes, $form as the form slug).
  values: Record<string, unknown>;
}

/** The value a view reads for a field name (pseudo-fields included). */
export function entryValue(entry: ViewEntry, field: string): unknown {
  return entry.values[field];
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/** The field types the default search sweeps (docs/entries-view.md). */
export const TEXT_SEARCH_TYPES = [
  "title",
  "text",
  "textarea",
  "email",
  "url",
] as const;

export function defaultSearchFields(fields: EntryFieldChoice[]): string[] {
  return fields
    .filter((field) =>
      (TEXT_SEARCH_TYPES as readonly string[]).includes(field.type)
    )
    .map((field) => field.name);
}

export function searchEntries(
  entries: ViewEntry[],
  query: string,
  searchFields: string[]
): ViewEntry[] {
  const needle = fold(query.trim());
  if (needle === "") return entries;
  return entries.filter((entry) =>
    searchFields.some((field) =>
      fold(valueToText(entryValue(entry, field))).includes(needle)
    )
  );
}

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

/** Active selections: field → picked option values (empty set = inactive). */
export type ActiveFilters = Record<string, string[]>;

// One entry against one filter: OR within the filter's picked values —
// a multiChoice matches on any overlap, tags likewise.
function matchesFilter(
  entry: ViewEntry,
  field: string,
  picked: string[]
): boolean {
  if (picked.length === 0) return true;
  const value = entryValue(entry, field);
  const values = Array.isArray(value) ? value : [value];
  return picked.some((option) => values.includes(option));
}

/** AND across filters, OR within one (the faceting standard). */
export function applyFilters(
  entries: ViewEntry[],
  active: ActiveFilters
): ViewEntry[] {
  const pairs = Object.entries(active).filter(([, picked]) => picked.length > 0);
  if (pairs.length === 0) return entries;
  return entries.filter((entry) =>
    pairs.every(([field, picked]) => matchesFilter(entry, field, picked))
  );
}

/**
 * Live counts (docs/entries-view.md): for each option of `field`, how many
 * entries would match it under every *other* active filter — so a count
 * answers "what happens if I pick this", never counting the filter against
 * itself (its options stay reachable).
 */
export function filterCounts(
  entries: ViewEntry[],
  field: string,
  optionValues: string[],
  active: ActiveFilters
): Record<string, number> {
  const others = Object.fromEntries(
    Object.entries(active).filter(([name]) => name !== field)
  );
  const scoped = applyFilters(entries, others);
  return Object.fromEntries(
    optionValues.map((option) => [
      option,
      scoped.filter((entry) => matchesFilter(entry, field, [option])).length,
    ])
  );
}

export function hasActiveFilter(active: ActiveFilters): boolean {
  return Object.values(active).some((picked) => picked.length > 0);
}

/* ------------------------------------------------------------------ *
 * Sort
 * ------------------------------------------------------------------ */

export function sortEntries(
  entries: ViewEntry[],
  sortField: string,
  sortOrder: "asc" | "desc"
): ViewEntry[] {
  const direction = sortOrder === "desc" ? -1 : 1;
  return [...entries].sort((a, b) => {
    const left = entryValue(a, sortField);
    const right = entryValue(b, sortField);
    // Empty values sink to the end whatever the direction — a list should
    // lead with the entries that have something to show.
    const leftEmpty = isBlank(left);
    const rightEmpty = isBlank(right);
    if (leftEmpty || rightEmpty) return Number(leftEmpty) - Number(rightEmpty);
    return compareValues(left, right) * direction;
  });
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

// Numbers numerically; everything else as folded text (ISO dates order
// lexically).
function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return fold(valueToText(left)).localeCompare(fold(valueToText(right)), "fr");
}

/* ------------------------------------------------------------------ *
 * Period (docs/entries-view.md — the admin restriction, not a visitor filter)
 * ------------------------------------------------------------------ */

export const PERIODS = [
  "future",
  "past",
  "today",
  "last-30-days",
  "next-30-days",
  "one-week-around",
  "last-2-years",
] as const;

export type Period = (typeof PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** [from, to] bounds (inclusive, yyyy-mm-dd) for a period around `today`. */
function periodBounds(
  period: Period,
  today: string
): { from?: string; to?: string } {
  const shift = (days: number) =>
    new Date(new Date(`${today}T00:00:00Z`).getTime() + days * DAY_MS)
      .toISOString()
      .slice(0, 10);
  switch (period) {
    case "future":
      return { from: today };
    case "past":
      return { to: shift(-1) };
    case "today":
      return { from: today, to: today };
    case "last-30-days":
      return { from: shift(-30), to: today };
    case "next-30-days":
      return { from: today, to: shift(30) };
    case "one-week-around":
      return { from: shift(-7), to: shift(7) };
    case "last-2-years":
      return { from: shift(-730), to: today };
  }
}

/**
 * Keeps the entries whose date field falls in the period. An entry without a
 * date on that field is dropped: a period is a restriction on a date, and a
 * dateless entry cannot satisfy it. `today` is injected (yyyy-mm-dd) so the
 * rule stays pure and testable.
 */
export function applyPeriod(
  entries: ViewEntry[],
  period: Period,
  periodField: string,
  today: string
): ViewEntry[] {
  const { from, to } = periodBounds(period, today);
  return entries.filter((entry) => {
    const day = entryDay(entryValue(entry, periodField));
    if (day === null) return false;
    return (!from || day >= from) && (!to || day <= to);
  });
}

/** yyyy-mm-dd of a date value (entry date, or pseudo-field ISO datetime). */
export function entryDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/* ------------------------------------------------------------------ *
 * The full pipeline, in the order the spec fixes
 * ------------------------------------------------------------------ */

export interface EntriesQueryState {
  search: string;
  searchFields: string[];
  filters: ActiveFilters;
  sortField: string;
  sortOrder: "asc" | "desc";
}

/** Search → filters → sort, the interactive part (period and limit are the
 * admin's source restrictions, applied before this by the component). */
export function queryEntries(
  entries: ViewEntry[],
  state: EntriesQueryState
): ViewEntry[] {
  const searched = searchEntries(entries, state.search, state.searchFields);
  const filtered = applyFilters(searched, state.filters);
  return sortEntries(filtered, state.sortField, state.sortOrder);
}

/** Alphabetical groups of the Annuaire: initial letter → entries, letters
 * without entries absent (the index greys them). Diacritics fold ("É" → E);
 * a title starting outside A–Z groups under "#". */
export function directoryGroups(
  entries: ViewEntry[]
): { letter: string; entries: ViewEntry[] }[] {
  const sorted = [...entries].sort((a, b) =>
    fold(a.title).localeCompare(fold(b.title), "fr")
  );
  const groups = new Map<string, ViewEntry[]>();
  for (const entry of sorted) {
    const initial = fold(entry.title).charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(initial) ? initial : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), entry]);
  }
  return [...groups.entries()].map(([letter, grouped]) => ({
    letter,
    entries: grouped,
  }));
}

/* ------------------------------------------------------------------ *
 * Referenced fields — what the Server Action is asked for
 * ------------------------------------------------------------------ */

/** The EntriesView props that reference fields, flattened to names. */
export interface FieldReferences {
  names: string[];
  /** true = every field (a Tableau without explicit columns). */
  all: boolean;
  /** Include the text-searchable fields (search on, searchFields empty). */
  allTextFields: boolean;
  /** Include the geolocation + image fields (the Carte reads them implicitly). */
  mapFields: boolean;
}

/** Collects the field names a configuration reads, pseudo-fields included
 * (the Server Action only returns these — docs/entries-view.md). */
export function collectFieldReferences(config: {
  view: string;
  columns?: { field: string }[];
  filters?: { field: string }[];
  sortOptions?: { field: string }[];
  sortField?: string;
  search?: boolean;
  searchFields?: string[];
  fieldProps: (string | undefined)[];
}): FieldReferences {
  const names = new Set<string>();
  for (const name of config.fieldProps) {
    if (name) names.add(name);
  }
  for (const row of [
    ...(config.columns ?? []),
    ...(config.filters ?? []),
    ...(config.sortOptions ?? []),
  ]) {
    names.add(row.field);
  }
  if (config.sortField) names.add(config.sortField);
  for (const name of config.searchFields ?? []) names.add(name);
  return {
    names: [...names],
    all: config.view === "table" && (config.columns ?? []).length === 0,
    allTextFields:
      config.search === true && (config.searchFields ?? []).length === 0,
    mapFields: config.view === "map",
  };
}

/** Split a reference list into real field names and pseudo-fields. */
export function splitPseudo(names: string[]): {
  real: string[];
  pseudo: string[];
} {
  return {
    real: names.filter((name) => !isPseudoField(name)),
    pseudo: names.filter((name) => isPseudoField(name)),
  };
}
