import { prisma } from "@/lib/prisma";
import { wikiConfig } from "@/wiki.config";

export async function getPageWithCurrent(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    include: { current: true },
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
