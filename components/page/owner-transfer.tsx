"use client";

// The owner, and the one gesture that moves them: « Transmettre la propriété »
// (docs/permissions.md § Quel droit commande quel geste). It lives inside the
// « Accès » modal rather than in a modal of its own — the owner is the floor
// every right on the page stands on, so the place to hand the page over is
// where the modal already names them.

import { KeyRound, UserRound } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { transferOwnership } from "@/app/page-rights-actions";
import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/ui/info-note";
import { Input } from "@/components/ui/input";
import { type Identity, ownerLine } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function OwnerTransfer({
  slug,
  owner,
  people,
  onTransferred,
}: {
  slug: string;
  /** Null on a page nobody looks after: the line says « Anonyme ». */
  owner: Identity | null;
  /** The whole membership of the wiki; whoever holds the page is dropped. */
  people: Identity[];
  /** Called once the page has changed hands, the floor with it. */
  onTransferred: (to: Identity) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Identity | null>(null);
  const [query, setQuery] = useState("");
  const [transferring, startTransferring] = useTransition();

  const candidates = people.filter(
    (person) => person.username !== owner?.username
  );

  function confirm() {
    if (!chosen) return;
    startTransferring(async () => {
      const result = await transferOwnership(slug, chosen.username);
      if (result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${chosen.name} est désormais propriétaire de la page.`);
      onTransferred(chosen);
    });
  }

  const matching = (person: Identity) =>
    `${person.name} ${person.username}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  const shown = candidates.filter(matching);

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm">
          <UserRound className="size-3.5 text-muted-foreground" />
          {ownerLine(owner?.name ?? null)}
        </span>
        {!picking && candidates.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPicking(true)}
          >
            <KeyRound />
            Transmettre…
          </Button>
        )}
      </div>

      {picking && (
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
                onClick={() => setChosen(person)}
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
          {/* Shown before the choice is made, and whoever is transferring:
              there is no way back for the one who gives, and the spec puts
              that sentence on the confirmation. */}
          <InfoNote>
            Ce geste est sans retour : une fois la page transmise, seul son
            nouveau propriétaire — ou un administrateur — pourra vous la
            rendre.
          </InfoNote>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPicking(false);
                setChosen(null);
                setQuery("");
              }}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!chosen || transferring}
              onClick={confirm}
            >
              Transmettre la propriété
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
