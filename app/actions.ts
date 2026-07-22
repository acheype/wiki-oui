"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadComponentBuilders } from "@/lib/component-descriptors";
import { deleteFile } from "@/lib/files";
import { restoredEntryValues } from "@/lib/entry-title";
import { parseFormDescriptor, readEntryData } from "@/lib/form-descriptor";
import { Prisma } from "@/lib/generated/prisma/client";
import { listWikiComponentNames } from "@/lib/mdx";
import { type PageWarning, lintPageSource } from "@/lib/page-lint";
import { prisma } from "@/lib/prisma";
import { isValidSlug } from "@/lib/slug";
import { type SlugRename, pageReferenceProps } from "@/lib/slug-rename";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";
import { specialSlugs, wikiConfig } from "@/wiki.config";

// MVP: no auth, everyone is "Anonyme" (see docs/architecture.md).
const AUTHOR = "Anonyme";

export type ActionError = { error: string };
export type SaveResult = ActionError | { unchanged: true } | { saved: true };

/**
 * What the render will silently ignore in this source (ADR 0002). Separate
 * from savePage on purpose: the editor asks *before* saving, so the author
 * can still fix it — and still gets the answer when nothing changed, the one
 * case a save-time report would stay mute about.
 */
export async function lintPage(
  content: string,
  slug?: string
): Promise<PageWarning[]> {
  const [registry, builders, pages] = await Promise.all([
    listWikiComponentNames(),
    loadComponentBuilders(),
    prisma.page.findMany({ select: { slug: true } }),
  ]);
  const existingSlugs = new Set(pages.map((page) => page.slug));
  // A page may link to itself before its first save.
  if (slug) existingSlugs.add(slug);
  return lintPageSource(content, registry, builders, existingSlugs);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

export async function savePage(input: {
  slug: string;
  content: string;
  tags: string[];
}): Promise<SaveResult> {
  const { slug, content } = input;
  if (!isValidSlug(slug)) {
    return { error: `Slug invalide : «\u00A0${slug}\u00A0»` };
  }
  const tags = normalizeTags(input.tags);

  const existing = await prisma.page.findUnique({
    where: { slug },
    include: { current: true },
  });

  // Saving identical content must not grow the history (revisions are the
  // content's history, ADR 0003). Nothing changed at all: tell the caller.
  // Tags-only change: update the page — tags live outside revisions
  // (ADR 0007), so none is minted.
  if (existing && existing.current?.content === content) {
    if (sameTags(existing.tags, tags)) {
      return { unchanged: true };
    }
    await prisma.page.update({ where: { id: existing.id }, data: { tags } });
  } else {
    await prisma.$transaction(async (tx) => {
      const page =
        existing ?? (await tx.page.create({ data: { slug, ownerName: AUTHOR } }));

      const revision = await tx.revision.create({
        data: { pageId: page.id, content, authorName: AUTHOR },
      });
      await tx.page.update({
        where: { id: page.id },
        data: { currentRevisionId: revision.id, tags },
      });
    });
  }

  // Any page can feed the layout (menu, title…), so revalidate the whole tree.
  revalidatePath("/", "layout");
  // Returning rather than redirecting: the editor owns the navigation, so it
  // can speak (a toast, the warnings panel) before leaving the page.
  return { saved: true };
}

/**
 * The rename dialog's headcount (ADR 0016): how many pages, entries and form
 * definitions reference this page slug today.
 */
export async function countSlugReferences(
  slug: string
): Promise<SlugReferenceImpact> {
  const referenceProps = pageReferenceProps(await loadComponentBuilders());
  return countSlugReferenceImpact(prisma, slug, referenceProps, "page");
}

/**
 * « Changer l'adresse » (ADR 0016): renames the page's slug and retcons every
 * reference in place — all revisions of all pages and entries (history
 * included, no revision minted, like tags) plus form templates and the MDX of
 * customContent fields. No redirect is kept: the old address stops existing.
 */
export async function renamePage(
  slug: string,
  newSlug: string
): Promise<ActionError | void> {
  if (specialSlugs.includes(slug)) {
    return { error: "L'adresse d'une page spéciale ne peut pas être changée." };
  }
  if (!isValidSlug(newSlug)) {
    return { error: `Adresse invalide : «\u00A0${newSlug}\u00A0»` };
  }
  if (newSlug === slug) {
    return { error: "La nouvelle adresse est identique à l'actuelle." };
  }
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) {
    return { error: "Cette page n'existe pas." };
  }
  if (await prisma.page.findUnique({ where: { slug: newSlug } })) {
    return { error: `L'adresse «\u00A0${newSlug}\u00A0» est déjà utilisée.` };
  }

  const rename: SlugRename = { oldSlug: slug, newSlug };
  const referenceProps = pageReferenceProps(await loadComponentBuilders());

  try {
    // One transaction for the whole retcon: the wiki never observes a state
    // where the page answers to the new slug but references still say the old.
    await prisma.$transaction(
      async (tx) => {
        await tx.page.update({
          where: { id: page.id },
          data: { slug: newSlug },
        });
        await sweepSlugReferences(tx, rename, referenceProps, "page");
      },
      // A large wiki means many rewrites in one sweep; the default 5s is for
      // hot-path transactions, this is a rare cold admin action.
      { timeout: 60_000 }
    );
  } catch {
    // Most likely a unique-constraint race on the new slug.
    return {
      error: "Le changement d'adresse a échoué. Réessayez dans un instant.",
    };
  }

  revalidatePath("/", "layout");
  redirect(`/${newSlug}`);
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

// Only door that removes an uploaded file: cancelling the component modal
// right after the upload that created it (« annuler = rien ne s'est passé »,
// ADR 0012). A mutation, hence a Server Action — the API-service exception
// covers the upload only (progress needs the request, the deletion doesn't).
export async function discardUploadedFile(name: string): Promise<void> {
  await deleteFile(name).catch(() => null); // already gone = fine
}

/**
 * The values a restore writes. The restored revision becomes the *current*
 * state, so it follows the form's *current* definition (ADR 0020): an
 * automatic title is recomputed rather than copied back. A computation that
 * comes out empty keeps the archived title — the same conservative skip the
 * form-save sweep applies, and the one that keeps a restore from ever being
 * blocked by a stale entry.
 */
// Prisma-side wrapper around restoredEntryValues (lib/entry-title): the JSON
// casting and the MDX-page case, where there are no entry values at all.
function restoredEntryData(
  schema: unknown,
  data: Prisma.JsonValue | null
): { data: Prisma.InputJsonValue | undefined; titleKept: boolean } {
  if (data === null) return { data: undefined, titleKept: false }; // MDX page
  const descriptor = schema ? parseFormDescriptor(schema).descriptor : null;
  if (!descriptor) {
    return { data: data as Prisma.InputJsonValue, titleKept: false };
  }
  const restored = restoredEntryValues(descriptor, readEntryData(data));
  return {
    data: restored.values as Prisma.InputJsonValue,
    titleKept: restored.titleKept,
  };
}

/**
 * Success carries information now (ADR 0020), so this action returns instead
 * of redirecting: `redirect()` throws, leaving the success path no channel to
 * report on. The caller owns the navigation — same landing page as before.
 */
export type RestoreResult =
  | ActionError
  | { slug: string; titleKept: boolean };

export async function restoreRevision(
  revisionId: string
): Promise<RestoreResult> {
  const source = await prisma.revision.findUnique({
    where: { id: revisionId },
    include: { page: { include: { form: true } } },
  });
  if (!source) {
    return { error: "Révision introuvable." };
  }

  // A restore is a NEW revision labeled with its origin (ADR 0003/0009):
  // history stays append-only, nothing is rewound. Copying both snapshot
  // columns preserves the content-xor-data invariant (ADR 0014) for MDX
  // pages and entries alike.
  const restored = restoredEntryData(source.page.form?.schema, source.data);
  await prisma.$transaction(async (tx) => {
    const revision = await tx.revision.create({
      data: {
        pageId: source.pageId,
        content: source.content,
        data: restored.data ?? undefined,
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
  return { slug: source.page.slug, titleKept: restored.titleKept };
}
