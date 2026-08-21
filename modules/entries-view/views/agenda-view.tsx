"use client";

// Agenda (docs/entries-view.md): the chronological editorial list — the
// Calendar shows time with events inside, the Agenda shows events ordered
// by time. Typographic date block on the left, grouped by month, only the
// days that have events. Title/subtitle zones like the Liste.

import { entryDay, entryValue } from "@/modules/entries-view/rules";
import type { ViewEntry } from "@/modules/entries-view/rules";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { defaultColumnCount, type ViewContext } from "./types";

interface Dated {
  entry: ViewEntry;
  day: string;
  end: string | null;
}

const COLUMN_CLASSES: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

export function AgendaView({ context }: { context: ViewContext }) {
  const { entries, props } = context;
  const startField = props.startDateField;

  if (!startField) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        L&apos;Agenda attend un champ date de début.
      </p>
    );
  }

  const dated: Dated[] = entries
    .flatMap((entry) => {
      const day = entryDay(entryValue(entry, startField));
      if (!day) return [];
      const end = props.endDateField
        ? entryDay(entryValue(entry, props.endDateField))
        : null;
      return [{ entry, day, end }];
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const months = new Map<string, Dated[]>();
  for (const item of dated) {
    const month = item.day.slice(0, 7);
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
            {items.map(({ entry, day, end }) => (
              <AgendaRow
                key={entry.slug}
                entry={entry}
                day={day}
                end={end}
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
  day,
  end,
  context,
}: {
  entry: ViewEntry;
  day: string;
  end: string | null;
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
  const date = new Date(`${day}T00:00:00`);

  return (
    <button
      type="button"
      onClick={() => context.openEntry(entry.slug)}
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
        {end && end > day && (
          <span className="block text-xs text-muted-foreground">
            Jusqu&apos;au {formatDay(end)}
          </span>
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

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
}
