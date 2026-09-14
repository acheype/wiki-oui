"use client";

import { Combobox } from "@base-ui/react/combobox";
import { X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fold } from "@/lib/fold";
import { alignSpelling, suggestValues } from "@/modules/forms/suggested-values";
import { SuggestionList } from "./suggestion-list";

const NO_CANDIDATES: string[] = [];

export function TagsInput({
  id,
  ariaLabel,
  tags,
  candidates = NO_CANDIDATES,
  onChange,
  onFocus,
}: {
  /** The id the field's <label> points at; absent where there is no label. */
  id?: string;
  /** The name a screen reader announces where no <label> names the field. */
  ariaLabel?: string;
  tags: string[];
  /** Already-used values to suggest (issue #15) — page tags or field values, the caller's to fetch. */
  candidates?: string[];
  onChange: (tags: string[]) => void;
  onFocus?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const highlighted = useRef<string | undefined>(undefined);

  const typed = draft.trim();
  const isNew = (value: string) =>
    !candidates.some((candidate) => fold(candidate) === fold(value));
  // The typed word heads the list whenever the wiki does not know it yet:
  // the first option is highlighted and Enter takes it, so a new word is
  // never harder to add than a known one (issues #15, #34).
  const items = useMemo(() => {
    const suggestions = suggestValues({ candidates, draft, placed: tags });
    const key = fold(draft.trim());
    const known = [...candidates, ...tags].some((value) => fold(value) === key);
    return key === "" || known ? suggestions : [draft.trim(), ...suggestions];
  }, [candidates, draft, tags]);

  function addDraft() {
    if (typed !== "") {
      const tag = alignSpelling(typed, candidates);
      if (!tags.some((placed) => fold(placed) === fold(tag))) {
        onChange([...tags, tag]);
      }
    }
    setDraft("");
  }

  return (
    <Combobox.Root
      multiple
      items={items}
      // suggestValues already filtered and ranked the list.
      filter={null}
      autoHighlight
      value={tags}
      onValueChange={(next, details) => {
        // Base UI clears every chip on Escape once the list is closed.
        if (details.reason === "escape-key") return details.cancel();
        onChange(next);
        setDraft("");
      }}
      inputValue={draft}
      onInputValueChange={(next, details) => {
        // The draft is emptied here once it became a chip, never by Base UI:
        // it clears the input whenever a multiple list closes, Escape included.
        if (details.reason === "escape-key" || details.reason === "input-clear") {
          return details.cancel();
        }
        setDraft(next);
      }}
      // Held open while the field has the focus: an emptied draft shows the
      // most used values again, and a picked chip leaves the rest on offer so
      // several go on in a row.
      open={open && items.length > 0}
      onOpenChange={(next, details) => {
        if (
          !next &&
          (details.reason === "input-clear" || details.reason === "item-press")
        ) {
          return details.cancel();
        }
        setOpen(next);
      }}
      onItemHighlighted={(item) => {
        highlighted.current = item;
      }}
    >
      <Combobox.InputGroup>
        <Combobox.Chips className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <Combobox.Chip
              key={tag}
              aria-label={tag}
              render={<Badge variant="secondary" className="gap-1 pr-1" />}
              className="data-highlighted:ring-2 data-highlighted:ring-ring"
            >
              {tag}
              <Combobox.ChipRemove
                aria-label={`Retirer le tag ${tag}`}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
              </Combobox.ChipRemove>
            </Combobox.Chip>
          ))}
          <Combobox.Input
            id={id}
            aria-label={ariaLabel}
            placeholder={tags.length === 0 ? "Ajouter des tags…" : ""}
            className="h-7 w-40 rounded-md bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
            onFocus={() => {
              setOpen(true);
              onFocus?.();
            }}
            onBlur={addDraft}
            onKeyDown={(event) => {
              // Enter over a highlighted option is Base UI's to pick.
              const enterOnDraft =
                event.key === "Enter" && highlighted.current === undefined;
              if (event.key === "," || enterOnDraft) {
                event.preventDefault();
                addDraft();
              }
            }}
          />
        </Combobox.Chips>
      </Combobox.InputGroup>
      <SuggestionList
        label={(item) => (isNew(item) ? `Ajouter « ${item} »` : item)}
      />
    </Combobox.Root>
  );
}
