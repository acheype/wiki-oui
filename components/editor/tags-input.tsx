"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function TagsInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addDraft() {
    const tag = draft.trim();
    if (tag !== "" && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setDraft("");
  }

  return (
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
        placeholder={tags.length === 0 ? "Ajouter des tags…" : ""}
        className="h-7 w-40 border-none bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
    </div>
  );
}
