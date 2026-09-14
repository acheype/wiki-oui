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
  // The first option is highlighted and Enter takes it (issue #34), so the
  // head of the list is always what the typed word asks for: the word itself
  // while the wiki does not know it — a new word is never harder to add than
  // a known one (issue #15) — and nothing at all once it is placed, lest
  // Enter slip in a longer word nobody asked for.
  const items = useMemo(() => {
    if (typed !== "" && includesFolded(tags, typed)) return NO_CANDIDATES;
    const suggestions = suggestValues({ candidates, draft: typed, placed: tags });
    return typed === "" || includesFolded(candidates, typed)
      ? suggestions
      : [typed, ...suggestions];
  }, [candidates, typed, tags]);

  function addDraft() {
    if (typed !== "") {
      const tag = alignSpelling(typed, candidates);
      if (!includesFolded(tags, tag)) onChange([...tags, tag]);
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
        label={(item) =>
          includesFolded(candidates, item) ? item : `Ajouter « ${item} »`
        }
      />
    </Combobox.Root>
  );
}

function includesFolded(values: string[], value: string): boolean {
  const key = fold(value);
  return values.some((candidate) => fold(candidate) === key);
}
