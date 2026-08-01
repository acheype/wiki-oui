"use client";

// « Transmettre la propriété » (docs/permissions.md § Quel droit commande quel
// geste): the owner's and the administrators' gesture, and the only one of the
// three that hands something to someone rather than taking it away — hence a
// dialog that asks who before it warns about what.

import { KeyRound, TriangleAlert, UserRound } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { loadOwnerCandidates, transferOwnership } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Identity } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function TransferOwnershipButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Identity[] | null>(null);
  const [chosen, setChosen] = useState<Identity | null>(null);
  const [query, setQuery] = useState("");
  const [transferring, startTransferring] = useTransition();

  function openWith(next: boolean) {
    setOpen(next);
    if (!next) return;
    // Read on opening rather than on rendering the bar: the whole membership
    // of the wiki is a query nobody has asked for until they click.
    setCandidates(null);
    setChosen(null);
    setQuery("");
    loadOwnerCandidates(slug).then(setCandidates);
  }

  function confirm() {
    if (!chosen) return;
    startTransferring(async () => {
      const result = await transferOwnership(slug, chosen.username);
      if (result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(`${chosen.name} est désormais propriétaire de la page.`);
    });
  }

  const matching = (candidate: Identity) =>
    `${candidate.name} ${candidate.username}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <KeyRound />
          Transmettre
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transmettre la propriété</DialogTitle>
          <DialogDescription>
            Choisissez à qui confier «&nbsp;{slug}&nbsp;».
          </DialogDescription>
        </DialogHeader>

        {candidates === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Il n&apos;y a personne d&apos;autre sur ce wiki à qui la confier.
          </p>
        ) : (
          <div className="grid gap-2">
            <Input
              value={query}
              autoFocus
              placeholder="Rechercher une personne…"
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="grid max-h-64 gap-0.5 overflow-y-auto">
              {candidates.filter(matching).map((candidate) => (
                <button
                  key={candidate.username}
                  type="button"
                  aria-pressed={chosen?.username === candidate.username}
                  onClick={() => setChosen(candidate)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    chosen?.username === candidate.username &&
                      "bg-accent text-accent-foreground"
                  )}
                >
                  <UserRound className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.name}
                  </span>
                  <code className="font-mono text-xs text-muted-foreground">
                    {candidate.username}
                  </code>
                </button>
              ))}
              {candidates.every((candidate) => !matching(candidate)) && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Personne de ce nom.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Sans retour pour celui qui donne, et la confirmation le dit
            (docs/permissions.md § Quel droit commande quel geste). */}
        <p className="flex gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Ce geste est sans retour : une fois la page transmise, seul son
            nouveau propriétaire — ou un administrateur — pourra vous la rendre.
          </span>
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={confirm} disabled={!chosen || transferring}>
            Transmettre la propriété
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
