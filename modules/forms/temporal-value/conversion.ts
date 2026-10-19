// What a change of mode does to the values already stored (docs/forms.md §
// Changer le mode d'un champ): a value is converted when the conversion
// invents nothing, and kept otherwise — like a field turned required, a value
// missing its time asks for it at the entry's next edit.

import type { EntryData, FormDescriptor, FormField } from "../form-descriptor";
import {
  type TemporalParts,
  type TemporalSettings,
  isEmptyRange,
  isTemporalField,
  isTemporalRange,
  joinTemporal,
  parseTemporal,
  resolvedFormat,
  timeIsOptional,
} from "./formats";

/** What the conversion did to one value, for the save confirmation. */
export type ConversionOutcome = "timeDropped" | "emptied" | "timeMissing";

export interface ConvertedValue {
  value: unknown;
  outcome: ConversionOutcome | null;
}

function convertBound(
  bound: string,
  after: TemporalSettings
): { value: string; outcome: ConversionOutcome | null } {
  const parts: TemporalParts | null = parseTemporal(bound);
  // An unreadable value is no conversion's business: it stays, and the entry
  // form asks for a valid one at the next edit.
  if (!parts) return { value: bound, outcome: null };
  switch (resolvedFormat(after)) {
    case "time":
      return parts.date
        ? { value: "", outcome: "emptied" }
        : { value: bound, outcome: null };
    case "date":
      if (!parts.date) return { value: "", outcome: "emptied" };
      return parts.time
        ? { value: joinTemporal({ date: parts.date }), outcome: "timeDropped" }
        : { value: bound, outcome: null };
    case "datetime":
      if (!parts.date) return { value: "", outcome: "emptied" };
      return !parts.time && !timeIsOptional(after)
        ? { value: bound, outcome: "timeMissing" }
        : { value: bound, outcome: null };
  }
}

// Outcomes rank by what they cost the entry: losing the value outweighs
// losing a time, which outweighs keeping a value incomplete.
const RANK: Record<ConversionOutcome, number> = {
  emptied: 3,
  timeDropped: 2,
  timeMissing: 1,
};

function worst(
  left: ConversionOutcome | null,
  right: ConversionOutcome | null
): ConversionOutcome | null {
  if (!left) return right;
  if (!right) return left;
  return RANK[left] >= RANK[right] ? left : right;
}

/**
 * Converts one stored Date / heure or Période value to a field's new
 * settings. The former settings play no part: a value carries its own format.
 */
export function convertTemporalValue(
  value: unknown,
  after: TemporalSettings
): ConvertedValue {
  if (isTemporalRange(value)) {
    if (isEmptyRange(value)) return { value, outcome: null };
    const start = convertBound(value.start, after);
    const end = convertBound(value.end, after);
    const outcome = worst(start.outcome, end.outcome);
    // A Période is filled whole or not at all: one emptied bound empties it.
    if (outcome === "emptied") return { value: undefined, outcome };
    return { value: { start: start.value, end: end.value }, outcome };
  }
  if (typeof value !== "string" || value === "") return { value, outcome: null };
  return convertBound(value, after);
}

/** A Date / heure or Période field whose mode this save changes. */
export interface TemporalModeChange {
  /** The field's name after the save (renames already applied). */
  name: string;
  label: string;
  settings: TemporalSettings;
}

type TemporalField = Extract<FormField, { type: "datetime" | "datetimeRange" }>;

function settingsOf(field: TemporalField): TemporalSettings {
  return {
    ...(field.format !== undefined && { format: field.format }),
    ...(field.optionalTime !== undefined && { optionalTime: field.optionalTime }),
  };
}

function sameMode(left: TemporalSettings, right: TemporalSettings): boolean {
  return (
    resolvedFormat(left) === resolvedFormat(right) &&
    timeIsOptional(left) === timeIsOptional(right)
  );
}

/**
 * The fields of the stored form whose mode the candidate changes. A field is
 * followed through this save's renames (`renames`: stored name → new name);
 * a field the save adds has no stored values to convert.
 */
export function temporalModeChanges(
  before: FormDescriptor,
  after: FormDescriptor,
  renames: ReadonlyMap<string, string>
): TemporalModeChange[] {
  const stored = new Map<string, TemporalField>();
  for (const field of before.fields) {
    if (isTemporalField(field)) stored.set(renames.get(field.name) ?? field.name, field);
  }
  return after.fields.flatMap((field) => {
    if (!isTemporalField(field)) return [];
    const previous = stored.get(field.name);
    if (!previous || previous.type !== field.type) return [];
    const settings = settingsOf(field);
    return sameMode(settingsOf(previous), settings)
      ? []
      : [{ name: field.name, label: field.label, settings }];
  });
}

/** One entry's values once converted, and what each changed field lost. */
export function convertEntryValues(
  data: EntryData,
  changes: readonly TemporalModeChange[]
): { data: EntryData; outcomes: Record<string, ConversionOutcome> } {
  const converted: EntryData = { ...data };
  const outcomes: Record<string, ConversionOutcome> = {};
  for (const change of changes) {
    if (!(change.name in data)) continue;
    const { value, outcome } = convertTemporalValue(data[change.name], change.settings);
    if (value === undefined) delete converted[change.name];
    else converted[change.name] = value;
    if (outcome) outcomes[change.name] = outcome;
  }
  return { data: converted, outcomes };
}
