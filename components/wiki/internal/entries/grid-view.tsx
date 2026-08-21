"use client";

// Grille (docs/entries-view.md): entries as cards — visual, title, subtitle,
// truncated text, footer, and a badge over the visual. The whole card is
// clickable (entryDisplay). columnCount is a maximum: the grid falls back to
// 2 then 1 columns as the viewport narrows.

import { ImageIcon } from "lucide-react";
import { imageUrl } from "@/lib/image-url";
import type { ViewEntry } from "@/lib/entries-view";
import { SAMPLE_IMAGE } from "@/modules/forms/sample-entries";
import { cn } from "@/lib/utils";
import { Icon } from "../icon";
import { defaultColumnCount, type ViewContext } from "./types";

// Static class strings (Tailwind scans source): the responsive ramp for each
// allowed maximum. Beyond 6, the grid caps at 6.
const COLUMN_CLASSES: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-1 sm:grid-cols-3 lg:grid-cols-6",
};

export function GridView({ context }: { context: ViewContext }) {
  const { entries, props } = context;
  const columns = Math.min(
    Math.max(props.columnCount ?? defaultColumnCount("grid"), 1),
    6
  );

  return (
    <div className={cn("grid gap-4", COLUMN_CLASSES[columns])}>
      {entries.map((entry) => (
        <Card key={entry.slug} entry={entry} context={context} />
      ))}
    </div>
  );
}

function Card({ entry, context }: { entry: ViewEntry; context: ViewContext }) {
  const { props } = context;
  const layout = props.layout ?? "vertical";
  const color = context.colorOf(entry);
  const icon = context.iconOf(entry);
  const title = props.titleField
    ? context.textOf(entry, props.titleField) || entry.title
    : entry.title;
  const subtitle = props.subtitleField
    ? context.textOf(entry, props.subtitleField)
    : "";
  const text = props.textField ? context.textOf(entry, props.textField) : "";
  const footer = props.footerField
    ? context.textOf(entry, props.footerField)
    : "";
  const badge = props.badgeField ? context.textOf(entry, props.badgeField) : "";

  const visual = props.visualField ? (
    <CardVisual
      entry={entry}
      field={props.visualField}
      fit={props.visualFit ?? "cover"}
      square={layout === "square"}
      alt={title}
    />
  ) : null;

  const badgeChip = badge ? (
    <span className="absolute top-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium shadow-sm">
      {badge}
    </span>
  ) : null;

  if (layout === "square") {
    return (
      <CardShell entry={entry} context={context} className="relative aspect-square">
        {visual ?? <div className="absolute inset-0 bg-muted" />}
        {badgeChip}
        <span
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-left"
          style={color ? { boxShadow: `inset 0 -3px 0 0 ${color}` } : undefined}
        >
          <span className="block truncate font-medium text-white">
            <TitleIcon icon={icon} />
            {title}
          </span>
          {subtitle && (
            <span className="block truncate text-sm text-white/80">{subtitle}</span>
          )}
        </span>
      </CardShell>
    );
  }

  const body = (
    <span className="flex min-w-0 flex-1 flex-col gap-1 p-3 text-left">
      <span className="truncate font-medium">
        <TitleIcon icon={icon} />
        {title}
      </span>
      {subtitle && (
        <span className="truncate text-sm text-muted-foreground">{subtitle}</span>
      )}
      {text && (
        <span
          className="overflow-hidden text-sm text-muted-foreground"
          style={{
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: props.textLines ?? 3,
          }}
        >
          {text}
        </span>
      )}
      {footer && (
        <span className="mt-auto border-t pt-1.5 text-xs text-muted-foreground">
          {footer}
        </span>
      )}
    </span>
  );

  return (
    <CardShell
      entry={entry}
      context={context}
      className={cn("flex", layout === "horizontal" ? "flex-row" : "flex-col")}
      accent={color}
    >
      {visual && (
        <span
          className={cn(
            "relative shrink-0 overflow-hidden",
            layout === "horizontal" ? "w-2/5" : "aspect-video w-full"
          )}
        >
          {visual}
          {badgeChip}
        </span>
      )}
      {!visual && badge && <span className="relative">{badgeChip}</span>}
      {body}
    </CardShell>
  );
}

function CardShell({
  entry,
  context,
  className,
  accent,
  children,
}: {
  entry: ViewEntry;
  context: ViewContext;
  className?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => context.openEntry(entry.slug)}
      className={cn(
        "overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md",
        className
      )}
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
    >
      {children}
    </button>
  );
}

function TitleIcon({ icon }: { icon: string | undefined }) {
  if (!icon) return null;
  return (
    <span
      className="mr-1.5 inline-flex align-[-2px] text-muted-foreground [&_svg]:size-4"
      aria-hidden
    >
      <Icon id={icon} />
    </span>
  );
}

/** The visual zone: the uploaded image, or the neutral sample placeholder. */
export function CardVisual({
  entry,
  field,
  fit,
  square,
  alt,
}: {
  entry: ViewEntry;
  field: string;
  fit: "cover" | "contain";
  square?: boolean;
  alt: string;
}) {
  const value = entry.values[field];
  const positioning = square ? "absolute inset-0 size-full" : "size-full";
  if (typeof value !== "string" || value === "") {
    return <span className={cn(positioning, "block bg-muted")} aria-hidden />;
  }
  if (value === SAMPLE_IMAGE) {
    return (
      <span
        className={cn(
          positioning,
          "flex items-center justify-center bg-muted text-muted-foreground/50"
        )}
        aria-hidden
      >
        <ImageIcon className="size-8" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- files-API URL, same as EntryView
    <img
      src={imageUrl(value, { width: 640 })}
      alt={alt}
      className={cn(
        positioning,
        fit === "cover" ? "object-cover" : "object-contain"
      )}
      loading="lazy"
    />
  );
}
