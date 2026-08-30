"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { PageWarning } from "@/modules/pages/lint";

// What the render will ignore, shown between the source and the save (ADR
// 0002). It stops the first save rather than reporting after the fact: the
// author is still in front of the text that needs fixing. It never forbids —
// « Enregistrer quand même » is always there, a wiki accepts a work in
// progress.
export function WarningsPanel({
  warnings,
  isPending,
  onGoToLine,
  onSaveAnyway,
}: {
  warnings: PageWarning[];
  isPending: boolean;
  onGoToLine: (line: number) => void;
  onSaveAnyway: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel sits under an editor that can be several screens tall: without
  // this, the save looks like it did nothing. « nearest » so a panel already
  // in view stays put — a second save must not yank the page.
  useEffect(() => {
    panelRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "nearest",
    });
  }, [warnings]);

  return (
    <div
      ref={panelRef}
      // Announced on appearance: the save button seemingly doing nothing
      // otherwise leaves a screen-reader user with no explanation.
      role="alert"
      // Scroll margins: the top one clears the two sticky bars, under which
      // the panel's first line would otherwise land; the bottom one keeps a
      // breath between the panel and the window's edge.
      className="grid scroll-mt-[calc(var(--chrome-top)_+_5rem)] scroll-mb-6 gap-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/20"
    >
      <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-500">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {warnings.length === 1
          ? "Un élément de cette page ne s'affichera pas"
          : `${warnings.length} éléments de cette page ne s'afficheront pas`}
      </p>

      <ul className="grid gap-1.5">
        {warnings.map((warning, index) => (
          <li key={index}>
            <span className="flex flex-wrap items-baseline gap-x-1.5">
              {warning.line !== undefined && (
                <button
                  type="button"
                  onClick={() => onGoToLine(warning.line as number)}
                  className="shrink-0 font-medium text-primary underline underline-offset-2 hover:no-underline"
                >
                  Ligne {warning.line}
                </button>
              )}
              <span className="text-muted-foreground">{warning.message}</span>
            </span>
            {warning.details && (
              // A compiler's own words: kept verbatim, and scrollable rather
              // than allowed to widen the panel.
              <pre className="mt-1 overflow-x-auto rounded border bg-background/60 px-2 py-1 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {warning.details}
              </pre>
            )}
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={onSaveAnyway}
        >
          Enregistrer quand même
        </Button>
      </div>
    </div>
  );
}
