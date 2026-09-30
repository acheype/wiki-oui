"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadComponentBuilders } from "@/modules/authoring/descriptors";
import { listWikiComponentNames } from "@/modules/authoring/mdx";
import { type PageWarning, lintPageSource } from "@/modules/pages/lint";
import {
  countPageSlugReferences,
  deletePageBySlug,
  addressablePage,
  slugExists,
  listAllPageSlugs,
  pageTitle,
  renamePageSlug,
  writePageContent,
} from "@/modules/pages/content";
import { canWritePage } from "@/modules/pages/access/guards";
import { PageBody } from "@/modules/pages/page-body";
import { restoreArchivedRevision } from "./revisions/restore";
import { refusalMessage } from "@/modules/permissions/rules";
import { isValidSlug, reservedSlugRefusal } from "@/lib/slug";
import { type SlugRename, pageReferenceProps } from "@/lib/slug-rename";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";
import { specialSlugs, wikiConfig } from "@/wiki.config";

export type ActionError = { error: string };
export type SaveResult = ActionError | { unchanged: true } | { saved: true };

/**
 * The modal's content, rendered inline as an RSC payload (ADR 0022): a page's
 * chrome-free body, streamed straight to the single dialog host without the
 * iframe's second document, bundle and hydration. The title is a string,
 * resolved before the return, so the dialog names itself immediately; the body
 * is an *unawaited* element, so React streams it under the host's Suspense
 * boundary. getPageWithCurrent being memoized (cache()), the title read and
 * <PageBody>'s read are one query.
 *
 * A legitimate "use server" pass-through (CLAUDE.md): a client host cannot
 * reach the access layer, and the gates are <PageBody>'s own, unchanged.
 * `canWrite` is that layer's canWritePage guard forwarded — the modal header
 * offers « Modifier » exactly where the page bar would, decided there, not
 * here.
 */
export async function readPageBody(
  slug: string
): Promise<{ title: string | null; canWrite: boolean; body: React.ReactNode }> {
  return {
    title: await pageTitle(slug),
    canWrite: await canWritePage(slug),
    body: <PageBody slug={slug} hideTitle />,
  };
}

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
  const [registry, builders, slugs] = await Promise.all([
    listWikiComponentNames(),
    loadComponentBuilders(),
    listAllPageSlugs(),
  ]);
  const existingSlugs = new Set(slugs);
  // A page may link to itself before its first save.
  if (slug) existingSlugs.add(slug);
  return lintPageSource(content, registry, builders, existingSlugs);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
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
  // A page named after the reserved segment would be written and never open
  // (ADR 0028): the route answers first, whatever the database holds.
  const reserved = reservedSlugRefusal(slug);
  if (reserved) return { error: reserved };
  const tags = normalizeTags(input.tags);

  // The editor refuses long before this, so reaching it means the right went
  // away between opening the page and saving it — a refusal to report, not an
  // error boundary to fall into.
  let result: { unchanged: boolean };
  try {
    result = await writePageContent({ slug, content, tags });
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  if (result.unchanged) return { unchanged: true };

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
  return countPageSlugReferences(slug, referenceProps);
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
  const reserved = reservedSlugRefusal(newSlug);
  if (reserved) return { error: reserved };
  // Read and refused in one call, so that no path reaches the rename with an
  // unchecked page. The refusal is caught here rather than by the try below —
  // which speaks for the rename's own failure, a unique-constraint race on the
  // new slug — and it comes before the clash test, that being the one answer
  // which says something about another page.
  let page: { id: string } | null;
  try {
    page = await addressablePage(slug);
  } catch (error) {
    return { error: refusalMessage(error) };
  }
  if (!page) {
    return { error: "Cette page n'existe pas." };
  }
  if (await slugExists(newSlug)) {
    return { error: `L'adresse «\u00A0${newSlug}\u00A0» est déjà utilisée.` };
  }

  const rename: SlugRename = { oldSlug: slug, newSlug };
  const referenceProps = pageReferenceProps(await loadComponentBuilders());

  try {
    await renamePageSlug(page.id, rename, referenceProps);
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
  // The bar leaves the action out for anyone but the owner and the
  // administrators, so reaching this means the page changed hands — or a
  // direct call — and the refusal belongs in a toast, not on the error
  // boundary.
  try {
    if (!(await deletePageBySlug(slug))) {
      return { error: "Cette page n'existe pas." };
    }
  } catch (error) {
    return { error: refusalMessage(error) };
  }

  revalidatePath("/", "layout");
  // Server-action redirects bypass next.config redirects(): aim straight at
  // the home slug instead of "/".
  redirect(`/${wikiConfig.homeSlug}`);
}

/** The caller owns navigation so the result can explain a kept title. */
export type RestoreResult = ActionError | { slug: string; titleKept: boolean };

export async function restoreRevision(revisionId: string): Promise<RestoreResult> {
  try {
    const result = await restoreArchivedRevision(revisionId);
    if (!("error" in result)) revalidatePath("/", "layout");
    return result;
  } catch (error) {
    return { error: refusalMessage(error) };
  }
}
