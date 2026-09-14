"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TabsIndicator } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Sliding indicators for the underline tabs (Vercel Tabs look, ADR 0031): a
// grey highlight that slides under the hovered tab and a black bar that slides
// to the active one. Both are shared — one element that moves — replacing the
// `line` variant's per-tab `after` bar and `hover:bg-muted`
// (components/ui/tabs.tsx). Purely decorative: Base UI keeps the roles and the
// keyboard.
//
// The black bar is Base UI's Tabs.Indicator: it measures the active tab itself
// and exposes its box as --active-tab-* CSS variables. Base UI tracks no hover,
// so the grey highlight measures the hovered tab here.
//
// The highlight is rendered as the list's own child, so the list is just
// `parentElement` — no ref threaded through the shadcn TabsList. Positions are
// read off the live triggers (getBoundingClientRect relative to the list), so
// they track wrapping, resize and the page's font size. The list has no border
// in this variant, so a bounding-box delta lands exactly on an absolutely
// positioned child (its containing block is the list's padding box).

type Box = { left: number; top: number; width: number; height: number };

function measure(list: HTMLElement, index: number): Box | null {
  const triggers = list.querySelectorAll<HTMLElement>("[data-slot=tabs-trigger]");
  const el = triggers[index];
  if (!el) return null;
  const listBox = list.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  return {
    left: box.left - listBox.left,
    top: box.top - listBox.top,
    width: box.width,
    height: box.height,
  };
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const SLIDE =
  "pointer-events-none absolute top-0 left-0 duration-200 ease-out motion-reduce:transition-none";

// The bar is 2px thick and sits 8px off the active tab's edge: below it when
// horizontal (top + height + 8 - 2), to its left when vertical (left - 8).
const BAR_PLACEMENT = {
  horizontal:
    "h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) translate-y-[calc(var(--active-tab-top)+var(--active-tab-height)+6px)]",
  vertical:
    "h-(--active-tab-height) w-0.5 translate-x-[calc(var(--active-tab-left)-8px)] translate-y-(--active-tab-top)",
};

export function UnderlineIndicators({
  hoveredIndex,
  orientation,
  deps,
}: {
  hoveredIndex: number | null;
  orientation: "horizontal" | "vertical";
  /** Re-measure when the tab set changes. */
  deps: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Box | null>(null);

  useIsomorphicLayoutEffect(() => {
    const list = rootRef.current?.parentElement;
    if (!list) return;
    const remeasure = () =>
      setHover(hoveredIndex === null ? null : measure(list, hoveredIndex));
    remeasure();
    const observer = new ResizeObserver(remeasure);
    observer.observe(list);
    window.addEventListener("resize", remeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [hoveredIndex, orientation, deps]);

  return (
    <>
      <div
        ref={rootRef}
        aria-hidden
        className={cn(
          SLIDE,
          "z-0 rounded-md bg-muted transition-[transform,width,height,opacity]"
        )}
        style={{
          transform: `translate(${hover?.left ?? 0}px, ${hover?.top ?? 0}px)`,
          width: hover?.width ?? 0,
          height: hover?.height ?? 0,
          opacity: hover ? 1 : 0,
        }}
      />
      {/* Base UI keeps it `hidden` until the active tab is measured, so it
          appears in place instead of sliding in from the list's corner. */}
      <TabsIndicator
        className={cn(
          SLIDE,
          "bg-foreground transition-[translate,width,height]",
          BAR_PLACEMENT[orientation]
        )}
      />
    </>
  );
}
