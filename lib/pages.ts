import { cache } from "react";
import { type EntryData, readEntryData } from "@/lib/form-descriptor";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { SlugRename } from "@/lib/slug-rename";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";
import { wikiConfig } from "@/wiki.config";

// The only door to `Page` (ADR 0025), alongside lib/forms.ts for `Form`. An
// ESLint rule refuses `prisma.page` anywhere else, so the permission checks
// this layer will host cannot be bypassed by a caller that forgot them — the
// risk being a silent read, which no test would ever catch.

// --- reads ------------------------------------------------------------------

// Memoized per request (React cache): a page shown and its generateMetadata
// both read it — one query, not two (see app/(bare)/[slug]/iframe/page.tsx).
export const getPageWithCurrent = cache(async (slug: string) => {
  return prisma.page.findUnique({
    where: { slug },
    include: { current: true },
  });
});

/** Uncached counterpart of getPageWithCurrent, for the write paths. */
export async function getPage(slug: string) {
  return prisma.page.findUnique({ where: { slug } });
}

/** A page with the form it is an entry of, null form for an MDX page. */
export async function getPageWithForm(slug: string) {
  return prisma.page.findUnique({ where: { slug }, include: { form: true } });
}

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

/** Named pages with their current revision — resolving links to their title. */
export async function listPagesWithCurrent(slugs: string[]) {
  return prisma.page.findMany({
    where: { slug: { in: slugs } },
    include: { current: true },
  });
}

/** The entry pages of one form, or of every form when no slug is given. */
export async function listEntryPages(formSlug?: string) {
  return prisma.page.findMany({
    where: formSlug ? { form: { slug: formSlug } } : { formId: { not: null } },
    include: { form: true, current: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * The rename dialog's headcount (ADR 0016): how many pages, entries and form
 * definitions reference this page slug today. A read of everyone's content,
 * hence a read through the door rather than beside it.
 */
export async function countPageSlugReferences(
  slug: string,
  referenceProps: ReadonlyMap<string, ReadonlySet<string>>
): Promise<SlugReferenceImpact> {
  return countSlugReferenceImpact(prisma, slug, referenceProps, "page");
}

/** The source of a restore, with what tells how to read its snapshot. */
export async function getRevisionToRestore(revisionId: string) {
  return prisma.revision.findUnique({
    where: { id: revisionId },
    include: { page: { include: { form: true } } },
  });
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

// --- writes -----------------------------------------------------------------

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/**
 * Minting a revision and moving the page's current pointer onto it is one act
 * (ADR 0003): the history is append-only and the pointer names its head, so
 * the two writes always travel together, inside the caller's transaction.
 * `pageData` rides along for the columns a caller writes in the same breath.
 */
async function mintRevision(
  tx: Prisma.TransactionClient,
  revision: Prisma.RevisionUncheckedCreateInput,
  pageData: Prisma.PageUncheckedUpdateInput = {}
): Promise<void> {
  const minted = await tx.revision.create({ data: revision });
  await tx.page.update({
    where: { id: revision.pageId },
    data: { ...pageData, currentRevisionId: minted.id },
  });
}

/**
 * Saves the MDX source of a page, creating it on first save. Saving identical
 * content must not grow the history (revisions are the content's history, ADR
 * 0003), and a tags-only change updates the page without minting a revision —
 * tags live outside revisions (ADR 0007). `unchanged` says nothing at all
 * moved, the one case the editor reports back to the author.
 */
export async function writePageContent(input: {
  slug: string;
  content: string;
  tags: string[];
  authorName: string;
}): Promise<{ unchanged: boolean }> {
  const { slug, content, tags, authorName } = input;
  const existing = await prisma.page.findUnique({
    where: { slug },
    include: { current: true },
  });

  if (existing && existing.current?.content === content) {
    if (sameTags(existing.tags, tags)) {
      return { unchanged: true };
    }
    await prisma.page.update({ where: { id: existing.id }, data: { tags } });
    return { unchanged: false };
  }

  await prisma.$transaction(async (tx) => {
    const page =
      existing ??
      (await tx.page.create({ data: { slug, ownerName: authorName } }));

    await mintRevision(tx, { pageId: page.id, content, authorName }, { tags });
  });
  return { unchanged: false };
}

/**
 * « Changer l'adresse » (ADR 0016): flips Page.slug and retcons every
 * reference in the same transaction, so the wiki never observes a state where
 * the page answers to the new slug but references still say the old. Throws on
 * failure — most likely a unique-constraint race on the new slug.
 */
export async function renamePageSlug(
  pageId: string,
  rename: SlugRename,
  referenceProps: ReadonlyMap<string, ReadonlySet<string>>
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.page.update({
        where: { id: pageId },
        data: { slug: rename.newSlug },
      });
      await sweepSlugReferences(tx, rename, referenceProps, "page");
    },
    // A large wiki means many rewrites in one sweep; the default 5s is for
    // hot-path transactions, this is a rare cold admin action.
    { timeout: 60_000 }
  );
}

// Hard delete (ADR 0008): revisions go with the page via onDelete: Cascade.
export async function deletePageById(id: string): Promise<void> {
  await prisma.page.delete({ where: { id } });
}

/** An entry's first save (ADR 0014): the page, its snapshot, and the link. */
export async function createEntryPage(input: {
  slug: string;
  formId: string;
  data: EntryData;
  tags: string[];
  authorName: string;
}): Promise<void> {
  const { slug, formId, data, tags, authorName } = input;
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: { slug, ownerName: authorName, formId, tags },
    });
    await mintRevision(tx, {
      pageId: page.id,
      data: data as Prisma.InputJsonValue,
      authorName,
    });
  });
}

/**
 * A new snapshot for an existing entry, unless the data is unchanged
 * (revisions are the content's history, ADR 0003). Tags live on the Page and
 * update without a revision (ADR 0007).
 */
export async function writeEntryRevision(input: {
  pageId: string;
  data: EntryData;
  tags: string[];
  authorName: string;
}): Promise<void> {
  const { pageId, data, tags, authorName } = input;
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { current: true },
  });
  const unchanged =
    JSON.stringify(readEntryData(page.current?.data)) === JSON.stringify(data);
  await prisma.$transaction(async (tx) => {
    await tx.page.update({ where: { id: pageId }, data: { tags } });
    if (unchanged) return;
    await mintRevision(tx, {
      pageId,
      data: data as Prisma.InputJsonValue,
      authorName,
    });
  });
}

/**
 * A restore is a NEW revision labeled with its origin (ADR 0003/0009):
 * history stays append-only, nothing is rewound. Both snapshot columns are
 * carried over, which preserves the content-xor-data invariant (ADR 0014) for
 * MDX pages and entries alike.
 */
export async function writeRestoredRevision(input: {
  pageId: string;
  content: string | null;
  data: Prisma.InputJsonValue | undefined;
  authorName: string;
  restoredFromId: string;
}): Promise<void> {
  const { pageId, content, data, authorName, restoredFromId } = input;
  await prisma.$transaction(async (tx) => {
    await mintRevision(tx, {
      pageId,
      content,
      data,
      authorName,
      restoredFromId,
    });
  });
}
