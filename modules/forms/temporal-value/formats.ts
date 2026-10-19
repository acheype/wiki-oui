// The stored shape of a Date / heure value (docs/forms.md § Date / heure et
// Période): local ISO strings, no time zone. A value carries its own format —
// `yyyy-mm-dd`, `yyyy-mm-ddTHH:mm` or `HH:mm` — so readers never need the
// field's settings to interpret it. A missing time means "all day", never
// midnight.

export const TEMPORAL_FORMATS = ["datetime", "date", "time"] as const;

export type TemporalFormat = (typeof TEMPORAL_FORMATS)[number];

/** The two field types holding temporal values: Date / heure and Période. */
export function isTemporalType(
  type: string
): type is "datetime" | "datetimeRange" {
  return type === "datetime" || type === "datetimeRange";
}

/** A Date / heure or Période field, narrowed to its own settings. */
export function isTemporalField<Field extends { type: string }>(
  field: Field
): field is Extract<Field, { type: "datetime" | "datetimeRange" }> {
  return isTemporalType(field.type);
}

/** The settings a Date / heure or Période field poses on its values. */
export interface TemporalSettings {
  format?: TemporalFormat;
  optionalTime?: boolean;
}

/** One bound, split: a date, a time, or both. */
export interface TemporalParts {
  date?: string;
  time?: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const AWAITING_TIME = /^\d{4}-\d{2}-\d{2}T$/;

function isRealDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Splits a stored bound into its parts; null when it is no valid bound. */
export function parseTemporal(value: unknown): TemporalParts | null {
  if (typeof value !== "string") return null;
  if (TIME.test(value)) return { time: value };
  const [date, time, extra] = value.split("T");
  if (extra !== undefined || !isRealDate(date)) return null;
  if (time === undefined) return { date };
  return TIME.test(time) ? { date, time } : null;
}

/** Joins parts back into the stored string ("" when both are absent). */
export function joinTemporal({ date, time }: TemporalParts): string {
  if (date && time) return `${date}T${time}`;
  return date ?? time ?? "";
}

export function resolvedFormat(settings: TemporalSettings): TemporalFormat {
  return settings.format ?? "datetime";
}

// The time may be left out only in Date et heure mode with « Heure
// facultative » on — the default, so an absent setting means optional.
export function timeIsOptional(settings: TemporalSettings): boolean {
  return resolvedFormat(settings) === "datetime" && settings.optionalTime !== false;
}

/** Whether a stored bound fits the field's mode, or the French reason why not. */
export function boundIssue(
  value: unknown,
  settings: TemporalSettings
): string | null {
  const format = resolvedFormat(settings);
  // The entry form's way of saying « Toute la journée » is unchecked and no
  // time is entered yet (temporal-input.tsx): a date waiting for its time.
  if (typeof value === "string" && AWAITING_TIME.test(value)) {
    return "Saisissez une heure.";
  }
  const parts = parseTemporal(value);
  if (!parts) {
    // A real date before the « T » means the time is what went wrong.
    const datePart = typeof value === "string" ? value.split("T")[0] : "";
    return format === "time" || isRealDate(datePart)
      ? "Heure invalide."
      : "Date invalide.";
  }
  switch (format) {
    case "date":
      return parts.date && !parts.time ? null : "Saisissez une date seule.";
    case "time":
      return parts.time && !parts.date ? null : "Saisissez une heure seule.";
    case "datetime":
      if (!parts.date) return "Saisissez une date.";
      if (!parts.time && !timeIsOptional(settings)) return "Saisissez une heure.";
      return null;
  }
}

/** A Période value as stored: one object holding both bounds. */
export interface TemporalRange {
  start: string;
  end: string;
}

export function isTemporalRange(value: unknown): value is TemporalRange {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as TemporalRange).start === "string" &&
    typeof (value as TemporalRange).end === "string"
  );
}

/** A Période left blank: absent, or both bounds empty. */
export function isEmptyRange(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  return isTemporalRange(value) && value.start === "" && value.end === "";
}

// A filled Période has both bounds, each fitting the mode, both with a time or
// both without (the « Toute la journée » box covers the two), and its start
// before its end — strictly once times are involved: an all-day period may
// last one day, a timed one cannot end when it starts. Bounds of one shape
// compare as plain strings, the ISO order being the chronological one.
export function rangeIssue(
  value: unknown,
  settings: TemporalSettings
): string | null {
  if (!isTemporalRange(value)) return "Période invalide.";
  if (value.start === "") return "Saisissez le début.";
  if (value.end === "") return "Saisissez la fin.";
  for (const [bound, name] of [["start", "Début"], ["end", "Fin"]] as const) {
    const issue = boundIssue(value[bound], settings);
    if (issue) return `${name}\u00A0: ${issue.charAt(0).toLowerCase()}${issue.slice(1)}`;
  }
  const start = parseTemporal(value.start);
  const end = parseTemporal(value.end);
  if (Boolean(start?.time) !== Boolean(end?.time)) {
    return "Saisissez une heure pour le début et la fin, ou pour aucun des deux.";
  }
  const timed = Boolean(start?.time);
  const ordered = timed ? value.start < value.end : value.start <= value.end;
  return ordered ? null : "La fin doit venir après le début.";
}
