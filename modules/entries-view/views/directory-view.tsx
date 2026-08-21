"use client";

// Annuaire (docs/entries-view.md): alphabetical listing grouped by the
// title's initial, with a sticky clickable letter index (empty letters
// greyed). No specific parameter; sorting is alphabetical by construction.

import { directoryGroups } from "@/modules/entries-view/rules";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import type { ViewContext } from "./types";

const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

export function DirectoryView({ context }: { context: ViewContext }) {
  const groups = directoryGroups(context.entries);
  const present = new Set(groups.map((group) => group.letter));

  return (
    <div className="grid gap-4">
      <nav
        aria-label="Index alphabétique"
        className="sticky top-0 z-10 flex flex-wrap gap-0.5 rounded-md border bg-background/95 p-1.5 backdrop-blur"
      >
        {ALPHABET.map((letter) =>
          present.has(letter) ? (
            <a
              key={letter}
              href={`#annuaire-${letter}`}
              className="flex size-7 items-center justify-center rounded text-sm font-medium hover:bg-accent"
            >
              {letter}
            </a>
          ) : (
            <span
              key={letter}
              className="flex size-7 items-center justify-center text-sm text-muted-foreground/40"
              aria-hidden
            >
              {letter}
            </span>
          )
        )}
      </nav>

      {groups.map((group) => (
        <section key={group.letter} id={`annuaire-${group.letter}`}>
          <h3 className="mb-1.5 border-b pb-1 text-lg font-semibold text-muted-foreground">
            {group.letter}
          </h3>
          <ul className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {group.entries.map((entry) => {
              const color = context.colorOf(entry);
              const icon = context.iconOf(entry);
              return (
                <li key={entry.slug}>
                  <button
                    type="button"
                    onClick={() => context.openEntry(entry.slug)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    {color && (
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                    )}
                    {icon && (
                      <span
                        className="shrink-0 text-muted-foreground [&_svg]:size-4"
                        aria-hidden
                      >
                        <Icon id={icon} />
                      </span>
                    )}
                    <span className="truncate">{entry.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
