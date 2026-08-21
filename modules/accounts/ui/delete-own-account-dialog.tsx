"use client";

// « Supprimer mon compte » — the droit à l'effacement, exercised by whoever
// holds the account rather than asked of an administrator. It says the two
// halves of what happens, because only both together are true: the personal
// data goes, and the contributions stay under « Anonyme ».
//
// Nothing is reassigned here, unlike an administrator's erasure: choosing a
// colleague to hand the pages to would mean showing a departing user the list
// of everyone else, and « Anonyme » is what an erasure asks for anyway.

import { Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteOwnUser, getOwnDeletionImpact } from "@/modules/accounts/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { OWN_ERASURE_NOTICE, deletionImpactLines } from "@/modules/accounts/rules";

export function DeleteOwnAccountDialog({ onClose }: { onClose: () => void }) {
  const [impact, setImpact] = useState<{
    lines: string[];
    refusal: string | null;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getOwnDeletionImpact().then((counted) => {
      if (!counted) return onClose();
      setImpact({
        lines: deletionImpactLines(counted),
        refusal: counted.refusal,
      });
    });
  }, [onClose]);

  function confirm() {
    startTransition(async () => {
      // On success the action redirects and never returns: what comes back is
      // a refusal — the wiki keeping its last administrator.
      const result = await deleteOwnUser();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <AlertDialog open onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer votre compte ?</AlertDialogTitle>
        </AlertDialogHeader>

        {impact === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : impact.refusal ? (
          <div className="grid gap-2 text-sm">
            <p className="text-destructive">{impact.refusal}</p>
            <p className="text-muted-foreground">
              Nommez un autre administrateur, puis revenez supprimer votre
              compte.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 text-sm">
            <ul className="grid gap-1 text-muted-foreground">
              {impact.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="grid gap-2">
              {OWN_ERASURE_NOTICE.map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
            </div>
            <p className="font-medium">Cette action est irréversible.</p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={isPending || impact === null || impact.refusal !== null}
            onClick={confirm}
          >
            <Trash2 />
            {isPending ? "Suppression…" : "Supprimer mon compte"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
