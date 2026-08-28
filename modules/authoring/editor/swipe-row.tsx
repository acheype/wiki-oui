"use client";

import { Triangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// A row that scrolls sideways under an indicator we draw ourselves, the
// native scrollbar having refused the job three ways: Firefox on Linux fades
// its own out a second after the scroll (an overlay bar no CSS property
// overrides), Chromium lays a scrollbar out once and ignores a thumb that
// changes size on hover, and the two disagree on how far from the content the
// bar sits. Ours reads the same in both, sits where it is put — right under
// the row — and can be dragged, which is what a mouse without a horizontal
// wheel needs.
export function SwipeRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Fractions of the scrollable width: how much of it shows, and how far
  // along. Undefined when everything fits — nothing hidden, nothing to say.
  const [thumb, setThumb] = useState<{ size: number; start: number }>();
  const drag = useRef<{ pointerX: number; scrollLeft: number } | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const { clientWidth, scrollWidth, scrollLeft } = row;
      // Sub-pixel widths make an exact comparison lie about a row that fits.
      if (scrollWidth - clientWidth < 1) return setThumb(undefined);
      setThumb({
        size: clientWidth / scrollWidth,
        start: scrollLeft / scrollWidth,
      });
    };
    measure();
    row.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      // Told to whoever needs to know the row is holding more than it shows:
      // the toolbar draws a separator only then (see toolbar.tsx).
      data-overflowing={thumb ? "" : undefined}
      // With an indicator, the bottom padding holds it and a gap either side:
      // 2px between the tools and the bar, 4px between the bar and the rule
      // closing the sticky bar. Without one, nothing to hold, and the row
      // sits as close to that rule as it does to the top.
      className={cn(
        "group/swipe relative pt-1.5",
        thumb ? "pb-3" : "pb-1.5",
        className
      )}
    >
      {/* no-scrollbar: the native bar is hidden in every browser, so what is
          drawn below is the only one, and it is the same one. */}
      <div
        ref={rowRef}
        className="no-scrollbar flex items-center gap-0.5 overflow-x-auto [&>*]:shrink-0"
      >
        {children}
      </div>

      {thumb && (
        <div
          // Decoration for the eye and a handle for the hand: the row itself
          // is what a screen reader and the keyboard already scroll.
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-1 flex h-1.5 touch-none items-center gap-1",
            "text-(--scrollbar-thumb) transition-colors",
            "group-hover/swipe:text-muted-foreground",
            "group-focus-within/swipe:text-muted-foreground"
          )}
          onPointerDown={(event) => {
            const row = rowRef.current;
            if (!row) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointerX: event.clientX,
              scrollLeft: row.scrollLeft,
            };
          }}
          onPointerMove={(event) => {
            const row = rowRef.current;
            if (!row || !drag.current) return;
            // A pixel of thumb travel is a pixel of row travel, scaled up by
            // however much of the row is hidden.
            const travelled = event.clientX - drag.current.pointerX;
            row.scrollLeft =
              drag.current.scrollLeft +
              travelled * (row.scrollWidth / row.clientWidth);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          {/* An arrowhead at each end, so a 6px line reads as a bar to
              travel and not as a rule. Taller than the track by a pixel
              either side, which centring absorbs. */}
          <Triangle className="size-2 shrink-0 -rotate-90 fill-current stroke-0" />
          <div className="relative h-full flex-1">
            <div
              className="h-full rounded-full bg-current"
              style={{
                width: `${thumb.size * 100}%`,
                marginLeft: `${thumb.start * 100}%`,
              }}
            />
          </div>
          <Triangle className="size-2 shrink-0 rotate-90 fill-current stroke-0" />
        </div>
      )}
    </div>
  );
}
