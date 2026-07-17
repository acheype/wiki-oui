"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadComponentBuilders } from "@/lib/component-descriptors";
import { deleteFile } from "@/lib/files";
import { listWikiComponentNames } from "@/lib/mdx";
import {
  type EntryData,
  parseFormDescriptor,
} from "@/lib/form-descriptor";
import { type PageWarning, lintPageSource } from "@/lib/page-lint";
import { prisma } from "@/lib/prisma";
import { isValidSlug } from "@/lib/slug";
import {
  type SlugRename,
  pageReferenceProps,
  rewriteEntryDataSlugs,
  rewriteFormDescriptorSlugs,
  rewriteSlugReferences,
} from "@/lib/slug-rename";
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
export async function lintPage(content: string): Promise<PageWarning[]> {
  const [registry, builders] = await Promise.all([
    listWikiComponentNames(),
    loadComponentBuilders(),
  ]);
  return lintPageSource(content, registry, builders);
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
    return { error: `Slug invalide : « ${slug} »` };
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

export interface SlugRenameImpact {
  pages: number;
  entries: number;
  forms: number;
}

// One revision or form row that may reference a slug (LIKE prefilter only —
// the rewrite engine gives the precise answer on each candidate).
type CandidateRevision = {
  id: string;
  content: string | null;
  data: unknown;
  formId: string | null;
};

type CandidateForm = { id: string; template: string | null; schema: unknown };

// A same-slug rename touches every reference and nothing else: the engine
// returning non-null IS the "this source references the slug" answer.
function referenceProbe(slug: string): SlugRename {
  return { oldSlug: slug, newSlug: slug };
}

function parsedDescriptors(forms: { id: string; schema: unknown }[]) {
  const descriptors = new Map<
    string,
    NonNullable<ReturnType<typeof parseFormDescriptor>["descriptor"]>
  >();
  for (const form of forms) {
    const parsed = parseFormDescriptor(form.schema);
    if (parsed.descriptor) descriptors.set(form.id, parsed.descriptor);
  }
  return descriptors;
}

/**
 * The rename dialog's headcount (ADR 0016): how many pages, entries and form
 * definitions reference this slug today. Counts current revisions only — the
 * rename itself sweeps all of history, but the numbers an admin reasons about
 * are the live ones. The page's own self-references are not counted.
 */
export async function countSlugReferences(
  slug: string
): Promise<SlugRenameImpact> {
  const probe = referenceProbe(slug);
  const referenceProps = pageReferenceProps(await loadComponentBuilders());
  const like = `%${slug}%`;

  const [rows, formRows] = await Promise.all([
    prisma.$queryRaw<CandidateRevision[]>`
      SELECT r."id", r."content", r."data", p."formId"
      FROM "Page" p JOIN "Revision" r ON r."id" = p."currentRevisionId"
      WHERE p."slug" <> ${slug}
        AND (r."content" LIKE ${like} OR r."data"::text LIKE ${like})`,
    prisma.$queryRaw<CandidateForm[]>`
      SELECT "id", "template", "schema" FROM "Form"
      WHERE "template" LIKE ${like} OR "schema"::text LIKE ${like}`,
  ]);

  const descriptors = parsedDescriptors(
    await prisma.form.findMany({
      where: { id: { in: rows.flatMap((row) => row.formId ?? []) } },
      select: { id: true, schema: true },
    })
  );

  const impact: SlugRenameImpact = { pages: 0, entries: 0, forms: 0 };
  for (const row of rows) {
    if (row.content !== null) {
      if (rewriteSlugReferences(row.content, probe, referenceProps) !== null) {
        impact.pages += 1;
      }
      continue;
    }
    const descriptor = row.formId ? descriptors.get(row.formId) : undefined;
    if (
      descriptor &&
      rewriteEntryDataSlugs(
        descriptor,
        row.data as EntryData,
        probe,
        referenceProps
      ) !== null
    ) {
      impact.entries += 1;
    }
  }
  for (const form of formRows) {
    const parsed = parseFormDescriptor(form.schema);
    const inTemplate =
      form.template !== null &&
      rewriteSlugReferences(form.template, probe, referenceProps) !== null;
    const inSchema =
      parsed.descriptor !== undefined &&
      rewriteFormDescriptorSlugs(parsed.descriptor, probe, referenceProps) !==
        null;
    if (inTemplate || inSchema) impact.forms += 1;
  }
  return impact;
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
    return { error: `Adresse invalide : « ${newSlug} »` };
  }
  if (newSlug === slug) {
    return { error: "La nouvelle adresse est identique à l'actuelle." };
  }
  const page = await prisma.page.findUnique({ where: { slug } });
  if (!page) {
    return { error: "Cette page n'existe pas." };
  }
  if (await prisma.page.findUnique({ where: { slug: newSlug } })) {
    return { error: `L'adresse « ${newSlug} » est déjà utilisée.` };
  }

  const rename: SlugRename = { oldSlug: slug, newSlug };
  const referenceProps = pageReferenceProps(await loadComponentBuilders());
  const like = `%${slug}%`;

  try {
    // One transaction for the whole retcon: the wiki never observes a state
    // where the page answers to the new slug but references still say the old.
    await prisma.$transaction(
      async (tx) => {
        await tx.page.update({
          where: { id: page.id },
          data: { slug: newSlug },
        });

        const revisions = await tx.$queryRaw<CandidateRevision[]>`
          SELECT r."id", r."content", r."data", p."formId"
          FROM "Revision" r JOIN "Page" p ON p."id" = r."pageId"
          WHERE r."content" LIKE ${like} OR r."data"::text LIKE ${like}`;
        const descriptors = parsedDescriptors(
          await tx.form.findMany({
            where: {
              id: { in: revisions.flatMap((row) => row.formId ?? []) },
            },
            select: { id: true, schema: true },
          })
        );

        for (const revision of revisions) {
          if (revision.content !== null) {
            const content = rewriteSlugReferences(
              revision.content,
              rename,
              referenceProps
            );
            if (content !== null) {
              await tx.revision.update({
                where: { id: revision.id },
                data: { content },
              });
            }
            continue;
          }
          const descriptor = revision.formId
            ? descriptors.get(revision.formId)
            : undefined;
          if (!descriptor) continue;
          const data = rewriteEntryDataSlugs(
            descriptor,
            revision.data as EntryData,
            rename,
            referenceProps
          );
          if (data !== null) {
            await tx.revision.update({
              where: { id: revision.id },
              data: { data: data as object },
            });
          }
        }

        const forms = await tx.$queryRaw<CandidateForm[]>`
          SELECT "id", "template", "schema" FROM "Form"
          WHERE "template" LIKE ${like} OR "schema"::text LIKE ${like}`;
        for (const form of forms) {
          const template =
            form.template !== null
              ? rewriteSlugReferences(form.template, rename, referenceProps)
              : null;
          const parsed = parseFormDescriptor(form.schema);
          const schema = parsed.descriptor
            ? rewriteFormDescriptorSlugs(
                parsed.descriptor,
                rename,
                referenceProps
              )
            : null;
          if (template !== null || schema !== null) {
            await tx.form.update({
              where: { id: form.id },
              data: {
                ...(template !== null && { template }),
                ...(schema !== null && { schema: schema as object }),
              },
            });
          }
        }
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
  // history stays append-only, nothing is rewound. Copying both snapshot
  // columns preserves the content-xor-data invariant (ADR 0014) for MDX
  // pages and entries alike.
  await prisma.$transaction(async (tx) => {
    const revision = await tx.revision.create({
      data: {
        pageId: source.pageId,
        content: source.content,
        data: source.data ?? undefined,
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
