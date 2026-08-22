"use client";

// Naming one person out of the whole wiki: a search field and the list under
// it, the shape « Transmettre la propriété » takes on a page and on a lot
// alike. Its own file because both permissions hand a page over, and they must
// not name people two different ways.

import { UserRound } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { Identity } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function PersonPicker({
  people,
  chosen,
  onChoose,
}: {
  people: Identity[];
  chosen: Identity | null;
  onChoose: (person: Identity) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = people.filter((person) =>
    `${person.name} ${person.username}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  return (
    <div className="grid gap-2">
      <Input
        value={query}
        autoFocus
        placeholder="Rechercher une personne…"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="grid max-h-48 gap-0.5 overflow-y-auto">
        {shown.map((person) => (
          <button
            key={person.username}
            type="button"
            aria-pressed={chosen?.username === person.username}
            onClick={() => onChoose(person)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
              chosen?.username === person.username &&
                "bg-accent text-accent-foreground"
            )}
          >
            <UserRound className="size-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{person.name}</span>
            <code className="font-mono text-xs text-muted-foreground">
              {person.username}
            </code>
          </button>
        ))}
        {shown.length === 0 && (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Personne de ce nom.
          </p>
        )}
      </div>
    </div>
  );
}
