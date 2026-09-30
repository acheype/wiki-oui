import type { EntriesViewProps } from "../views/types";
import type { ViewEntry } from "../view-entry";
import type { EntriesViewData } from "./actions";
import {
  type ActiveFilters,
  applyPeriod,
  defaultSearchFields,
  queryEntries,
} from "./rules";
import { configuredFieldNames } from "./field-references";

interface EntriesSelectionState {
  search: string;
  filters: ActiveFilters;
  sort: { field: string; order: "asc" | "desc" } | null;
  page: number;
}

interface EntriesSelection {
  /** All entries satisfying the author's period restriction. */
  candidates: ViewEntry[];
  /** Search and filter matches, sorted and then capped by `limit`. */
  results: ViewEntry[];
  pageEntries: ViewEntry[];
  activeSort: { field: string; order: "asc" | "desc" };
  page: number;
  pageCount: number;
}

/**
 * Resolves the complete EntriesView selection pipeline. Visitor interactions
 * run over every period-eligible entry; the author's result limit is applied
 * only afterwards, before pagination.
 */
export function selectEntries(
  data: EntriesViewData,
  props: EntriesViewProps,
  state: EntriesSelectionState,
  today: string
): EntriesSelection {
  const period = props.period ?? "none";
  const periodField =
    props.periodField ??
    props.startDateField ??
    data.fields.find((field) => field.type === "date")?.name;
  const candidates =
    period !== "none" && periodField
      ? applyPeriod(data.entries, period, periodField, today)
      : data.entries;

  const configuredSearchFields = configuredFieldNames(props.searchFields);
  const searchFields =
    configuredSearchFields.length > 0
      ? configuredSearchFields
      : defaultSearchFields(data.fields);
  const activeSort = state.sort ?? {
    field: props.sortField ?? "$createdAt",
    order: props.sortOrder ?? "desc",
  };
  const matches = queryEntries(candidates, {
    search: props.search === true ? state.search : "",
    searchFields,
    filters: state.filters,
    sortField: activeSort.field,
    sortOrder: activeSort.order,
  });
  const results =
    props.limit !== undefined && props.limit > 0
      ? matches.slice(0, props.limit)
      : matches;

  const pageSize = props.pageSize;
  const pageCount =
    pageSize && pageSize > 0
      ? Math.max(1, Math.ceil(results.length / pageSize))
      : 1;
  const page = Math.min(state.page, pageCount - 1);
  const pageEntries =
    pageSize && pageSize > 0
      ? results.slice(page * pageSize, (page + 1) * pageSize)
      : results;

  return {
    candidates,
    results,
    pageEntries,
    activeSort,
    page,
    pageCount,
  };
}
