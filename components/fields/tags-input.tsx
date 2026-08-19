"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { alignSpelling, fold, suggestTags } from "@/lib/tag-suggestions";

const NO_CANDIDATES: string[] = [];

export function TagsInput({
  tags,
  candidates = NO_CANDIDATES,
  onChange,
  onFocus,
}: {
  tags: string[];
  /** Already-used values to suggest (issue #15) — page tags or field values, the caller's to fetch. */
  candidates?: string[];
  onChange: (tags: string[]) => void;
  onFocus?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const suggestions = useMemo(
    () => suggestTags({ candidates, draft, placed: tags }),
    [candidates, draft, tags]
  );

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

  function addSuggestion(name: string) {
    onChange([...tags, name]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
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
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addDraft();
            }
            if (event.key === "Backspace" && draft === "" && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={addDraft}
          onFocus={onFocus}
          placeholder={tags.length === 0 ? "Ajouter des tags…" : ""}
          className="h-7 w-40 border-none bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((name) => (
            <Button
              key={name}
              type="button"
              variant="secondary"
              size="sm"
              className="h-6 rounded-full px-2 text-xs"
              // Without this, the click's blur fires first and addDraft
              // beats it to the punch with the raw draft ("atel" instead of
              // the suggestion clicked, "Atelier").
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addSuggestion(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
