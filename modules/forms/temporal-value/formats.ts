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
export const AWAITING_TIME = /^\d{4}-\d{2}-\d{2}T$/;

export function isRealDate(text: string): boolean {
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

/**
 * Whether a value being entered is finished enough to be judged: empty, or
 * every bound complete. A time half typed, a date awaiting its time, a time
 * whose date is still to be chosen, or a Période with one bound left are
 * still on their way.
 */
export function isSettled(settings: TemporalSettings, value: unknown): boolean {
  if (isEmptyRange(value)) return true;
  const expectsDate = resolvedFormat(settings) !== "time";
  const settledBound = (bound: unknown) => {
    const parts = parseTemporal(bound);
    return parts !== null && (!expectsDate || parts.date !== undefined);
  };
  if (isTemporalRange(value)) return settledBound(value.start) && settledBound(value.end);
  return settledBound(value);
}
