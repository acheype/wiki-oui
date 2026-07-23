"use client";

// Liste (docs/entries-view.md): entries as expandable rows. A click unfolds
// the entry in place (its real "show" rendering) when `expandable`; with
// `openOnClick` instead, the click applies entryDisplay. Both unchecked =
// an inert listing. Title + subtitle only — no visual/badge zones in Liste.

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { entryValue } from "@/lib/entries-view";
import type { ViewEntry } from "@/lib/entries-view";
import { cn } from "@/lib/utils";
import { Icon } from "../icon";
import { WikiFrame } from "../wiki-frame";
import type { ViewContext } from "./types";

export function ListView({ context }: { context: ViewContext }) {
  const { entries, props } = context;
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const expandable = props.expandable === true;
  const clickable = expandable || props.openOnClick === true;

  return (
    <ul className="divide-y rounded-md border">
      {entries.map((entry) => (
        <ListRow
          key={entry.slug}
          entry={entry}
          context={context}
          expandable={expandable}
          clickable={clickable}
          expanded={expandedSlug === entry.slug}
          onToggle={() =>
            expandable
              ? setExpandedSlug((current) =>
                  current === entry.slug ? null : entry.slug
                )
              : context.openEntry(entry.slug)
          }
        />
      ))}
    </ul>
  );
}

function ListRow({
  entry,
  context,
  expandable,
  clickable,
  expanded,
  onToggle,
}: {
  entry: ViewEntry;
  context: ViewContext;
  expandable: boolean;
  clickable: boolean;
  expanded: boolean;
  onToggle: () => void;
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

  const header = (
    <>
      {color && (
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      )}
      {icon && (
        <span className="shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden>
          <Icon id={icon} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-sm text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {expandable && (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
          aria-hidden
        />
      )}
    </>
  );

  return (
    <li>
      {clickable ? (
        <button
          type="button"
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-accent/50"
          aria-expanded={expandable ? expanded : undefined}
          onClick={onToggle}
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5">{header}</div>
      )}
      {expanded && (
        // No padding, no tint: the render brings its own, and any frame drawn
        // around it would read as a box inside the row.
        <div className="border-t">
          <ExpandedEntry entry={entry} sample={context.data.sample} />
        </div>
      )}
    </li>
  );
}

// The unfolded entry: its real rendering for a stored entry; a plain value
// listing for a generated sample (it has no page to render).
function ExpandedEntry({
  entry,
  sample,
}: {
  entry: ViewEntry;
  sample: boolean;
}) {
  if (sample) {
    return (
      <dl className="grid gap-1 px-3 py-3 text-sm">
        {Object.entries(entry.values)
          .filter(([name, value]) => !name.startsWith("$") && value !== "")
          .map(([name, value]) => (
            <div key={name} className="flex gap-2">
              <dt className="font-mono text-xs text-muted-foreground">{name}</dt>
              <dd className="min-w-0 truncate">
                {Array.isArray(value)
                  ? value.join(", ")
                  : typeof value === "object" && value !== null
                    ? ""
                    : String(entryValue(entry, name) ?? "")}
              </dd>
            </div>
          ))}
      </dl>
    );
  }
  // The row header already carries the title: the render drops it rather than
  // repeating it two lines below.
  return <WikiFrame target={entry.slug} hideTitle />;
}
