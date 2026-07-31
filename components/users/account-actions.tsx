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
import { DeleteOwnAccountDialog } from "@/components/users/delete-own-account-dialog";
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
  SELECT_NONE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ERASURE_KEEPS_CONTENT, deletionImpactLines } from "@/lib/accounts";
import type {
  DeliveredLink,
  PendingInvitation,
  UserRow,
} from "@/lib/accounts-db";

/** « Personne » — the pages then read « Anonyme » (ADR 0024). */
const NOBODY = SELECT_NONE;

export function AccountActions({
  user,
  users,
  own,
  onChanged,
}: {
  user: UserRow;
  /** Everyone else, as candidates to take over what this account owns. */
  users: UserRow[];
  /** This line is the actor's own: what they may do to it is not the same. */
  own: boolean;
  onChanged: () => void;
}) {
  const [link, setLink] = useState<DeliveredLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleDisabled() {
    startTransition(async () => {
      const result = await setUserDisabled(user.username, !user.disabled);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        user.disabled
          ? `${user.name} peut à nouveau se connecter.`
          : `${user.name} ne peut plus se connecter. Ses pages restent à son nom.`
      );
      onChanged();
    });
  }

  function resetPassword() {
    startTransition(async () => {
      const delivered = await sendResetLink(user.username);
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
            aria-label={`Actions sur le compte de ${user.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Not offered to a disabled account: a link would open on « ce lien
              n'est plus valable », and an action that cannot be taken informs
              nobody (docs/permissions.md § Ce que voit qui n'a pas le droit). */}
          {!user.disabled && (
            <DropdownMenuItem onSelect={resetPassword}>
              <KeyRound />
              Envoyer un lien de mot de passe
            </DropdownMenuItem>
          )}
          {/* One's own account is not disabled from here: it would lock the
              author of the gesture out on the spot, and « se déconnecter » is
              what they were after. */}
          {!own && (
            <DropdownMenuItem onSelect={toggleDisabled}>
              <UserMinus />
              {user.disabled ? "Réactiver le compte" : "Désactiver le compte"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2 />
            {own ? "Supprimer mon compte…" : "Supprimer le compte…"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={link !== null} onOpenChange={() => setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lien de mot de passe</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {user.name} choisira son mot de passe : un administrateur n&apos;en
            définit jamais un à la place de quelqu&apos;un.
          </p>
          {link && (
            <LinkToCopy
              url={link.url}
              email={user.email}
              delivery={link.delivery}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setLink(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleting &&
        (own ? (
          // The same erasure, said in the words it is owed when the account
          // is one's own — and it ends signed out, so there is no list to
          // refresh afterwards.
          <DeleteOwnAccountDialog onClose={() => setDeleting(false)} />
        ) : (
          <DeleteAccountDialog
            user={user}
            users={users}
            onClose={() => setDeleting(false)}
            onDeleted={onChanged}
          />
        ))}
    </>
  );
}

/**
 * « Supprimer » announces the numbers and offers to hand the pages on, then
 * erases (docs/permissions.md). Nothing written disappears: the pages and the
 * history stay where they are, signed « Anonyme » unless someone takes them.
 */
function DeleteAccountDialog({
  user,
  users,
  onClose,
  onDeleted,
}: {
  user: UserRow;
  users: UserRow[];
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
    getDeletionImpact(user.username).then((counted) =>
      setImpact({
        lines: deletionImpactLines(counted),
        refusal: counted.refusal,
      })
    );
  }, [user.username]);

  function confirm() {
    startTransition(async () => {
      const result = await deleteUser(
        user.username,
        heir === NOBODY ? null : heir
      );
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Le compte de ${user.name} a été supprimé.`);
      onClose();
      onDeleted();
    });
  }

  const heirs = users.filter(
    (candidate) => candidate.username !== user.username
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer le compte de {user.name} ?</DialogTitle>
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
                {ERASURE_KEEPS_CONTENT}
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
