"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageWarning } from "@/lib/page-lint";

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
  return (
    <div
      // Announced on appearance: the save button seemingly doing nothing
      // otherwise leaves a screen-reader user with no explanation.
      role="alert"
      className="grid gap-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/20"
    >
      <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-500">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {warnings.length === 1
          ? "Un élément de cette page ne s'affichera pas"
          : `${warnings.length} éléments de cette page ne s'afficheront pas`}
      </p>

      <ul className="grid gap-1.5">
        {warnings.map((warning, index) => (
          <li key={index} className="flex flex-wrap items-baseline gap-x-1.5">
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
