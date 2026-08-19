"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fold } from "@/lib/fold";
import { alignSpelling, suggestValues } from "@/lib/suggested-values";
import {
  SuggestionPopover,
  useSuggestions,
} from "./suggestion-popover";

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
  const items = useMemo(
    () => suggestValues({ candidates, draft, placed: tags }),
    [candidates, draft, tags]
  );
  // Picking adds one more chip and clears the draft: the panel stays open on
  // the remaining candidates, so several keywords go on in a row.
  const suggestions = useSuggestions({
    items,
    onPick: (value) => {
      onChange([...tags, value]);
      setDraft("");
    },
  });

  function addDraft() {
    const typed = draft.trim();
    if (typed === "") {
      setDraft("");
      return;
    }
    const tag = alignSpelling(typed, candidates);
    const key = fold(tag);
    if (!tags.some((placed) => fold(placed) === key)) {
      onChange([...tags, tag]);
    }
    setDraft("");
  }

  return (
    <SuggestionPopover suggestions={suggestions}>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              aria-label={`Retirer le tag ${tag}`}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          {...suggestions.comboboxProps}
          id={id}
          aria-label={ariaLabel}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (suggestions.handleKeyDown(event)) return;
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addDraft();
            }
            if (event.key === "Backspace" && draft === "" && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onFocus={() => {
            suggestions.openList();
            onFocus?.();
          }}
          onBlur={() => {
            suggestions.closeList();
            addDraft();
          }}
          placeholder={tags.length === 0 ? "Ajouter des tags…" : ""}
          className="h-7 w-40 border-none bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
    </SuggestionPopover>
  );
}
