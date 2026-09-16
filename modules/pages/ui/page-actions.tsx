import { History, Pencil } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { PagePermissions } from "@/modules/permissions/rules";
import { specialSlugs } from "@/wiki.config";
import { PageActionsMenu } from "./page-actions-menu";

// What is not on offer is absent, never greyed out (docs/permissions.md § Ce
// que voit qui n'a pas le droit): an offer that cannot be taken up informs
// nobody, and a disabled button invites a click that will never work.
//
// The bar foregrounds the two actions taken often — Modifier (the daily one)
// and Historique — and folds the rare, structuring ones behind « ⋯ »
// (page-actions-menu.tsx). The three rungs of the ladder come decided
// (modules/permissions/rules.ts): the bar reads which permissions are open,
// never who is looking at it.
export function PageActions({
  slug,
  tags,
  permissions,
}: {
  slug: string;
  tags: string[];
  permissions: PagePermissions;
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
        {permissions.write && (
          <Link
            href={`/${slug}/edit`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Pencil />
            Modifier
          </Link>
        )}
        <Link
          href={`/${slug}/revisions`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <History />
          Historique
        </Link>
        <PageActionsMenu
          slug={slug}
          special={special}
          permissions={permissions}
        />
      </div>
    </div>
  );
}
