import { entryValue } from "./rules";
import type { EntriesViewData } from "./actions";

type FieldOption = [value: string, label: string];

/** Options shown for a configured field, whatever their source. */
export function fieldOptions(
  data: EntriesViewData,
  field: string
): FieldOption[] {
  if (field === "$form") return Object.entries(data.formNames);

  const declared = data.fields.find(
    (choice) => choice.name === field
  )?.options;
  if (declared) return Object.entries(declared);

  const seen = new Set<string>();
  for (const entry of data.entries) {
    const value = entryValue(entry, field);
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string" && item !== "") seen.add(item);
    }
  }
  return [...seen]
    .sort((left, right) => left.localeCompare(right, "fr"))
    .map((value) => [value, value]);
}
