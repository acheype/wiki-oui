import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { wikiConfig } from "@/wiki.config";

// Built-in component (CONTEXT.md): the default content of page-menu-haut is
// just `<Menu />`, so the menu itself stays an editable page.
export async function Menu() {
  const layoutSlugs = new Set<string>(Object.values(wikiConfig.layoutPages));
  const pages = await prisma.page.findMany({
    select: { slug: true },
    orderBy: { slug: "asc" },
  });

  const slugs = pages
    .map((page) => page.slug)
    .filter((slug) => !layoutSlugs.has(slug) && slug !== wikiConfig.homeSlug);

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {[wikiConfig.homeSlug, ...slugs].map((slug) => (
        <Link
          key={slug}
          href={`/${slug}`}
          className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {slug === wikiConfig.homeSlug ? "Accueil" : slug}
        </Link>
      ))}
    </nav>
  );
}
