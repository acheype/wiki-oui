import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { wikiConfig } from "@/wiki.config";

// Memoized per request (React cache): a page shown and its generateMetadata
// both read it — one query, not two (see app/(bare)/[slug]/iframe/page.tsx).
export const getPageWithCurrent = cache(async (slug: string) => {
  return prisma.page.findUnique({
    where: { slug },
    include: { current: true },
  });
});

export async function getPageWithRevisions(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    include: {
      revisions: {
        orderBy: { createdAt: "asc" },
        include: { restoredFrom: { select: { id: true, createdAt: true } } },
      },
    },
  });
}

export async function listPageSlugs(): Promise<string[]> {
  const pages = await prisma.page.findMany({
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  return pages.map((page) => page.slug);
}

/** Current MDX content of each layout page, keyed by its role. */
export async function getLayoutContents(): Promise<
  Record<keyof typeof wikiConfig.layoutPages, string>
> {
  const roles = Object.entries(wikiConfig.layoutPages) as [
    keyof typeof wikiConfig.layoutPages,
    string,
  ][];
  const pages = await prisma.page.findMany({
    where: { slug: { in: roles.map(([, slug]) => slug) } },
    include: { current: true },
  });
  const bySlug = new Map(pages.map((page) => [page.slug, page]));

  return Object.fromEntries(
    roles.map(([role, slug]) => [role, bySlug.get(slug)?.current?.content ?? ""])
  ) as Record<keyof typeof wikiConfig.layoutPages, string>;
}
