"use client";

import { useEffect, useRef } from "react";

// The site's top bar, and the one thing that knows its own height: the layout
// slots it holds are author-written MDX, and the row wraps on a narrow screen,
// so that height is never a constant. It publishes the measure as --chrome-top
// (app/globals.css holds the first-paint value) for the other sticky surfaces —
// the editing bar of modules/authoring/ui/page-editor.tsx — to land under it
// instead of behind it.
export function StickyTopBar({ children }: { children: React.ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--chrome-top",
        `${bar.offsetHeight}px`
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--chrome-top");
    };
  }, []);

  return (
    <div
      ref={barRef}
      className="sticky-bar sticky top-0 z-40"
    >
      {children}
    </div>
  );
}
