const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
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
