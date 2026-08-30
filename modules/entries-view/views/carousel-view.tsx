"use client";

// Carrousel (docs/entries-view.md): full-width sliding visuals (Embla),
// caption over the image (default: the title; captionField="" clears it),
// optional autoplay with a per-slide duration, arrows and dots. A slide
// click applies entryDisplay; the sort order is the sliding order. No
// search, no pagination.

import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ViewEntry } from "../view-entry";
import { imageUrl } from "@/lib/image-url";
import { SAMPLE_IMAGE } from "@/modules/forms/sample-entries";
import { cn } from "@/lib/utils";
import type { ViewContext } from "./types";

export function CarouselView({ context }: { context: ViewContext }) {
  const { entries, props } = context;
  const visualField = props.visualField;
  const autoplay = props.autoplay !== false;
  const intervalMs = (props.interval ?? 5) * 1000;

  const [emblaRef, embla] = useEmblaCarousel(
    { loop: true },
    autoplay
      ? [Autoplay({ delay: intervalMs, stopOnInteraction: true })]
      : []
  );
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setSelected(embla.selectedScrollSnap());
    embla.on("select", onSelect);
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla]);

  const shown = visualField
    ? entries.filter((entry) => {
        const value = entry.values[visualField];
        return typeof value === "string" && value !== "";
      })
    : [];

  if (!visualField || shown.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucune image à afficher — le Carrousel attend un champ image rempli.
      </p>
    );
  }

  return (
    <div className="group/carousel relative overflow-hidden rounded-lg">
      <div ref={emblaRef}>
        <div className="flex">
          {shown.map((entry) => (
            <Slide
              key={entry.slug}
              entry={entry}
              field={visualField}
              context={context}
            />
          ))}
        </div>
      </div>

      <ArrowButton side="left" onClick={() => embla?.scrollPrev()} />
      <ArrowButton side="right" onClick={() => embla?.scrollNext()} />

      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {shown.map((entry, index) => (
          <button
            key={entry.slug}
            type="button"
            aria-label={`Diapositive ${index + 1}`}
            aria-current={index === selected}
            className={cn(
              "size-2 rounded-full transition-colors",
              index === selected ? "bg-white" : "bg-white/40 hover:bg-white/70"
            )}
            onClick={() => embla?.scrollTo(index)}
          />
        ))}
      </div>
    </div>
  );
}

function Slide({
  entry,
  field,
  context,
}: {
  entry: ViewEntry;
  field: string;
  context: ViewContext;
}) {
  const { props } = context;
  const value = String(entry.values[field]);
  // Caption: the chosen field (default "title", the ever-present title
  // field); captionField="" means no text over the image.
  const captionField = props.captionField ?? "title";
  const caption =
    captionField === ""
      ? ""
      : context.textOf(entry, captionField) || entry.title;

  return (
    <button
      type="button"
      className="relative min-w-0 flex-[0_0_100%]"
      onClick={() => context.openEntry(entry.slug)}
    >
      {value === SAMPLE_IMAGE ? (
        <span
          className="flex aspect-[21/9] w-full items-center justify-center bg-muted text-muted-foreground/50"
          aria-hidden
        >
          <ImageIcon className="size-10" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- files-API URL
        <img
          src={imageUrl(value, { width: 1600 })}
          alt={caption || entry.title}
          className="aspect-[21/9] w-full object-cover"
          loading="lazy"
        />
      )}
      {caption && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-7 text-left">
          <span className="block truncate text-lg font-medium text-white">
            {caption}
          </span>
        </span>
      )}
    </button>
  );
}

function ArrowButton({
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
      aria-label={side === "left" ? "Diapositive précédente" : "Diapositive suivante"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white opacity-0 transition-opacity",
        "group-hover/carousel:opacity-100 focus-visible:opacity-100",
        side === "left" ? "left-3" : "right-3"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Arrow className="size-5" />
    </button>
  );
}
