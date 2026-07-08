import { History, Pencil } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { specialSlugs } from "@/wiki.config";
import { DeletePageButton } from "./delete-page-button";

export function PageActions({ slug, tags }: { slug: string; tags: string[] }) {
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
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${slug}/edit`}>
            <Pencil />
            Modifier
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/${slug}/revisions`}>
            <History />
            Historique
          </Link>
        </Button>
        {!specialSlugs.includes(slug) && <DeletePageButton slug={slug} />}
      </div>
    </div>
  );
}
