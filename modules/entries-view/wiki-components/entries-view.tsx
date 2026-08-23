import {
  EntriesView as EntriesViewImpl,
  type EntriesViewProps,
} from "@/modules/entries-view/entries-view";

// Built-in that renders <EntriesView> (docs/entries-view.md): a thin shell so
// the descriptor verifier (ADR 0013) reads a literal signature — defaults
// included — here, while the nine views and their chrome live at
// modules/entries-view/entries-view.tsx. The defaults below must mirror the
// ones destructured there; the shell only forwards.
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
  return <EntriesViewImpl {...props} />;
}
