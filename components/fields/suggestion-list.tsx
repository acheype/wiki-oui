"use client";

import { Combobox } from "@base-ui/react/combobox";
import type { ReactNode } from "react";

/**
 * The floating list under the fields that say « type it, or pick what
 * already exists » (issues #15, #34). Autocomplete reuses Combobox's parts,
 * so one list serves both roots: tags-input picks with Combobox, the
 * single-value fields complete with Autocomplete.
 */
export function SuggestionList({
  label = (item) => item,
  highlightIsSelection = false,
}: {
  /** What an option reads; the value itself by default. */
  label?: (item: string) => ReactNode;
  /**
   * Announce the highlighted option as selected, as the APG combobox examples
   * do — right where Enter takes it, wrong where aria-selected already means
   * « chosen », in a multiple list.
   */
  highlightIsSelection?: boolean;
}) {
  return (
    <Combobox.Portal>
      <Combobox.Positioner className="isolate z-50" align="start" sideOffset={4}>
        <Combobox.Popup className="max-h-64 w-(--anchor-width) min-w-56 overflow-y-auto rounded-md bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden">
          <Combobox.List aria-label="Suggestions">
            {(item: string) => (
              <Combobox.Item
                key={item}
                value={item}
                className="w-full cursor-default truncate rounded-sm px-2 py-1.5 text-left text-sm data-highlighted:bg-muted"
                render={
                  highlightIsSelection
                    ? (props, state) => (
                        <div {...props} aria-selected={state.highlighted} />
                      )
                    : undefined
                }
              >
                {label(item)}
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  );
}
