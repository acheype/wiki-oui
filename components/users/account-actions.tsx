"use client";

// What an administrator can do to one account (docs/permissions.md § Fin d'un
// compte). Three gestures, and the distance between them is deliberate: a
// reset link is offered outright, disabling sits one menu away and says what
// it does not touch, and erasing opens a modal that counts what is at stake
// before it will go through.

import { KeyRound, Mail, MoreHorizontal, Trash2, UserMinus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteUser,
  getDeletionImpact,
  resendInvite,
  revokeInvite,
  sendResetLink,
  setUserDisabled,
} from "@/app/user-actions";
import { LinkToCopy } from "@/components/users/link-to-copy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deletionImpactLines } from "@/lib/accounts";
import type {
  AccountRow,
  DeliveredLink,
  PendingInvitation,
} from "@/lib/accounts-db";

/** The Select needs a non-empty value for « personne » (ADR 0024: « Anonyme »). */
const NOBODY = "—";

export function AccountActions({
  account,
  accounts,
  onChanged,
}: {
  account: AccountRow;
  /** Everyone else, as candidates to take over what this account owns. */
  accounts: AccountRow[];
  onChanged: () => void;
}) {
  const [link, setLink] = useState<DeliveredLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleDisabled() {
    startTransition(async () => {
      const result = await setUserDisabled(account.username, !account.disabled);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        account.disabled
          ? `${account.name} peut à nouveau se connecter.`
          : `${account.name} ne peut plus se connecter. Ses pages restent à son nom.`
      );
      onChanged();
    });
  }

  function resetPassword() {
    startTransition(async () => {
      const delivered = await sendResetLink(account.username);
      if (delivered) setLink(delivered);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={`Actions sur le compte de ${account.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={resetPassword}>
            <KeyRound />
            Envoyer un lien de mot de passe
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleDisabled}>
            <UserMinus />
            {account.disabled ? "Réactiver le compte" : "Désactiver le compte"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2 />
            Supprimer le compte…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={link !== null} onOpenChange={() => setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien de mot de passe</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {account.name} choisira son mot de passe : un administrateur n&apos;en
            définit jamais un à la place de quelqu&apos;un.
          </p>
          {link && (
            <LinkToCopy
              url={link.url}
              email={account.email}
              delivery={link.delivery}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleting && (
        <DeleteAccountDialog
          account={account}
          accounts={accounts}
          onClose={() => setDeleting(false)}
          onDeleted={onChanged}
        />
      )}
    </>
  );
}

/**
 * « Supprimer » announces the numbers and offers to hand the pages on, then
 * erases (docs/permissions.md). Nothing written disappears: the pages and the
 * history stay where they are, signed « Anonyme » unless someone takes them.
 */
function DeleteAccountDialog({
  account,
  accounts,
  onClose,
  onDeleted,
}: {
  account: AccountRow;
  accounts: AccountRow[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<{
    lines: string[];
    refusal: string | null;
  } | null>(null);
  const [heir, setHeir] = useState(NOBODY);
  const [isPending, startTransition] = useTransition();

  // Counted when the modal opens, not while the list is drawn: it is one query
  // per account, and the answer only matters to whoever asks this question.
  useEffect(() => {
    getDeletionImpact(account.username).then((counted) =>
      setImpact({
        lines: deletionImpactLines(counted),
        refusal: counted.refusal,
      })
    );
  }, [account.username]);

  function confirm() {
    startTransition(async () => {
      const result = await deleteUser(
        account.username,
        heir === NOBODY ? null : heir
      );
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Le compte de ${account.name} a été supprimé.`);
      onClose();
      onDeleted();
    });
  }

  const heirs = accounts.filter(
    (candidate) => candidate.username !== account.username
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer le compte de {account.name} ?</DialogTitle>
        </DialogHeader>

        {impact === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : impact.refusal ? (
          <p className="text-sm text-destructive">{impact.refusal}</p>
        ) : (
          <div className="grid gap-4">
            <ul className="grid gap-1 text-sm">
              {impact.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <div className="grid gap-1.5">
              <Label htmlFor="delete-heir">Réattribuer ses pages à</Label>
              <Select value={heir} onValueChange={setHeir}>
                <SelectTrigger id="delete-heir" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>
                    <span className="text-muted-foreground">
                      Personne — elles s&apos;afficheront «&nbsp;Anonyme&nbsp;»
                    </span>
                  </SelectItem>
                  {heirs.map((candidate) => (
                    <SelectItem
                      key={candidate.username}
                      value={candidate.username}
                    >
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Les pages et l&apos;historique subsistent dans tous les cas :
                seule la signature change.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={isPending || impact === null || impact.refusal !== null}
            onClick={confirm}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A pending invitation has two gestures: send it again, or take it back. */
export function InvitationActions({
  invitation,
  onChanged,
}: {
  invitation: PendingInvitation;
  onChanged: () => void;
}) {
  const [link, setLink] = useState<DeliveredLink | null>(null);
  const [isPending, startTransition] = useTransition();

  function resend() {
    startTransition(async () => {
      setLink(await resendInvite(invitation.email));
      onChanged();
    });
  }

  function revoke() {
    startTransition(async () => {
      await revokeInvite(invitation.email);
      toast.success(`L'invitation de ${invitation.email} a été révoquée.`);
      onChanged();
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" disabled={isPending} onClick={resend}>
        Renvoyer
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={revoke}
        className="text-destructive hover:text-destructive"
      >
        Révoquer
      </Button>

      <Dialog open={link !== null} onOpenChange={() => setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle invitation</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <Mail className="mr-1 inline size-4" />
            {invitation.email} — le lien précédent ne fonctionne plus.
          </p>
          {link && (
            <LinkToCopy
              url={link.url}
              email={invitation.email}
              delivery={link.delivery}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
