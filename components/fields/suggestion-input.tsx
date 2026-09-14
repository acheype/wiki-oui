"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { suggestValues } from "@/modules/forms/suggested-values";
import { SuggestionList } from "./suggestion-list";

/**
 * One free-text field with the floating list of what already exists, worn by
 * page-list and file-list. Typing stays free: the text is the value at every
 * keystroke, and picking replaces it outright — where tags-input adds a chip.
 *
 * The closest suggestion is highlighted as one types, so Enter takes it
 * (issue #34); suggestValues ranks the exact match first, so Enter never
 * swaps a value typed in full for a longer one.
 */
export function SuggestionInput({
  id,
  value,
  placeholder,
  candidates,
  onChange,
}: {
  id: string;
  value: string;
  placeholder: string;
  candidates: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = useMemo(
    () => suggestValues({ candidates, draft: value, placed: [] }),
    [candidates, value]
  );

  return (
    <Autocomplete.Root
      items={items}
      // suggestValues already filtered and ranked the list.
      filter={null}
      autoHighlight
      value={value}
      onValueChange={(next, details) => {
        // Base UI clears the field on Escape once the list is closed; in a
        // dialog that Escape is meant for the dialog, not for the value.
        if (details.reason === "escape-key") return details.cancel();
        onChange(next);
      }}
      // Held open while the field has the focus, so an emptied field shows
      // the head of the list again.
      open={open && items.length > 0}
      onOpenChange={(next, details) => {
        if (!next && details.reason === "input-clear") return details.cancel();
        setOpen(next);
      }}
    >
      <Autocomplete.Input
        id={id}
        placeholder={placeholder}
        render={<Input />}
        onFocus={() => setOpen(true)}
      />
      <SuggestionList />
    </Autocomplete.Root>
  );
}
