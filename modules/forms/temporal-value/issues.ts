// Why a Date / heure or Période value is refused, in words that say what to
// do — with the value at stake when there is one: « Choisissez une heure de
// fin après 18h30. » (docs/forms.md § Validation d'une Période).

import { formatTemporalValue } from "../temporal-value";
import {
  AWAITING_TIME,
  type TemporalSettings,
  isRealDate,
  isTemporalRange,
  parseTemporal,
  resolvedFormat,
  timeIsOptional,
} from "./formats";

type Bound = "start" | "end";

const OF_BOUND: Record<Bound, string> = { start: " de début", end: " de fin" };

/** The message of a required field left empty. */
export function requiredMessage(settings: TemporalSettings): string {
  return resolvedFormat(settings) === "time"
    ? "Saisissez l'heure."
    : "Choisissez une date.";
}

/**
 * Whether one stored value — a Date / heure, or one bound of a Période —
 * fits the field's mode; if not, what to do about it.
 */
export function boundIssue(
  value: unknown,
  settings: TemporalSettings,
  bound?: Bound
): string | null {
  const of = bound ? OF_BOUND[bound] : "";
  // The box is offered beside a single Date / heure; a Période's box sits
  // above both bounds, where its own message would only repeat it.
  const orTheBox =
    !bound && timeIsOptional(settings)
      ? ", ou cochez « Toute la journée »"
      : "";
  const askTime = `Saisissez l'heure${of}${orTheBox}.`;
  const askDate = `Choisissez la date${of}.`;
  const format = resolvedFormat(settings);

  // A date waiting for its time: « Toute la journée » is unchecked and no
  // time is entered yet (temporal-input.tsx).
  if (typeof value === "string" && AWAITING_TIME.test(value)) return askTime;
  const parts = parseTemporal(value);
  if (!parts) {
    const datePart = typeof value === "string" ? value.split("T")[0] : "";
    return format === "time" || isRealDate(datePart)
      ? `Complétez l'heure${of} (par exemple 18:30).`
      : askDate;
  }
  switch (format) {
    case "date":
      return parts.date && !parts.time ? null : askDate;
    case "time":
      return parts.time && !parts.date ? null : askTime;
    case "datetime":
      if (!parts.date) return askDate;
      if (!parts.time && !timeIsOptional(settings)) return askTime;
      return null;
  }
}

/**
 * Whether a filled Période holds: both bounds, each fitting the mode, both
 * with a time or both without (one « Toute la journée » box covers the two),
 * and its start before its end — strictly once times are involved: an
 * all-day period may last one day, a timed one cannot end when it starts.
 * Bounds of one shape compare as plain strings, ISO order being chronological.
 */
export function rangeIssue(
  value: unknown,
  settings: TemporalSettings
): string | null {
  const timeOnly = resolvedFormat(settings) === "time";
  if (!isTemporalRange(value)) return requiredMessage(settings);
  if (value.start === "") {
    return timeOnly ? "Saisissez l'heure de début." : "Choisissez la date.";
  }
  if (value.end === "") {
    return timeOnly ? "Saisissez l'heure de fin." : "Choisissez la date de fin.";
  }
  for (const bound of ["start", "end"] as const) {
    const issue = boundIssue(value[bound], settings, bound);
    if (issue) return issue;
  }
  const start = parseTemporal(value.start)!;
  const end = parseTemporal(value.end)!;
  if (Boolean(start.time) !== Boolean(end.time)) {
    return `Saisissez l'heure${OF_BOUND[start.time ? "end" : "start"]}.`;
  }
  const timed = Boolean(start.time);
  const ordered = timed ? value.start < value.end : value.start <= value.end;
  if (ordered) return null;
  if (start.date && end.date && end.date < start.date) {
    return `Choisissez une date de fin à partir du ${formatTemporalValue(start.date)}.`;
  }
  return `Choisissez une heure de fin après ${formatTemporalValue(start.time)}.`;
}
