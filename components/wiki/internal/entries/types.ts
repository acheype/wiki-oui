// Shared vocabulary of <EntriesView> (docs/entries-view.md): the full prop
// surface, and the resolved context the view renderers consume. Pure types +
// tiny resolution helpers — no React.

import type { EntriesViewData } from "@/app/entries-view-actions";
import type { Period } from "@/lib/entries-view";
import type { ViewEntry } from "@/lib/entries-view";

export const VIEW_NAMES = [
  "list",
  "grid",
  "table",
  "map",
  "calendar",
  "agenda",
  "directory",
  "carousel",
  "gallery",
] as const;

export type ViewName = (typeof VIEW_NAMES)[number];

export type EntryDisplay =
  | "popup"
  | "current-tab"
  | "new-tab"
  | "sidebar"
  | "map-popup";

export interface ColumnSpec {
  field: string;
  title?: string;
}

export interface FilterSpec {
  field: string;
  title?: string;
  icon?: string;
}

export interface SortOptionSpec {
  field: string;
  title?: string;
}

export interface MapArea {
  lat: number;
  lng: number;
  zoom: number;
}

export interface EntriesViewProps {
  /** Chosen form slug(s), in the author's order. */
  form: string | string[];
  view?: ViewName;

  /* Liste */
  expandable?: boolean;
  openOnClick?: boolean;
  titleField?: string;
  subtitleField?: string;

  /* Grille */
  visualField?: string;
  textField?: string;
  footerField?: string;
  badgeField?: string;
  /** Grid maximum columns (default 3) / Agenda columns (default 1). */
  columnCount?: number;
  layout?: "vertical" | "horizontal" | "square";
  visualFit?: "cover" | "contain";
  textLines?: number;

  /* Tableau */
  columns?: ColumnSpec[];
  splitMultiChoice?: boolean;
  sumFields?: string | string[];
  actionsColumn?: boolean;

  /* Carte */
  basemap?:
    | "osm"
    | "osm-france"
    | "positron"
    | "dark-matter"
    | "stadia-smooth"
    | "stadia-smooth-dark"
    | "esri-satellite"
    | "opentopo";
  initialArea?: MapArea;
  cluster?: boolean;
  height?: string;
  width?: string;
  hoverField?: string;
  wheelZoom?: boolean;

  /* Calendrier / Agenda */
  startDateField?: string;
  endDateField?: string;
  initialView?: "month" | "week" | "day" | "planning";
  planningRange?: "year" | "month" | "week";
  compact?: boolean;

  /* Carrousel */
  captionField?: string;
  autoplay?: boolean;
  interval?: number;

  /* Communs */
  /** Absent = the view's own default (popup everywhere, sidebar on the map). */
  entryDisplay?: EntryDisplay;
  search?: boolean;
  searchFields?: string | string[];
  colorField?: string;
  colors?: Record<string, string>;
  iconField?: string;
  icons?: Record<string, string>;
  filters?: FilterSpec[];
  filtersPosition?: "left" | "right";
  filtersExpanded?: "first" | "all";
  filterCounts?: boolean;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  sortOptions?: SortOptionSpec[];
  /** "none" = no restriction (the omission default). */
  period?: "none" | Period;
  periodField?: string;
  limit?: number;
  pageSize?: number;
}

/** The view's own entryDisplay when the prop is absent (the component picks). */
export function defaultEntryDisplay(view: ViewName): EntryDisplay {
  return view === "map" ? "sidebar" : "popup";
}

/** Grid caps at 3 columns, the Agenda flows on one (docs/entries-view.md). */
export function defaultColumnCount(view: ViewName): number {
  return view === "agenda" ? 1 : 3;
}

/** What a view renderer receives: queried entries + resolved styling. */
export interface ViewContext {
  entries: ViewEntry[];
  data: EntriesViewData;
  props: EntriesViewProps;
  /** Applies the resolved entryDisplay; no-op on sample entries. */
  openEntry: (slug: string) => void;
  /** Resolved color for an entry (colorField + palette + overrides). */
  colorOf: (entry: ViewEntry) => string | undefined;
  /** Resolved Iconify icon for an entry (iconField + mapping). */
  iconOf: (entry: ViewEntry) => string | undefined;
  /** Display label of a field name (union label, pseudo labels, $form). */
  labelOf: (field: string) => string;
  /** Display text of one entry value (option labels resolved, dates local). */
  textOf: (entry: ViewEntry, field: string) => string;
  /** Active sort, for views owning their sort UI (the Tableau's headers). */
  sort?: { field: string; order: "asc" | "desc" };
  /** Header click: same field flips the order, a new field starts ascending. */
  onSort?: (field: string) => void;
  /** Opens the common entry modal directly (the map-popup's Voir la fiche). */
  openPopup?: (slug: string) => void;
}
