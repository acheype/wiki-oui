import { History, Pencil, UsersRound } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PageGestures } from "@/lib/permissions";
import { specialSlugs } from "@/wiki.config";
import { DeletePageButton } from "./delete-page-button";
import { PageRightsButton } from "./page-rights-button";
import { RenamePageButton } from "./rename-page-button";

// What is not on offer is absent, never greyed out (docs/permissions.md § Ce
// que voit qui n'a pas le droit): an offer that cannot be taken up informs
// nobody, and a disabled button invites a click that will never work.
//
// The three rungs of the ladder come decided (lib/permissions.ts): the bar
// reads which gestures are open, never who is looking at it.
export function PageActions({
  slug,
  tags,
  gestures,
}: {
  slug: string;
  tags: string[];
  gestures: PageGestures;
}) {
  // A special page keeps its address and its existence whoever is looking:
  // « non supprimable, non renommable, mais éditable » (CONTEXT.md).
  const special = specialSlugs.includes(slug);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b pb-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {gestures.write && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${slug}/edit`}>
              <Pencil />
              Modifier
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${slug}/revisions`}>
            <History />
            Historique
          </Link>
        </Button>
        {/* Posing the rights is a mutation, so it opens a modal from here
            rather than a /{slug}/droits handler (docs/permissions.md). It is
            called « Accès » because that is what the reader is after — who
            gets in — where « Droits » names the machinery. Handing the page
            over is in there too: same rung, and the modal names the owner. */}
        {gestures.structuring && (
          <PageRightsButton slug={slug}>
            <UsersRound />
            Accès
          </PageRightsButton>
        )}
        {!special && (
          <>
            {gestures.address && <RenamePageButton slug={slug} />}
            {gestures.structuring && <DeletePageButton slug={slug} />}
          </>
        )}
      </div>
    </div>
  );
}
