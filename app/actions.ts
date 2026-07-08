"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isValidSlug } from "@/lib/slug";
import { specialSlugs, wikiConfig } from "@/wiki.config";

// MVP: no auth, everyone is "Anonyme" (see docs/architecture.md).
const AUTHOR = "Anonyme";

export type ActionError = { error: string };

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export async function savePage(input: {
  slug: string;
  content: string;
  tags: string[];
}): Promise<ActionError | void> {
  const { slug, content } = input;
  if (!isValidSlug(slug)) {
    return { error: `Slug invalide : « ${slug} »` };
  }
  const tags = normalizeTags(input.tags);

  await prisma.$transaction(async (tx) => {
    const page =
      (await tx.page.findUnique({ where: { slug } })) ??
      (await tx.page.create({ data: { slug, ownerName: AUTHOR } }));

    const revision = await tx.revision.create({
      data: { pageId: page.id, content, authorName: AUTHOR },
    });
    await tx.page.update({
      where: { id: page.id },
      data: { currentRevisionId: revision.id, tags },
    });
  });

  // Any page can feed the layout (menu, title…), so revalidate the whole tree.
  revalidatePath("/", "layout");
  redirect(`/${slug}`);
}

export async function deletePage(slug: string): Promise<ActionError | void> {
  if (specialSlugs.includes(slug)) {
    return { error: "Les pages spéciales ne peuvent pas être supprimées." };
  }
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) {
    return { error: "Cette page n'existe pas." };
  }

  // Hard delete (ADR 0008): revisions go with the page via onDelete: Cascade.
  await prisma.page.delete({ where: { id: page.id } });

  revalidatePath("/", "layout");
  // Server-action redirects bypass next.config redirects(): aim straight at
  // the home slug instead of "/".
  redirect(`/${wikiConfig.homeSlug}`);
}

export async function restoreRevision(
  revisionId: string
): Promise<ActionError | void> {
  const source = await prisma.revision.findUnique({
    where: { id: revisionId },
    include: { page: true },
  });
  if (!source) {
    return { error: "Révision introuvable." };
  }

  // A restore is a NEW revision labeled with its origin (ADR 0003/0009):
  // history stays append-only, nothing is rewound.
  await prisma.$transaction(async (tx) => {
    const revision = await tx.revision.create({
      data: {
        pageId: source.pageId,
        content: source.content,
        authorName: AUTHOR,
        restoredFromId: source.id,
      },
    });
    await tx.page.update({
      where: { id: source.pageId },
      data: { currentRevisionId: revision.id },
    });
  });

  revalidatePath("/", "layout");
  redirect(`/${source.page.slug}`);
}
