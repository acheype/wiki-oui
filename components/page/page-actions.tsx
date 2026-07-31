import { History, Pencil, Shield } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { specialSlugs } from "@/wiki.config";
import { DeletePageButton } from "./delete-page-button";
import { PageRightsButton } from "./page-rights-button";
import { RenamePageButton } from "./rename-page-button";

// What is not on offer is absent, never greyed out (docs/permissions.md § Ce
// que voit qui n'a pas le droit): an offer that cannot be taken up informs
// nobody, and a disabled button invites a click that will never work.
export function PageActions({
  slug,
  tags,
  writable,
  owns,
}: {
  slug: string;
  tags: string[];
  writable: boolean;
  /** The owner and the administrators: they alone pose the rights. */
  owns: boolean;
}) {
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
        {writable && (
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
            rather than a /{slug}/droits handler (docs/permissions.md). */}
        {owns && (
          <PageRightsButton slug={slug}>
            <Shield />
            Droits
          </PageRightsButton>
        )}
        {!specialSlugs.includes(slug) && (
          <>
            <RenamePageButton slug={slug} />
            <DeletePageButton slug={slug} />
          </>
        )}
      </div>
    </div>
  );
}
