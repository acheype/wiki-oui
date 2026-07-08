const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
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
