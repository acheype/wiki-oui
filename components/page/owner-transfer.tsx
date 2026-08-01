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
import { PersonPicker } from "@/components/page/person-picker";
import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/ui/info-note";
import {
  type Identity,
  ownerLine,
  ownerTransferNote,
  ownerTransferWarning,
} from "@/lib/permissions";

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
          <p className="text-sm text-muted-foreground">{ownerTransferNote(1)}</p>
          <PersonPicker people={candidates} chosen={chosen} onChoose={setChosen} />
          {/* Shown before the choice is made, and whoever is transferring:
              there is no way back for the one who gives, and the spec puts
              that sentence on the confirmation. */}
          <InfoNote>{ownerTransferWarning(1)}</InfoNote>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setPicking(false);
                setChosen(null);
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
