"use client";

import { Signpost, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type SlugRenameImpact, countSlugReferences, renamePage } from "@/app/actions";
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
import { Label } from "@/components/ui/label";
import { isValidSlug } from "@/lib/slug";

// « Changer l'adresse » (ADR 0016): the admin gesture that renames a slug.
// The dialog announces the retcon's headcount before asking for confirmation,
// and spells out that the old address dies (no redirect is kept).
export function RenamePageButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [impact, setImpact] = useState<SlugRenameImpact>();
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setNewSlug("");
      setImpact(undefined);
      countSlugReferences(slug).then(setImpact);
    }
  }

  const ready = isValidSlug(newSlug) && newSlug !== slug;

  function confirm() {
    startTransition(async () => {
      const result = await renamePage(slug, newSlug);
      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Signpost />
          Changer l&apos;adresse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Changer l&apos;adresse de la page</DialogTitle>
          <DialogDescription>
            Adresse actuelle : <span className="font-mono">{slug}</span>
          </DialogDescription>
        </DialogHeader>
        <form
          id="rename-page"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !isPending) confirm();
          }}
        >
          <Label htmlFor="new-slug" className="mb-2">
            Nouvelle adresse
          </Label>
          <Input
            id="new-slug"
            value={newSlug}
            autoFocus
            placeholder={slug}
            onChange={(event) =>
              setNewSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"))
            }
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Minuscules, chiffres et tirets.
          </p>
        </form>
        <p className="text-sm">{impactSentence(impact)}</p>
        <p className="flex gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            L&apos;ancienne adresse ne fonctionnera plus : favoris et liens
            externes vers <span className="font-mono">/{slug}</span> seront
            cassés.
          </span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            type="submit"
            form="rename-page"
            disabled={!ready || isPending}
          >
            Changer l&apos;adresse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function impactSentence(impact: SlugRenameImpact | undefined): string {
  if (!impact) return "Recherche des liens vers cette adresse…";
  const total = impact.pages + impact.entries + impact.forms;
  if (total === 0) {
    return "Rien ne pointe vers cette adresse dans le wiki.";
  }
  const parts = [
    count(impact.pages, "page"),
    count(impact.entries, "fiche"),
    count(impact.forms, "formulaire"),
  ].filter((part): part is string => part !== null);
  const sentence = new Intl.ListFormat("fr").format(parts);
  const verb = total > 1 ? "pointent" : "pointe";
  return `${sentence} ${verb} vers cette adresse : les liens seront mis à jour automatiquement, historique compris.`;
}

function count(total: number, noun: string): string | null {
  if (total === 0) return null;
  return `${total} ${noun}${total > 1 ? "s" : ""}`;
}
