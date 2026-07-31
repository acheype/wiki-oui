const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

// Generated name for anonymous uploads — pasted captures (ADR 0012).
export function captureFileName(extension: string): string {
  return `capture-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

// French notation: "1,2 Mo" (uploaded file sizes, ADR 0012).
export function formatFileSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} o`;
  const units = ["ko", "Mo", "Go"];
  let value = bytes;
  let unit = "o";
  for (const next of units) {
    if (value < 1000) break;
    value /= 1000;
    unit = next;
  }
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${unit}`;
}

const shortDateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatShortDateTime(date: Date): string {
  return shortDateTimeFormat.format(date);
}

// « 1 page », « 12 pages » — the French agreement, singular at zero and one,
// plural from two. One rule, so one place: the screens that count things
// (comptes, invitations, impact d'une suppression) all say it through here.
export function plural(total: number, one: string, many: string): string {
  return `${total} ${total > 1 ? many : one}`;
}

// "28/07" — a date the reader only needs to situate, as on the line of a
// pending invitation, where the hour would say nothing.
const dayMonthFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
});

export function formatDayMonth(date: Date): string {
  return dayMonthFormat.format(date);
}
