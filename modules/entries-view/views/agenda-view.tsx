"use client";

// Agenda (docs/entries-view.md): the chronological editorial list — the
// Calendar shows time with events inside, the Agenda shows events ordered
// by time. Typographic date block on the left, grouped by month, only the
// days that have events. Title/subtitle zones like the Liste.

import { entryValue } from "../core/rules";
import {
  type TemporalSpan,
  compareTemporalValues,
  dateBlockCaption,
  temporalSpan,
} from "@/modules/forms/temporal-value";
import { usePreloadHandlers } from "@/modules/pages/page-modal";
import type { ViewEntry } from "../view-entry";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { defaultColumnCount, type ViewContext } from "./types";

interface Dated {
  entry: ViewEntry;
  span: TemporalSpan;
}

const COLUMN_CLASSES: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

export function AgendaView({ context }: { context: ViewContext }) {
  const { entries, props } = context;
  const dateField = props.dateField;

  if (!dateField) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        L&apos;Agenda attend un champ de date.
      </p>
    );
  }

  const dated: Dated[] = entries
    .flatMap((entry) => {
      const span = temporalSpan(entryValue(entry, dateField));
      return span ? [{ entry, span }] : [];
    })
    .sort((a, b) => compareTemporalValues(a.span, b.span) ?? 0);

  const months = new Map<string, Dated[]>();
  for (const item of dated) {
    const month = item.span.start.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), item]);
  }

  const columns = Math.min(
    Math.max(props.columnCount ?? defaultColumnCount("agenda"), 1),
    3
  );

  return (
    <div className="grid gap-6">
      {[...months.entries()].map(([month, items]) => (
        <section key={month}>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {monthLabel(month)}
          </h3>
          <div className={cn("grid gap-2 grid-cols-1", COLUMN_CLASSES[columns])}>
            {items.map(({ entry, span }) => (
              <AgendaRow
                key={entry.slug}
                entry={entry}
                span={span}
                context={context}
              />
            ))}
          </div>
        </section>
      ))}
      {dated.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucun événement à afficher.
        </p>
      )}
    </div>
  );
}

function AgendaRow({
  entry,
  span,
  context,
}: {
  entry: ViewEntry;
  span: TemporalSpan;
  context: ViewContext;
}) {
  const { props } = context;
  const color = context.colorOf(entry);
  const icon = context.iconOf(entry);
  const title = props.titleField
    ? context.textOf(entry, props.titleField) || entry.title
    : entry.title;
  const subtitle = props.subtitleField
    ? context.textOf(entry, props.subtitleField)
    : "";
  const date = new Date(`${span.start.slice(0, 10)}T00:00:00`);
  const when = dateBlockCaption(span);
  const preload = usePreloadHandlers(() => context.preloadEntry(entry.slug));

  return (
    <button
      type="button"
      onClick={() => context.openEntry(entry.slug)}
      {...preload}
      className="flex items-center gap-3 rounded-md border p-2.5 text-left transition-colors hover:bg-accent/50"
      style={color ? { borderLeft: `3px solid ${color}` } : undefined}
    >
      <span className="flex w-12 shrink-0 flex-col items-center" aria-hidden>
        <span className="text-2xl leading-none font-bold">
          {date.getDate()}
        </span>
        <span className="text-xs text-muted-foreground uppercase">
          {date.toLocaleDateString("fr-FR", { weekday: "short" })}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {icon && (
            <span
              className="mr-1.5 inline-flex align-[-2px] text-muted-foreground [&_svg]:size-4"
              aria-hidden
            >
              <Icon id={icon} />
            </span>
          )}
          {title}
        </span>
        {when && (
          <span className="block text-xs text-muted-foreground">{when}</span>
        )}
        {subtitle && (
          <span className="block truncate text-sm text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}
