"use client";

// Galerie photo (docs/entries-view.md): a modern masonry grid, hover zoom
// with a veil revealing the title — no parameter. The click opens the
// fullscreen viewer (← / → navigation, caption = title, « Voir la fiche »
// opening the common modal): the one view whose click is not entryDisplay.

import { ChevronLeft, ChevronRight, ImageIcon, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ViewEntry } from "@/modules/entries-view/rules";
import { imageUrl } from "@/lib/image-url";
import { SAMPLE_IMAGE } from "@/modules/forms/sample-entries";
import type { ViewContext } from "./types";

export function GalleryView({ context }: { context: ViewContext }) {
  const { entries, props } = context;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const visualField = props.visualField;

  const shown = visualField
    ? entries.filter((entry) => {
        const value = entry.values[visualField];
        return typeof value === "string" && value !== "";
      })
    : [];

  if (!visualField || shown.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucune image à afficher — la Galerie attend un champ image rempli.
      </p>
    );
  }

  return (
    <>
      <div className="columns-2 gap-2 sm:columns-3 lg:columns-4 [&>*]:mb-2">
        {shown.map((entry, index) => (
          <GalleryTile
            key={entry.slug}
            entry={entry}
            field={visualField}
            onOpen={() => setOpenIndex(index)}
          />
        ))}
      </div>
      {openIndex !== null && (
        <Lightbox
          entries={shown}
          field={visualField}
          index={openIndex}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onOpenEntry={(slug) => {
            setOpenIndex(null);
            context.openEntry(slug);
          }}
        />
      )}
    </>
  );
}

function GalleryTile({
  entry,
  field,
  onOpen,
}: {
  entry: ViewEntry;
  field: string;
  onOpen: () => void;
}) {
  const value = String(entry.values[field]);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-md bg-muted break-inside-avoid"
    >
      {value === SAMPLE_IMAGE ? (
        <span
          className="flex aspect-4/3 items-center justify-center text-muted-foreground/50"
          aria-hidden
        >
          <ImageIcon className="size-8" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- files-API URL
        <img
          src={imageUrl(value, { width: 480 })}
          alt={entry.title}
          className="w-full transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      )}
      <span
        className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      >
        <span className="truncate text-sm font-medium text-white">
          {entry.title}
        </span>
      </span>
    </button>
  );
}

// The fullscreen viewer, kept in-house: image + caption + arrows + escape,
// nothing a heavier lightbox library would add here.
function Lightbox({
  entries,
  field,
  index,
  onIndex,
  onClose,
  onOpenEntry,
}: {
  entries: ViewEntry[];
  field: string;
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onOpenEntry: (slug: string) => void;
}) {
  const entry = entries[index];
  const value = String(entry.values[field]);

  const step = useCallback(
    (delta: number) => onIndex((index + delta + entries.length) % entries.length),
    [index, entries.length, onIndex]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
    >
      <div className="flex justify-end p-3">
        <button
          type="button"
          className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Fermer"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-14"
        onClick={(event) => event.stopPropagation()}
      >
        <NavButton side="left" onClick={() => step(-1)} />
        {value === SAMPLE_IMAGE ? (
          <ImageIcon className="size-16 text-white/30" aria-hidden />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- files-API URL
          <img
            src={imageUrl(value, { width: 1600 })}
            alt={entry.title}
            className="max-h-full max-w-full object-contain"
          />
        )}
        <NavButton side="right" onClick={() => step(1)} />
      </div>
      <div
        className="flex items-center justify-between gap-3 p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm text-white/90">
          {entry.title}
          <span className="ml-2 text-white/50">
            {index + 1} / {entries.length}
          </span>
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          onClick={() => onOpenEntry(entry.slug)}
        >
          Voir la fiche
        </Button>
      </div>
    </div>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Arrow = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Image précédente" : "Image suivante"}
      className={`absolute top-1/2 ${side}-2 -translate-y-1/2 rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white`}
      onClick={onClick}
    >
      <Arrow className="size-7" />
    </button>
  );
}
