"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { loadComponentBuilders } from "@/lib/component-descriptors";
import { deleteFile } from "@/lib/files";
import { restoredEntryValues } from "@/lib/entry-title";
import {
  type FormDescriptor,
  parseFormDescriptor,
  readEntryData,
} from "@/lib/form-descriptor";
import { Prisma } from "@/lib/generated/prisma/client";
import { listWikiComponentNames } from "@/lib/mdx";
import { type PageWarning, lintPageSource } from "@/lib/page-lint";
import {
  personPermissions,
  countPageSlugReferences,
  deletePageById,
  getPage,
  getRevisionToRestore,
  hasForm,
  isRefused,
  listAllPageSlugs,
  renamePageSlug,
  writePageContent,
  writeRestoredRevision,
} from "@/lib/pages";
import {
  ACCESS_DENIED,
  ADDRESS_REFUSED,
  refusalMessage,
} from "@/lib/permissions";
import { isValidSlug, reservedSlugRefusal } from "@/lib/slug";
import { type SlugRename, pageReferenceProps } from "@/lib/slug-rename";
import type { SlugReferenceImpact } from "@/lib/slug-rename-db";
import { specialSlugs, wikiConfig } from "@/wiki.config";

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
  const page = await getPage(slug);
  if (!page) {
    return { error: "Cette page n'existe pas." };
  }
  // Read from the same ladder the bar draws itself from, and read here rather
  // than from the catch below — which speaks for the rename's own failure, a
  // unique-constraint race on the new slug. It comes before the clash test
  // too, that being the one answer which says something about another page.
  if (!(await personPermissions(page)).address) {
    return { error: ADDRESS_REFUSED };
  }
  if (await getPage(newSlug)) {
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
  const page = await getPage(slug);
  if (!page) {
    return { error: "Cette page n'existe pas." };
  }

  // The bar leaves the action out for anyone but the owner and the
  // administrators, so reaching this means the page changed hands — or a
  // direct call — and the refusal belongs in a toast, not on the error
  // boundary.
  try {
    await deletePageById(page.id);
  } catch (error) {
    return { error: refusalMessage(error) };
  }

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
): {
  data: Prisma.InputJsonValue | undefined;
  titleKept: boolean;
  descriptor: FormDescriptor | null;
} {
  if (data === null) {
    return { data: undefined, titleKept: false, descriptor: null }; // MDX page
  }
  const descriptor = schema ? parseFormDescriptor(schema).descriptor ?? null : null;
  if (!descriptor) {
    return {
      data: data as Prisma.InputJsonValue,
      titleKept: false,
      descriptor: null,
    };
  }
  const restored = restoredEntryValues(descriptor, readEntryData(data));
  return {
    data: restored.values as Prisma.InputJsonValue,
    titleKept: restored.titleKept,
    descriptor,
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
  const source = await getRevisionToRestore(revisionId);
  if (!source) {
    return { error: "Révision introuvable." };
  }
  if (isRefused(source)) {
    return { error: ACCESS_DENIED };
  }

  const restored = restoredEntryData(
    hasForm(source.page) ? source.page.form.schema : undefined,
    source.data
  );
  // Restoring is a write (docs/permissions.md § Quel droit commande quelle
  // action): the history stays readable to whoever may read the page, and the
  // button that puts a revision back is offered to whoever may write it.
  try {
    await writeRestoredRevision({
      pageId: source.pageId,
      content: source.content,
      data: restored.data ?? undefined,
      restoredFromId: source.id,
      descriptor: restored.descriptor,
    });
  } catch (error) {
    return { error: refusalMessage(error) };
  }

  revalidatePath("/", "layout");
  return { slug: source.page.slug, titleKept: restored.titleKept };
}
