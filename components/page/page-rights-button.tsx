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
import { type AccessRule, managedByLine } from "@/lib/permissions";

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
      toast.success("Les droits de cette page ont été enregistrés.");
    });
  }

  const managedBy = rights ? managedByLine(rights.ownerName) : null;

  return (
    <Dialog open={open} onOpenChange={openWith}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Droits de cette page</DialogTitle>
          {managedBy && <DialogDescription>{managedBy}</DialogDescription>}
        </DialogHeader>

        {!rights ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="grid gap-5">
            <Field
              id="page-read-acl"
              spec={{ type: "acl", label: "Qui peut voir cette page ?" }}
              value={read as never}
              environment={{ directory: rights.directory }}
              onChange={(value) => setRead(value as unknown as AccessRule)}
            />
            <Field
              id="page-write-acl"
              spec={{ type: "acl", label: "Qui peut la modifier ?" }}
              value={write as never}
              environment={{ directory: rights.directory }}
              onChange={(value) => setWrite(value as unknown as AccessRule)}
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
