"use client";

// « Droits » (docs/permissions.md § La modale de droits d'une page): the same
// modal for a page and for an entry, whose `edit` is already taken by the
// generated form. Both senses are posed at once, by the shared `acl` widget —
// so what a page's rights look like is what a form's and a field's will.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type PageRightsForm, loadPageRights, savePageRights } from "@/app/page-rights-actions";
import { Field } from "@/components/fields/field-widget";
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
import { type AccessRule, ownerLine } from "@/lib/permissions";

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

  function openWith(next: boolean) {
    setOpen(next);
    if (!next) return;
    // Read on opening rather than on rendering the bar: the bar is on every
    // page, and this is a query nobody has asked for until they click.
    setRights(null);
    loadPageRights(slug).then((loaded) => {
      if (!loaded) return;
      setRights(loaded);
      setRead(loaded.read);
      setWrite(loaded.write);
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

  const owner = rights ? ownerLine(rights.floor.owner?.name ?? null) : null;
  // The modal is the same for a fiche; only what it calls the thing changes.
  // Both nouns are feminine, so the second question needs no variant.
  const subject = rights?.isEntry ? "cette fiche" : "cette page";

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Droits de {subject}</DialogTitle>
          {owner && <DialogDescription>{owner}</DialogDescription>}
        </DialogHeader>

        {!rights ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="grid gap-5">
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
          <Button onClick={save} disabled={!rights || saving}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
