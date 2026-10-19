// Reading Date / heure and Période values outside the entry form
// (docs/forms.md § Date / heure et Période): the French text every display
// shares — default rendering, entry template, automatic title, entry views —
// and the span the dated views place on their timeline. A stored value
// carries its own format, so neither needs the field's settings.

import {
  type TemporalParts,
  isTemporalRange,
  parseTemporal,
} from "./temporal-value/formats";

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

interface DayParts {
  day: string;
  month: string;
  year: string;
}

function dayParts(date: string): DayParts {
  const [year, month, day] = date.split("-").map(Number);
  return {
    day: day === 1 ? "1er" : String(day),
    month: MONTHS[month - 1],
    year: String(year),
  };
}

function formatDate(date: string): string {
  const { day, month, year } = dayParts(date);
  return `${day} ${month} ${year}`;
}

/** `18h30`, `12h`, `9h05`: the hour unpadded, a full hour without minutes. */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  return `${Number(hours)}h${minutes === "00" ? "" : minutes}`;
}

function formatBound({ date, time }: TemporalParts): string {
  if (date && time) return `${formatDate(date)} à ${formatTime(time)}`;
  if (date) return formatDate(date);
  return time ? formatTime(time) : "";
}

// Dates only: what the two bounds share is written once — `du 3 au 5
// novembre 2026`, `du 30 octobre au 2 novembre 2026`.
function formatDayRange(start: string, end: string): string {
  if (start === end) return formatDate(start);
  const from = dayParts(start);
  const to = dayParts(end);
  if (from.year !== to.year) {
    return `du ${formatDate(start)} au ${formatDate(end)}`;
  }
  const head = from.month === to.month ? from.day : `${from.day} ${from.month}`;
  return `du ${head} au ${to.day} ${to.month} ${to.year}`;
}

function formatRange(start: TemporalParts, end: TemporalParts): string {
  if (!start.date || !end.date) {
    return `de ${formatBound(start)} à ${formatBound(end)}`;
  }
  if (!start.time || !end.time) return formatDayRange(start.date, end.date);
  if (start.date === end.date) {
    return `${formatDate(start.date)}, de ${formatTime(start.time)} à ${formatTime(end.time)}`;
  }
  return `du ${formatBound(start)} au ${formatBound(end)}`;
}

/**
 * The French text of a Date / heure or Période value: `3 novembre 2026 à
 * 18h30`, `du 3 au 5 novembre 2026`, `de 9h à 12h30`. Empty for no value; a
 * string that is no readable value comes back as it is.
 */
export function formatTemporalValue(value: unknown): string {
  if (isTemporalRange(value)) {
    const start = parseTemporal(value.start);
    const end = parseTemporal(value.end);
    return start && end ? formatRange(start, end) : "";
  }
  if (typeof value !== "string") return "";
  const parts = parseTemporal(value);
  return parts ? formatBound(parts) : value;
}

/** Where a value sits on a timeline: ISO start and end, all day without time. */
export interface TemporalSpan {
  start: string;
  end: string;
  allDay: boolean;
}

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}/;

/**
 * The span of a value — start and end equal for a single one. Null when the
 * value has no date: empty, or a time alone. A pseudo-field timestamp counts
 * as its day.
 */
export function temporalSpan(value: unknown): TemporalSpan | null {
  if (isTemporalRange(value)) {
    const start = parseTemporal(value.start);
    if (!start?.date || !parseTemporal(value.end)?.date) return null;
    return { start: value.start, end: value.end, allDay: !start.time };
  }
  if (typeof value !== "string") return null;
  const parts = parseTemporal(value);
  if (parts?.date) return { start: value, end: value, allDay: !parts.time };
  const day = TIMESTAMP.exec(value)?.[1];
  return day ? { start: day, end: day, allDay: true } : null;
}

/**
 * What a date block cannot say about a span — the time, the time range, or
 * the last day: `18h30`, `de 18h30 à 22h`, `Jusqu'au 1er novembre`, `8h30,
 * jusqu'au 4 décembre à 16h`. Empty for one whole day.
 */
export function dateBlockCaption(span: TemporalSpan): string {
  const start = parseTemporal(span.start);
  const end = parseTemporal(span.end);
  if (!start?.date || !end?.date) return "";
  if (start.date === end.date) {
    if (!start.time || !end.time) return "";
    return start.time === end.time
      ? formatTime(start.time)
      : `de ${formatTime(start.time)} à ${formatTime(end.time)}`;
  }
  const { day, month } = dayParts(end.date);
  return start.time && end.time
    ? `${formatTime(start.time)}, jusqu'au ${day} ${month} à ${formatTime(end.time)}`
    : `Jusqu'au ${day} ${month}`;
}

function sortKey(value: unknown): [string, string] | null {
  if (isTemporalRange(value)) return [value.start, value.end];
  return typeof value === "string" && value !== "" ? [value, value] : null;
}

function compareIso(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Chronological order of two Date / heure or Période values — by start, then
 * end; a date alone before the same date with a time, its ISO string being
 * shorter. Null when either is no value.
 */
export function compareTemporalValues(left: unknown, right: unknown): number | null {
  const leftKey = sortKey(left);
  const rightKey = sortKey(right);
  if (!leftKey || !rightKey) return null;
  return compareIso(leftKey[0], rightKey[0]) || compareIso(leftKey[1], rightKey[1]);
}
