"use client";

// Inviting people (docs/permissions.md § Naissance d'un compte): one field
// that digests what a mail client puts on the clipboard, and a group selector
// beside it — the chore that otherwise always follows an invitation.
//
// The paste is read as it is typed, in the browser, purely to say what was
// understood before anything is sent; what actually counts is read again on
// the server, by the same function.

import { Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { listGroups } from "@/modules/permissions/group-actions";
import { canSendMail, invitePeople } from "@/modules/accounts/admin/actions";
import { LinkToCopy } from "@/modules/accounts/ui/link-to-copy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  SELECT_NONE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { plural } from "@/lib/format";
import type { GroupSummary } from "@/modules/permissions/groups-directory";
import {
  INVITATION_LIFETIME_DAYS,
  type MailFailure,
  invitationSummaryLines,
  parseAddressList,
} from "@/modules/accounts/link/invitations";

/** « Aucun groupe » — the invitation then joins nobody to anything. */
const NO_GROUP = SELECT_NONE;

interface Sent {
  lines: string[];
  /** Each with what became of its own mail, never the batch's verdict. */
  links: { email: string; url: string; failure: MailFailure | null }[];
}

export function InviteDialog({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [groupSlug, setGroupSlug] = useState(NO_GROUP);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [mailable, setMailable] = useState(true);
  const [sent, setSent] = useState<Sent | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    listGroups().then(setGroups);
    canSendMail().then(setMailable);
  }, [open]);

  const parsed = parseAddressList(pasted);

  function submit() {
    startTransition(async () => {
      const outcome = await invitePeople({
        pasted,
        groupSlug: groupSlug === NO_GROUP ? null : groupSlug,
      });
      setSent({
        lines: invitationSummaryLines(outcome.report),
        links: outcome.links,
      });
      onInvited();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPasted("");
          setGroupSlug(NO_GROUP);
          setSent(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Inviter des personnes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Inviter des personnes</DialogTitle>
        </DialogHeader>

        {sent ? (
          <Outcome sent={sent} />
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-addresses">Adresses e-mail</Label>
              <Textarea
                id="invite-addresses"
                value={pasted}
                autoFocus
                rows={6}
                placeholder={
                  "marie@asso.fr, jean@asso.fr\nSophie Vidal <sophie@asso.fr>"
                }
                onChange={(event) => setPasted(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Collez-les comme elles viennent : virgules, points-virgules,
                retours à la ligne et forme «&nbsp;Nom &lt;adresse&gt;&nbsp;».
                Chacune recevra un lien valable {INVITATION_LIFETIME_DAYS} jours
                pour choisir son mot de passe.
                {!mailable &&
                  " Ce wiki n'envoie pas de courriel : les liens s'afficheront ici, à vous de les transmettre."}
              </p>
              <PasteCount
                emails={parsed.emails.length}
                invalid={parsed.invalid}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="invite-group">Ajouter aussi au groupe</Label>
              <Select value={groupSlug} onValueChange={setGroupSlug}>
                <SelectTrigger id="invite-group" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP}>
                    <span className="text-muted-foreground">Aucun groupe</span>
                  </SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.slug} value={group.slug}>
                      @{group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          {sent ? (
            <Button onClick={() => setOpen(false)}>Fermer</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                disabled={isPending || parsed.emails.length === 0}
                onClick={submit}
              >
                {isPending ? "Envoi…" : "Inviter"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the field understood, under the field, before anything is sent. */
function PasteCount({
  emails,
  invalid,
}: {
  emails: number;
  invalid: string[];
}) {
  if (emails === 0 && invalid.length === 0) return null;
  return (
    <p className="text-xs">
      {emails > 0 && (
        <span>{plural(emails, "adresse reconnue", "adresses reconnues")}</span>
      )}
      {invalid.length > 0 && (
        <span className="text-destructive">
          {emails > 0 && " · "}
          {plural(
            invalid.length,
            "fragment sans adresse",
            "fragments sans adresse"
          )}{" "}
          : {invalid.join(", ")}
        </span>
      )}
    </p>
  );
}

/** Afterwards: what happened, then the links, whether or not mail went out. */
function Outcome({ sent }: { sent: Sent }) {
  return (
    <div className="grid gap-4">
      <ul className="grid gap-1 text-sm">
        {sent.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {sent.links.length > 0 && (
        <div className="grid gap-3">
          {sent.links.map((link) => (
            <LinkToCopy
              key={link.email}
              url={link.url}
              email={link.email}
              failure={link.failure}
            />
          ))}
        </div>
      )}
    </div>
  );
}
