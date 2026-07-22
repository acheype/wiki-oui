"use client";

import { Signpost } from "lucide-react";
import { countSlugReferences, renamePage } from "@/app/actions";
import {
  RenameSlugDialog,
  impactParts,
  impactTotal,
} from "@/components/slug/rename-slug-dialog";
import { Button } from "@/components/ui/button";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";

// « Changer l'adresse » (ADR 0016): the admin gesture that renames a page
// slug. On success renamePage redirects to the new address itself.
export function RenamePageButton({ slug }: { slug: string }) {
  return (
    <RenameSlugDialog
      trigger={
        <Button variant="ghost" size="sm">
          <Signpost />
          Changer l&apos;adresse
        </Button>
      }
      title="Changer l'adresse de la page"
      currentLabel="Adresse actuelle"
      current={slug}
      inputLabel="Nouvelle adresse"
      confirmLabel="Changer l'adresse"
      searchingText="Recherche des liens vers cette adresse…"
      impactSentence={impactSentence}
      warning={
        <>
          L&apos;ancienne adresse ne fonctionnera plus : favoris et liens
          externes vers <span className="font-mono">/{slug}</span> seront
          cassés.
        </>
      }
      fetchImpact={() => countSlugReferences(slug)}
      rename={(newSlug) => renamePage(slug, newSlug)}
    />
  );
}

function impactSentence(impact: SlugReferenceImpact): string {
  const parts = impactParts(impact);
  if (parts === null) {
    return "Rien ne pointe vers cette adresse dans le wiki.";
  }
  const verb = impactTotal(impact) > 1 ? "pointent" : "pointe";
  return `${parts} ${verb} vers cette adresse : les liens seront mis à jour automatiquement, historique compris.`;
}
