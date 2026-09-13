"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Sliding indicators for the underline tabs (Vercel Tabs look, ADR 0031): a
// grey highlight that slides under the hovered tab and a black bar that slides
// to the active one. Both are shared — one element that moves — replacing the
// `line` variant's per-tab `after` bar and `hover:bg-muted`
// (components/ui/tabs.tsx). Purely decorative: Base UI keeps the roles and the
// keyboard, these are aria-hidden.
//
// The indicators are rendered as the list's own children, so the list is just
// `parentElement` — no ref threaded through the shadcn TabsList. Positions are
// read off the live triggers (getBoundingClientRect relative to the list), so
// they track wrapping, resize and the page's font size. The list has no border
// in this variant, so a bounding-box delta lands exactly on an absolutely
// positioned child (its containing block is the list's padding box).

// Matches the old after:-bottom-2 / after:-left-2 offset and after:h-0.5 /
// after:w-0.5 thickness the shared bar replaces.
const GAP = 8;
const THICKNESS = 2;

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

// Where the black bar sits, from the active tab's box: below it (horizontal) or
// to its left (vertical), THICKNESS thick, GAP away from the tab's edge.
function barBox(active: Box, orientation: "horizontal" | "vertical"): Box {
  return orientation === "horizontal"
    ? {
        left: active.left,
        top: active.top + active.height + GAP - THICKNESS,
        width: active.width,
        height: THICKNESS,
      }
    : {
        left: active.left - GAP,
        top: active.top,
        width: THICKNESS,
        height: active.height,
      };
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function UnderlineIndicators({
  activeIndex,
  hoveredIndex,
  orientation,
  deps,
}: {
  activeIndex: number;
  hoveredIndex: number | null;
  orientation: "horizontal" | "vertical";
  /** Re-measure when the tab set changes. */
  deps: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Box | null>(null);
  const [hover, setHover] = useState<Box | null>(null);
  const [ready, setReady] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const list = rootRef.current?.parentElement;
    if (!list) return;
    const remeasure = () => {
      setActive(measure(list, activeIndex));
      setHover(hoveredIndex === null ? null : measure(list, hoveredIndex));
    };
    remeasure();
    const observer = new ResizeObserver(remeasure);
    observer.observe(list);
    window.addEventListener("resize", remeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [activeIndex, hoveredIndex, orientation, deps]);

  // Slide only after the first placement, so the bars appear where they belong
  // rather than flying in from the origin on mount.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const slide =
    ready &&
    "transition-[transform,width,height,opacity] duration-200 ease-out motion-reduce:transition-none";
  const bar = active && barBox(active, orientation);

  return (
    <>
      <div
        ref={rootRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-0 rounded-md bg-muted",
          slide
        )}
        style={{
          transform: `translate(${hover?.left ?? 0}px, ${hover?.top ?? 0}px)`,
          width: hover?.width ?? 0,
          height: hover?.height ?? 0,
          opacity: hover ? 1 : 0,
        }}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 bg-foreground",
          slide
        )}
        style={{
          transform: `translate(${bar?.left ?? 0}px, ${bar?.top ?? 0}px)`,
          width: bar?.width ?? 0,
          height: bar?.height ?? 0,
          opacity: bar ? 1 : 0,
        }}
      />
    </>
  );
}
