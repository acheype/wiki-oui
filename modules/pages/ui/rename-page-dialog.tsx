"use client";

import { countSlugReferences, renamePage } from "@/modules/pages/content-actions";
import {
  RenameSlugDialog,
  impactParts,
  impactTotal,
} from "@/components/ui/rename-slug-dialog";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";

// « Changer l'adresse » (ADR 0016): the admin action that renames a page slug.
// Mounted open by the action-bar overflow menu (page-actions-menu.tsx), so it
// carries no trigger of its own. On success renamePage redirects to the new
// address itself.
export function RenamePageDialog({
  slug,
  onClose,
}: {
  slug: string;
  onClose: () => void;
}) {
  return (
    <RenameSlugDialog
      open
      onOpenChange={onClose}
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
