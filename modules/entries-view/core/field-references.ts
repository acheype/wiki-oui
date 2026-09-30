import type { EntriesViewProps } from "../views/types";
import type { EntriesViewQuery } from "./actions";

const SINGLE_FIELD_PROPS = [
  "titleField",
  "subtitleField",
  "visualField",
  "textField",
  "footerField",
  "badgeField",
  "colorField",
  "iconField",
  "hoverField",
  "startDateField",
  "endDateField",
  "captionField",
  "periodField",
] as const satisfies readonly (keyof EntriesViewProps)[];

/** The complete server query implied by an EntriesView configuration. */
export function entriesViewQuery(
  forms: string[],
  props: EntriesViewProps
): EntriesViewQuery {
  const fields = new Set<string>();
  for (const prop of SINGLE_FIELD_PROPS) {
    const field = props[prop];
    if (field) fields.add(field);
  }
  for (const field of configuredFieldNames(props.sumFields)) fields.add(field);
  for (const row of [
    ...(props.columns ?? []),
    ...(props.filters ?? []),
    ...(props.sortOptions ?? []),
  ]) {
    fields.add(row.field);
  }
  if (props.sortField) fields.add(props.sortField);
  for (const field of configuredFieldNames(props.searchFields)) fields.add(field);

  return {
    forms,
    fields: [...fields].sort(),
    allFields: props.view === "table" && (props.columns ?? []).length === 0,
    allTextFields:
      props.search === true &&
      configuredFieldNames(props.searchFields).length === 0,
    mapFields: props.view === "map",
  };
}

export function configuredFieldNames(
  value: string | string[] | undefined
): string[] {
  if (typeof value === "string") return value !== "" ? [value] : [];
  return value ?? [];
}
