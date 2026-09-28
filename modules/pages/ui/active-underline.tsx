"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Box = { left: number; top: number; width: number; height: number };

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function measure(
  container: HTMLElement,
  itemSelector: string,
  index: number
): Box | null {
  const item = container.querySelectorAll<HTMLElement>(itemSelector)[index];
  if (!item) return null;
  const containerBox = container.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();
  return {
    left: itemBox.left - containerBox.left,
    top: itemBox.top - containerBox.top,
    width: itemBox.width,
    height: itemBox.height,
  };
}

/**
 * One straight semantic-color marker that slides between active navigation
 * items. Its parent is the measuring and positioning container; callers only
 * name which direct visual items count and how far the marker clears them.
 */
export function ActiveUnderline({
  index,
  itemSelector,
  orientation = "horizontal",
  gap,
  deps,
}: {
  index: number | null;
  itemSelector: string;
  orientation?: "horizontal" | "vertical";
  /** Distance from the item's edge to the marker. */
  gap: number;
  /** Re-measure when the set or identity of items changes. */
  deps: string;
}) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);

  useIsomorphicLayoutEffect(() => {
    const container = markerRef.current?.parentElement;
    if (!container) return;
    const remeasure = () =>
      setBox(index === null ? null : measure(container, itemSelector, index));
    remeasure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(remeasure);
    observer?.observe(container);
    window.addEventListener("resize", remeasure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", remeasure);
    };
  }, [index, itemSelector, orientation, gap, deps]);

  const horizontal = orientation === "horizontal";
  const x = box ? box.left - (horizontal ? 0 : gap) : 0;
  const y = box ? box.top + (horizontal ? box.height + gap - 2 : 0) : 0;

  return (
    <div
      ref={markerRef}
      aria-hidden
      data-slot="active-underline"
      className="pointer-events-none absolute top-0 left-0 z-20 bg-secondary transition-[translate,width,height,opacity] duration-200 ease-out motion-reduce:transition-none"
      style={{
        translate: `${x}px ${y}px`,
        width: box ? (horizontal ? box.width : 2) : 0,
        height: box ? (horizontal ? 2 : box.height) : 0,
        opacity: box ? 1 : 0,
      }}
    />
  );
}
