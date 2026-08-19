"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The floating suggestion list shared by the fields that say « type it, or
 * pick what already exists » (issue #15): keywords, the page a link points
 * to, the file a component shows. It owns the panel and the keyboard; what
 * picking *means* — one more chip, or a value replaced — stays the caller's,
 * which is what lets one panel serve a multi-value field and a single-value
 * one at once.
 *
 * ARIA combobox pattern: the field keeps the focus, the panel never takes it,
 * and the highlighted option is named through aria-activedescendant.
 */

/** What useSuggestions hands the field and the panel to work together. */
export interface Suggestions {
  shown: boolean;
  items: string[];
  activeIndex: number;
  listboxId: string;
  optionId: (index: number) => string;
  comboboxProps: {
    role: "combobox";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
    "aria-activedescendant": string | undefined;
    "aria-autocomplete": "list";
  };
  openList: () => void;
  closeList: () => void;
  pick: (value: string) => void;
  /** True when the key belonged to the list; false leaves it to the field. */
  handleKeyDown: (event: KeyboardEvent) => boolean;
}

export function useSuggestions({
  items,
  onPick,
}: {
  items: string[];
  onPick: (value: string) => void;
}): Suggestions {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  // The highlight is held as a value rather than an index: the list is
  // refiltered on every keystroke, and an index would silently come to rest
  // on whatever word took that row next.
  const [activeValue, setActiveValue] = useState<string | null>(null);

  const activeIndex = activeValue === null ? -1 : items.indexOf(activeValue);
  const shown = open && items.length > 0;

  function optionId(index: number) {
    return `${listboxId}-option-${index}`;
  }

  function closeList() {
    setOpen(false);
    setActiveValue(null);
  }

  function pick(value: string) {
    onPick(value);
    setActiveValue(null);
  }

  // Nothing is highlighted when the panel opens, and the ends of the list
  // lead back to that state rather than wrapping around: Enter then still
  // validates what was typed. A word the wiki does not know yet must never
  // be harder to add than one it does (issue #15, « la saisie reste libre »).
  function move(step: number) {
    const next = activeIndex + step;
    setActiveValue(next < 0 || next >= items.length ? null : items[next]);
  }

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (!shown) return false;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        return true;
      case "ArrowUp":
        event.preventDefault();
        move(activeIndex < 0 ? items.length : -1);
        return true;
      case "Escape":
        event.preventDefault();
        closeList();
        return true;
      case "Enter":
        if (activeIndex < 0) return false;
        event.preventDefault();
        pick(items[activeIndex]);
        return true;
      default:
        return false;
    }
  }

  return {
    shown,
    items,
    activeIndex,
    listboxId,
    optionId,
    comboboxProps: {
      role: "combobox",
      "aria-expanded": shown,
      "aria-controls": shown ? listboxId : undefined,
      "aria-activedescendant":
        activeIndex >= 0 ? optionId(activeIndex) : undefined,
      "aria-autocomplete": "list",
    },
    openList: () => setOpen(true),
    closeList,
    pick,
    handleKeyDown,
  };
}

/** The panel itself, hung under the field passed as its child. */
export function SuggestionPopover({
  suggestions,
  children,
}: {
  suggestions: Suggestions;
  children: ReactNode;
}) {
  return (
    <Popover open={suggestions.shown}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        id={suggestions.listboxId}
        role="listbox"
        aria-label="Suggestions"
        align="start"
        sideOffset={4}
        className="max-h-64 w-(--radix-popover-trigger-width) min-w-56 gap-0 overflow-y-auto p-1"
        // The field keeps the focus throughout — the panel is a list one
        // reads, never a place one lands.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {suggestions.items.map((item, index) => (
          <button
            key={item}
            id={suggestions.optionId(index)}
            type="button"
            role="option"
            aria-selected={index === suggestions.activeIndex}
            className={cn(
              "w-full truncate rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
              index === suggestions.activeIndex && "bg-muted"
            )}
            // Without this the click's blur closes the panel first, and the
            // field is left holding whatever was half-typed.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => suggestions.pick(item)}
          >
            {item}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
