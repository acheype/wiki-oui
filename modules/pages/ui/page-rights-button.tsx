"use client";

// « Accès » (docs/permissions.md § La modale de droits d'une page): the same
// modal for a page and for an entry, whose `edit` is already taken by the
// generated form. Both senses are posed at once, by the shared `acl` widget —
// so what a page's rights look like is what a form's and a field's will. The
// owner heads it, since they are the floor both senses stand on, and handing
// the page over is done from there.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type PageRightsForm,
  loadPageRights,
  savePageRights,
} from "@/modules/pages/rights/actions";
import { Field } from "@/modules/forms/field-widget";
import { OwnerTransfer } from "@/modules/pages/ui/owner-transfer";
import { signInLockout } from "@/modules/pages/ui/labels";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SignInLockoutDescription } from "@/modules/pages/ui/sign-in-lockout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AccessRule } from "@/modules/permissions/rules";

export function PageRightsButton({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rights, setRights] = useState<PageRightsForm | null>(null);
  const [read, setRead] = useState<AccessRule>({ scope: "restricted" });
  const [write, setWrite] = useState<AccessRule>({ scope: "restricted" });
  const [saving, startSaving] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function openWith(next: boolean) {
    setOpen(next);
    if (!next) return;
    // Read on opening rather than on rendering the bar: the bar is on every
    // page, and this is a query nobody has asked for until they click.
    setRights(null);
    loadPageRights(slug).then((loaded) => {
      if ("error" in loaded) {
        setOpen(false);
        toast.error(loaded.error);
        return;
      }
      if (!loaded.rights) return;
      setRights(loaded.rights);
      setRead(loaded.rights.read);
      setWrite(loaded.rights.write);
    });
  }

  function save() {
    startSaving(async () => {
      const result = await savePageRights(slug, read, write);
      if (result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success(`Les droits de ${subject} ont été enregistrés.`);
    });
  }

  // The modal is the same for a fiche; only what it calls the thing changes.
  // Both nouns are feminine, so the second question needs no variant.
  const subject = rights?.isEntry ? "cette fiche" : "cette page";
  // Raised on the save rather than shown beside the widget: a note in small
  // grey type is walked past, and this consequence costs the wiki.
  const lockout = signInLockout([slug], read);

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Accès à {subject}</DialogTitle>
        </DialogHeader>

        {!rights ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="grid gap-5">
            <OwnerTransfer
              slug={slug}
              owner={rights.floor.owner}
              people={rights.directory.people}
              // The floor of both senses just moved, and unsaved scopes would
              // now be posed against another owner: the modal closes on the
              // action it just carried out, and reopens on the new floor.
              onTransferred={() => setOpen(false)}
            />
            <Field
              id="page-read-acl"
              spec={{ type: "acl", label: `Qui peut voir ${subject} ?` }}
              value={read}
              environment={{ directory: rights.directory, aclFloor: rights.floor }}
              onChange={(value) => setRead(value as AccessRule)}
            />
            <Field
              id="page-write-acl"
              spec={{ type: "acl", label: "Qui peut la modifier ?" }}
              value={write}
              environment={{ directory: rights.directory, aclFloor: rights.floor }}
              onChange={(value) => setWrite(value as AccessRule)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => (lockout ? setConfirming(true) : save())}
            disabled={!rights || saving}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Asked, not merely noted: the rights modal is a place people click
          through, and closing a sign-in page is the one change here nothing
          undoes once every session has expired. */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fermer l&apos;accès à cette page&nbsp;?</AlertDialogTitle>
            {lockout && <SignInLockoutDescription lockout={lockout} />}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            {/* Red, like every other confirmation that cannot be walked back
                (gerer-utilisateurs): the eye must find the safe answer without
                reading the labels. */}
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                setConfirming(false);
                save();
              }}
            >
              Enregistrer quand même
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
