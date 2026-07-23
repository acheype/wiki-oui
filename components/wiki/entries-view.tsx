"use client";

// <EntriesView> (docs/entries-view.md): one tag, nine views over the entries
// of one or several forms. A client component: the read Server Action loads
// everything once (referenced fields only), then search, filters, sort and
// pagination run in memory — latency zero. The chrome here is common to all
// views; each view renderer lives in internal/entries/.

import { ChevronDown, ExternalLink, ListFilter, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  type EntriesViewData,
  getEntriesViewData,
} from "@/app/entries-view-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ActiveFilters,
  type ViewEntry,
  applyPeriod,
  collectFieldReferences,
  defaultSearchFields,
  entryValue,
  filterCounts as computeFilterCounts,
  hasActiveFilter,
  queryEntries,
  sortEntries,
} from "@/lib/entries-view";
import { resolveColorMapping } from "@/lib/entry-fields";
import { valueToText } from "@/lib/form-descriptor";
import { PSEUDO_FIELD_LABELS, isPseudoField } from "@/lib/pseudo-fields";
import { cn } from "@/lib/utils";
import { Icon } from "./internal/icon";
import { AgendaView } from "./internal/entries/agenda-view";
import { CalendarView } from "./internal/entries/calendar-view";
import { CarouselView } from "./internal/entries/carousel-view";
import { DirectoryView } from "./internal/entries/directory-view";
import { WikiFrame } from "./internal/wiki-frame";

// Leaflet touches window at import time: the map view loads client-only.
const MapEntriesView = dynamic(
  () => import("./internal/entries/map-view").then((mod) => mod.MapEntriesView),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] animate-pulse rounded-lg border bg-muted/40" />
    ),
  }
);
import { GalleryView } from "./internal/entries/gallery-view";
import { GridView } from "./internal/entries/grid-view";
import { ListView } from "./internal/entries/list-view";
import { TableView } from "./internal/entries/table-view";
import {
  type EntriesViewProps,
  type FilterSpec,
  type ViewContext,
  type ViewName,
  defaultEntryDisplay,
} from "./internal/entries/types";

const EMPTY_ROWS: never[] = [];

export function EntriesView({
  form,
  view = "list",
  expandable = true,
  openOnClick = false,
  splitMultiChoice = false,
  actionsColumn = false,
  layout = "vertical",
  visualFit = "cover",
  textLines = 3,
  autoplay = true,
  interval = 5,
  captionField = "title",
  basemap = "osm",
  cluster = true,
  initialView = "month",
  planningRange = "year",
  compact = false,
  height = "500px",
  width = "100%",
  wheelZoom = false,
  search = false,
  filtersPosition = "left",
  filtersExpanded = "first",
  filterCounts = true,
  sortField = "$createdAt",
  sortOrder = "desc",
  period = "none",
  ...rest
}: EntriesViewProps) {
  const props: EntriesViewProps = {
    form,
    view,
    expandable,
    openOnClick,
    splitMultiChoice,
    actionsColumn,
    layout,
    visualFit,
    textLines,
    autoplay,
    interval,
    captionField,
    basemap,
    cluster,
    initialView,
    planningRange,
    compact,
    height,
    width,
    wheelZoom,
    search,
    filtersPosition,
    filtersExpanded,
    filterCounts,
    sortField,
    sortOrder,
    period,
    ...rest,
  };
  // `form` is required, but a hand-written tag may omit it (the save-time
  // lint warns): degrade to the sample preview rather than crash the page.
  const formSlugs = useMemo(
    () =>
      typeof form === "string"
        ? form !== ""
          ? [form]
          : []
        : Array.isArray(form)
          ? form.filter((slug): slug is string => typeof slug === "string" && slug !== "")
          : [],
    [form]
  );

  const data = useEntriesData(formSlugs, props);
  const [queryState, setQueryState] = useState(() => ({
    search: "",
    filters: {} as ActiveFilters,
    sort: null as { field: string; order: "asc" | "desc" } | null,
    page: 0,
  }));
  const [popupSlug, setPopupSlug] = useState<string | null>(null);

  if (data === null) {
    return (
      <div className="my-4 grid gap-2" aria-busy>
        <div className="h-9 w-64 animate-pulse rounded-md bg-muted/50" />
        <div className="h-40 animate-pulse rounded-md bg-muted/40" />
      </div>
    );
  }

  /* --- source restrictions (the admin's, before any interaction) --- */
  const today = new Date().toISOString().slice(0, 10);
  const periodField =
    props.periodField ??
    props.startDateField ??
    data.fields.find((field) => field.type === "date")?.name;
  let source = data.entries;
  if (period !== "none" && periodField) {
    source = applyPeriod(source, period, periodField, today);
  }
  source = sortEntries(source, sortField, sortOrder);
  if (props.limit !== undefined && props.limit > 0) {
    source = source.slice(0, props.limit);
  }

  /* --- interactive pipeline --- */
  const searchFields =
    toNames(props.searchFields).length > 0
      ? toNames(props.searchFields)
      : defaultSearchFields(data.fields);
  const activeSort = queryState.sort ?? { field: sortField, order: sortOrder };
  const entries = queryEntries(source, {
    search: search ? queryState.search : "",
    searchFields,
    filters: queryState.filters,
    sortField: activeSort.field,
    sortOrder: activeSort.order,
  });

  /* --- pagination --- */
  const pageSize = props.pageSize;
  const pageCount =
    pageSize && pageSize > 0 ? Math.max(1, Math.ceil(entries.length / pageSize)) : 1;
  const page = Math.min(queryState.page, pageCount - 1);
  const paged =
    pageSize && pageSize > 0
      ? entries.slice(page * pageSize, (page + 1) * pageSize)
      : entries;

  /* --- resolved styling + context --- */
  const context = buildContext(paged, data, props, (slug) => {
    if (data.sample) return;
    const display = props.entryDisplay ?? defaultEntryDisplay(view);
    if (display === "new-tab") window.open(`/${slug}`, "_blank");
    else if (display === "current-tab") window.location.assign(`/${slug}`);
    else setPopupSlug(slug);
  });

  const filters = props.filters ?? EMPTY_ROWS;
  const sortOptions = props.sortOptions ?? EMPTY_ROWS;
  const showFilters = filters.length > 0 && view !== "carousel";
  const showSearch = search && view !== "carousel";
  const showSort =
    sortOptions.length > 0 && ["list", "grid", "gallery"].includes(view);

  const setPartial = (patch: Partial<typeof queryState>) =>
    setQueryState((current) => ({ ...current, page: 0, ...patch }));

  // The Tableau owns its sort UI (clickable headers) through the context;
  // the Carte's map-popup opens the common modal directly.
  context.openPopup = (slug) => {
    if (!data.sample) setPopupSlug(slug);
  };
  context.sort = activeSort;
  context.onSort = (field) =>
    setPartial({
      sort:
        activeSort.field === field
          ? { field, order: activeSort.order === "asc" ? "desc" : "asc" }
          : { field, order: "asc" },
    });

  return (
    // not-prose: the wiki page's typography (list markers, link styling)
    // must not leak into the view chrome.
    <div className="not-prose my-4 grid gap-3">
      {data.sample && (
        <p className="rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground">
          Aperçu sur des données d&apos;exemple
        </p>
      )}

      {(showSearch || showSort) && (
        <div className="flex flex-wrap items-center gap-2">
          {showSearch && (
            <div className="relative">
              <Search
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={queryState.search}
                onChange={(event) => setPartial({ search: event.target.value })}
                placeholder="Rechercher…"
                className="w-56 pl-8"
                aria-label="Rechercher dans les fiches"
              />
            </div>
          )}
          {showSort && (
            <SortMenu
              options={sortOptions}
              active={activeSort}
              labelOf={context.labelOf}
              onChange={(sort) => setPartial({ sort })}
            />
          )}
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-4 md:flex-row",
          showFilters && filtersPosition === "right" && "md:flex-row-reverse"
        )}
      >
        {showFilters && (
          <FiltersPanel
            filters={filters}
            entries={source}
            active={queryState.filters}
            expanded={filtersExpanded}
            showCounts={filterCounts}
            context={context}
            onChange={(active) => setPartial({ filters: active })}
          />
        )}
        <div className="min-w-0 flex-1">
          {entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune fiche à afficher.
            </p>
          ) : (
            renderView(view, context)
          )}
          {pageCount > 1 && (
            <Pagination
              page={page}
              pageCount={pageCount}
              total={entries.length}
              onPage={(next) =>
                setQueryState((current) => ({ ...current, page: next }))
              }
            />
          )}
        </div>
      </div>

      <EntryPopup slug={popupSlug} onClose={() => setPopupSlug(null)} />
    </div>
  );
}

function renderView(view: ViewName, context: ViewContext): React.ReactNode {
  switch (view) {
    case "list":
      return <ListView context={context} />;
    case "grid":
      return <GridView context={context} />;
    case "table":
      return <TableView context={context} />;
    case "directory":
      return <DirectoryView context={context} />;
    case "gallery":
      return <GalleryView context={context} />;
    case "carousel":
      return <CarouselView context={context} />;
    case "map":
      return <MapEntriesView context={context} />;
    case "calendar":
      return <CalendarView context={context} />;
    case "agenda":
      return <AgendaView context={context} />;
  }
}

/* ------------------------------------------------------------------ *
 * Data loading — one Server Action call per configuration
 * ------------------------------------------------------------------ */

function useEntriesData(
  formSlugs: string[],
  props: EntriesViewProps
): EntriesViewData | null {
  const references = collectFieldReferences({
    view: props.view ?? "list",
    columns: props.columns,
    filters: props.filters,
    sortOptions: props.sortOptions,
    sortField: props.sortField,
    search: props.search,
    searchFields: toNames(props.searchFields),
    fieldProps: [
      props.titleField,
      props.subtitleField,
      props.visualField,
      props.textField,
      props.footerField,
      props.badgeField,
      props.colorField,
      props.iconField,
      props.hoverField,
      props.startDateField,
      props.endDateField,
      props.captionField,
      props.periodField,
      ...toNames(props.sumFields),
    ],
  });
  const key = JSON.stringify({
    forms: formSlugs,
    fields: references.names.sort(),
    all: references.all,
    text: references.allTextFields,
    map: references.mapFields,
  });
  const [loaded, setLoaded] = useState<{
    key: string;
    data: EntriesViewData;
  } | null>(null);

  useEffect(() => {
    const query = JSON.parse(key) as {
      forms: string[];
      fields: string[];
      all: boolean;
      text: boolean;
      map: boolean;
    };
    let live = true;
    getEntriesViewData({
      forms: query.forms,
      fields: query.fields,
      allFields: query.all,
      allTextFields: query.text,
      mapFields: query.map,
    }).then((data) => live && setLoaded({ key, data }));
    return () => {
      live = false;
    };
  }, [key]);

  return loaded?.key === key ? loaded.data : null;
}

function toNames(value: string | string[] | undefined): string[] {
  if (typeof value === "string") return value !== "" ? [value] : [];
  return value ?? [];
}

/* ------------------------------------------------------------------ *
 * Resolved context shared by the view renderers
 * ------------------------------------------------------------------ */

function buildContext(
  entries: ViewEntry[],
  data: EntriesViewData,
  props: EntriesViewProps,
  openEntry: (slug: string) => void
): ViewContext {
  const labelOf = (field: string): string => {
    if (isPseudoField(field)) return PSEUDO_FIELD_LABELS[field];
    return (
      data.fields.find((choice) => choice.name === field)?.label ?? field
    );
  };

  const optionValuesOf = (field: string): string[] => {
    if (field === "$form") return Object.keys(data.formNames);
    const declared = data.fields.find((choice) => choice.name === field)?.options;
    if (declared) return Object.keys(declared);
    // Fields without declared options (tags): the observed values.
    const seen = new Set<string>();
    for (const entry of data.entries) {
      const value = entryValue(entry, field);
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === "string" && item !== "") seen.add(item);
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "fr"));
  };

  const colorMapping = props.colorField
    ? resolveColorMapping(optionValuesOf(props.colorField), props.colors)
    : {};

  const firstValue = (entry: ViewEntry, field: string): string | undefined => {
    const value = entryValue(entry, field);
    const single = Array.isArray(value) ? value[0] : value;
    return typeof single === "string" ? single : undefined;
  };

  const textOf = (entry: ViewEntry, field: string): string => {
    const value = entryValue(entry, field);
    if (field === "$form") {
      return data.formNames[String(value)] ?? String(value ?? "");
    }
    const meta = data.fields.find((choice) => choice.name === field);
    if (meta?.options) {
      const values = Array.isArray(value) ? value : [value];
      return values
        .filter((item) => item !== undefined && item !== "")
        .map((item) => meta.options?.[String(item)] ?? String(item))
        .join(", ");
    }
    if (meta?.type === "date" || isPseudoField(field)) {
      const text = valueToText(value);
      const day = text.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return new Date(`${day}T00:00:00`).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }
      return text;
    }
    return valueToText(value);
  };

  return {
    entries,
    data,
    props,
    openEntry,
    colorOf: (entry) => {
      if (!props.colorField) return undefined;
      const value = firstValue(entry, props.colorField);
      return value !== undefined ? colorMapping[value] : undefined;
    },
    iconOf: (entry) => {
      if (!props.iconField) return undefined;
      const value = firstValue(entry, props.iconField);
      return value !== undefined ? props.icons?.[value] : undefined;
    },
    labelOf,
    textOf,
  };
}

/* ------------------------------------------------------------------ *
 * Chrome pieces
 * ------------------------------------------------------------------ */

function SortMenu({
  options,
  active,
  labelOf,
  onChange,
}: {
  options: { field: string; title?: string }[];
  active: { field: string; order: "asc" | "desc" };
  labelOf: (field: string) => string;
  onChange: (sort: { field: string; order: "asc" | "desc" }) => void;
}) {
  return (
    <Select
      value={active.field}
      onValueChange={(field) => onChange({ field, order: active.order })}
    >
      <SelectTrigger size="sm" className="w-fit gap-1">
        <span className="text-muted-foreground">Trier par</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.field} value={option.field}>
            {option.title ?? labelOf(option.field)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FiltersPanel({
  filters,
  entries,
  active,
  expanded,
  showCounts,
  context,
  onChange,
}: {
  filters: FilterSpec[];
  entries: ViewEntry[];
  active: ActiveFilters;
  expanded: "first" | "all";
  showCounts: boolean;
  context: ViewContext;
  onChange: (active: ActiveFilters) => void;
}) {
  // Mobile fold (docs/entries-view.md): a "Filtres" button opens the panel.
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = Object.values(active).filter(
    (picked) => picked.length > 0
  ).length;

  const panel = (
    <div className="grid content-start gap-4">
      {hasActiveFilter(active) && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-1 text-muted-foreground"
          onClick={() => onChange({})}
        >
          <X className="size-3.5" aria-hidden />
          Effacer les filtres
        </Button>
      )}
      {filters.map((filter, index) => (
        <FilterGroup
          key={filter.field}
          filter={filter}
          entries={entries}
          active={active}
          initiallyOpen={expanded === "all" || index === 0}
          showCounts={showCounts}
          context={context}
          onChange={onChange}
        />
      ))}
    </div>
  );

  return (
    <aside className="md:w-56 md:shrink-0">
      <Button
        variant="outline"
        size="sm"
        className="mb-2 gap-1.5 md:hidden"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((current) => !current)}
      >
        <ListFilter className="size-4" aria-hidden />
        Filtres
        {activeCount > 0 && (
          <Badge className="px-1.5 text-[10px]">{activeCount}</Badge>
        )}
      </Button>
      <div className={cn("md:block", mobileOpen ? "block" : "hidden")}>
        {panel}
      </div>
    </aside>
  );
}

function FilterGroup({
  filter,
  entries,
  active,
  initiallyOpen,
  showCounts,
  context,
  onChange,
}: {
  filter: FilterSpec;
  entries: ViewEntry[];
  active: ActiveFilters;
  initiallyOpen: boolean;
  showCounts: boolean;
  context: ViewContext;
  onChange: (active: ActiveFilters) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const field = filter.field;
  const picked = active[field] ?? [];

  const options = useMemo(() => {
    const { data } = context;
    if (field === "$form") {
      return Object.entries(data.formNames);
    }
    const declared = data.fields.find((choice) => choice.name === field)?.options;
    if (declared) return Object.entries(declared);
    const seen = new Set<string>();
    for (const entry of data.entries) {
      const value = entryValue(entry, field);
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item === "string" && item !== "") seen.add(item);
      }
    }
    return [...seen]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((item) => [item, item] as [string, string]);
  }, [context, field]);

  const counts = showCounts
    ? computeFilterCounts(
        entries,
        field,
        options.map(([value]) => value),
        active
      )
    : null;

  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {filter.icon && (
          <span className="[&_svg]:size-4" aria-hidden>
            <Icon id={filter.icon} />
          </span>
        )}
        <span className="flex-1 text-left">
          {filter.title ?? context.labelOf(field)}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="grid gap-1">
          {options.map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 text-sm font-normal"
            >
              <Checkbox
                checked={picked.includes(value)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...active,
                    [field]:
                      checked === true
                        ? [...picked, value]
                        : picked.filter((item) => item !== value),
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {counts && (
                <span className="text-xs text-muted-foreground">
                  {counts[value] ?? 0}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        Page {page + 1} sur {pageCount} · {total} fiche{total > 1 ? "s" : ""}
      </span>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          Précédent
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Entry popup — the entry's real "show" rendering, chrome-free
 * ------------------------------------------------------------------ */

function EntryPopup({
  slug,
  onClose,
}: {
  slug: string | null;
  onClose: () => void;
}) {
  // The last slug survives the close animation (the PageEditor motif):
  // render-time capture, no effect needed.
  const [lastSlug, setLastSlug] = useState<string | null>(null);
  if (slug !== null && slug !== lastSlug) setLastSlug(slug);
  const shown = slug ?? lastSlug;

  return (
    <Dialog open={slug !== null} onOpenChange={(open) => !open && onClose()}>
      {/* As wide as the page's content column (max-w-5xl in the site layout):
          a fiche must read in the popup exactly as it reads on its page. */}
      <DialogContent className="max-h-[85vh] gap-2 overflow-y-auto sm:max-w-5xl">
        <DialogTitle className="sr-only">Fiche</DialogTitle>
        {shown && (
          <>
            <WikiFrame target={shown} />
            {/* Sticky: the frame is as tall as the fiche, so a long one would
                otherwise push this link out of sight. */}
            <a
              href={`/${shown}`}
              className="sticky -bottom-6 -mx-6 -mb-6 flex items-center gap-1 border-t bg-popover px-6 py-3 text-sm text-muted-foreground hover:text-foreground"
            >
              Ouvrir la page de la fiche
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
