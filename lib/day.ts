// Calendar-day arithmetic on ISO `yyyy-mm-dd` strings. Computed in UTC so a
// daylight saving change never turns a one-day step into 23 or 25 hours.

/** The day `days` days after `day` (before it when negative). */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
