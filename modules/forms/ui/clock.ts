// Times of day as the entry widgets handle them: `HH:mm` strings, counted in
// minutes since midnight so a period's start and end can be compared and
// shifted within one day.

const MINUTES_IN_A_DAY = 24 * 60;

/** Minutes since midnight of a complete `HH:mm`; null for anything else. */
export function minutesOf(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** `time` moved by `minutes`; null when it would leave the day. */
export function shiftTime(time: string, minutes: number): string | null {
  const start = minutesOf(time);
  if (start === null) return null;
  const shifted = start + minutes;
  if (shifted < 0 || shifted >= MINUTES_IN_A_DAY) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(shifted / 60))}:${pad(shifted % 60)}`;
}
