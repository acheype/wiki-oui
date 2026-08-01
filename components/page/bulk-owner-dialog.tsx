"use client";

// « Changer le propriétaire », for a lot (docs/permissions.md § gerer-pages).
// The same gesture the « Accès » modal carries on one page, and just as final
// for whoever gives the pages away — which is why the count is in the sentence
// and not only in the button.

import { KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { handPagesOver } from "@/app/pages-admin-actions";
import { PersonPicker } from "@/components/page/person-picker";
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
import { InfoNote } from "@/components/ui/info-note";
import { lotSubject } from "@/lib/bulk-rights";
import type { ManagedPage } from "@/lib/pages";
import {
  type Identity,
  ownerTransferNote,
  ownerTransferWarning,
} from "@/lib/permissions";

export function BulkOwnerDialog({
  pages,
  people,
  onApplied,
}: {
  pages: ManagedPage[];
  people: Identity[];
  /** Called once the lot has changed hands: the list is stale from here. */
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Identity | null>(null);
  const [handing, startHanding] = useTransition();

  const subject = lotSubject(pages.length);

  function apply() {
    if (!chosen) return;
    startHanding(async () => {
      const result = await handPagesOver(
        pages.map((page) => page.slug),
        chosen.username
      );
      if (result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(`${chosen.name} est désormais propriétaire de ${subject}.`);
      onApplied();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setChosen(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <KeyRound />
          Changer le propriétaire…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Changer le propriétaire</DialogTitle>
          {/* Both sentences are the ones the « Accès » modal shows on a single
              page, which is why they live in lib/permissions.ts: one gesture,
              taken here on a lot, has to be described in one voice. */}
          <DialogDescription>{ownerTransferNote(pages.length)}</DialogDescription>
        </DialogHeader>

        <PersonPicker people={people} chosen={chosen} onChoose={setChosen} />

        <InfoNote>{ownerTransferWarning(pages.length)}</InfoNote>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={apply} disabled={!chosen || handing}>
            Changer le propriétaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
