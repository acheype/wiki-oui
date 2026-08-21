import { cache } from "react";
import { hasForm } from "@/modules/pages/entry-page";
import { readableForm } from "@/modules/permissions/readable-form";
import { type EntryData, orderedEntryData } from "@/modules/forms/form-descriptor";
import {
  type AccessRule,
  DELETE_REFUSED,
  canRead,
  pageRule,
} from "@/modules/permissions/rules";
import { currentPerson, currentUsername } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { isExternalHref, wikiHrefSlug } from "@/lib/slug";
import { rankByFrequency } from "@/modules/forms/suggested-values";
import type { SlugRename } from "@/lib/slug-rename";
import { displayName } from "@/modules/accounts/username";
import {
  type SlugReferenceImpact,
  countSlugReferenceImpact,
  sweepSlugReferences,
} from "@/lib/slug-rename-db";
import { wikiConfig } from "@/wiki.config";
import {
  ALWAYS_READABLE,
  assertAddress,
  assertCanCreatePage,
  assertCanWrite,
  assertStructuring,
  bornWithDefaultRights,
  ifReadable,
  mintRevision,
} from "@/modules/pages/queries/queries";
import {
  ACL_ROWS,
  type AccessRefusal,
  COLD_ADMIN_TRANSACTION_TIMEOUT_MS,
  PUBLIC_IDENTITY,
  WITH_RIGHTS,
  currentReadableWhere,
  isRefused,
} from "@/modules/pages/rights";

// The reads and the plain writes of a page — everything short of its rights
// (modules/pages/rights.ts), its revisions (modules/pages/revisions.ts) and a
// fiche's own life cycle (modules/pages/entries.ts). Part of ADR 0025's door:
// the ESLint rule that keeps `prisma.page` out of every other file applies
// here exactly as it did to lib/pages.ts before the split.

// --- reads ------------------------------------------------------------------

// Memoized per request (React cache): a page shown and its generateMetadata
// both read it — one query, not two (see app/(bare)/[slug]/iframe/page.tsx).
export const getPageWithCurrent = cache(async (slug: string) => {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: { current: true, ...WITH_RIGHTS },
  });
  return page && ifReadable(page);
});

/**
 * Uncached counterpart of getPageWithCurrent, for the write paths — which
 * hand what they read straight to assertCanWrite, so it carries the rights.
 * Also the existence probe a slug clash asks: a page one cannot read is still
 * a page whose address is taken, and hiding that would let someone write over
 * what they cannot see.
 */
export async function getPage(slug: string) {
  return prisma.page.findUnique({ where: { slug }, include: WITH_RIGHTS });
}

/**
 * A page with the form it is an entry of, null form for an MDX page. The
 * current revision's author rides along for `/{slug}/raw`'s `last-edited-by`
 * — the only reader of it, the other caller (the edit screen) ignoring it.
 */
export async function getPageWithForm(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      form: true,
      current: { include: { author: PUBLIC_IDENTITY } },
      ...WITH_RIGHTS,
    },
  });
  return page && ifReadable(page);
}

/** The six fields `/{slug}/raw` (docs/permissions.md) always ends on. */
interface RawMetadata {
  "created-at": Date;
  owner: string;
  "last-edited-at": Date;
  "last-edited-by": string;
  "read-scope": AccessRule;
  "write-scope": AccessRule;
}

/** A fiche's metadata additionally carries the form it was born from. */
interface EntryRawMetadata extends RawMetadata {
  "form-id": string;
}

/**
 * What `/{slug}/raw` (docs/permissions.md) hands the route to serve — a
 * discriminated union, not a bag of unknown keys: the route dispatches on
 * `kind`, set once here from hasForm() rather than probing the shape (a
 * `content` key, a field's own `typeof`) the way an earlier version of this
 * handler did. `fields` stays internal to this module; the route flattens it
 * back into the wire shape `/{slug}/raw` actually serves (docs/permissions.md
 * § /{slug}/raw).
 */
export type RawContent =
  | { kind: "page"; content: string; metadata: RawMetadata }
  | { kind: "entry"; fields: EntryData; metadata: EntryRawMetadata };

/**
 * The content and metadata of a page, in the shape `/{slug}/raw` serves them
 * (docs/permissions.md § /{slug}/raw, the equivalent of YesWiki's `/raw`).
 * Born *inside* this door rather than beside it (ADR 0025) — a bare route
 * reading Prisma on its own is exactly the shortcut the door exists to close.
 *
 * An MDX page hands back `content` plus `metadata`. A fiche hands back its
 * field values in the form's own order — `title` wherever the form's own
 * author placed it, never forced to the front — then `metadata`, itself
 * carrying `form-id` first: a fiche's own field could be named `form-id`
 * without colliding with it, since the two live in different objects.
 * `metadata` is the one name a field still cannot carry (formAuthoringIssues,
 * modules/forms/form-descriptor.ts refuses the form at save time) — nothing short of
 * renaming this key itself could avoid that one collision.
 * A fiche's values are filtered through readableForm() (modules/permissions/readable-form.ts),
 * the same cut its own rendering already makes: without it, this handler
 * would publish a field the fiche itself withholds.
 */
export async function getRawContent(
  slug: string
): Promise<RawContent | AccessRefusal | null> {
  const page = await getPageWithForm(slug);
  if (!page) return null;
  if (isRefused(page)) return page;

  const metadata: RawMetadata = {
    "created-at": page.createdAt,
    owner: displayName(page.owner),
    "last-edited-at": page.current?.createdAt ?? page.createdAt,
    "last-edited-by": displayName(page.current?.author ?? null),
    "read-scope": pageRule(page, "READ"),
    "write-scope": pageRule(page, "WRITE"),
  };

  if (!hasForm(page)) {
    return { kind: "page", content: page.current?.content ?? "", metadata };
  }

  const seen = await readableForm(page.form.schema);
  const data = seen ? seen.readableValues(page.current?.data) : {};
  const fields = seen ? orderedEntryData(seen.readable, data) : data;
  return {
    kind: "entry",
    fields,
    metadata: { "form-id": page.form.slug, ...metadata },
  };
}

/**
 * The slugs a link may be suggested from: what the person can actually read,
 * most recently touched first. Page slugs carry no frequency the way keywords
 * do, and what one links to is nearly always what the wiki has been working
 * on — where alphabetical order only ever favours the letter A.
 */
export async function listPageSlugs(): Promise<string[]> {
  const pages = await prisma.page.findMany({
    where: await currentReadableWhere(),
    select: { slug: true },
    orderBy: [{ current: { createdAt: "desc" } }, { createdAt: "desc" }],
  });
  return pages.map((page) => page.slug);
}

async function slugsMatching(where: Prisma.PageWhereInput): Promise<string[]> {
  const pages = await prisma.page.findMany({
    where,
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  return pages.map((page) => page.slug);
}

/**
 * Every slug, readable or not — what « cette page n'existe pas » is decided
 * against (modules/pages/lint.ts). Filtering here would report a link to a page the
 * author cannot read as a broken one, and the spec is explicit that the
 * warning is about a writing mistake and nothing else: a slug one has already
 * typed is not an enumeration of the wiki.
 */
export async function listAllPageSlugs(): Promise<string[]> {
  return slugsMatching({});
}

/**
 * The keywords a page-tag input offers: what this person can actually read
 * (issue #15). `Page.tags` is a Postgres array (ADR 0007), whose own SELECT
 * DISTINCT unnest(tags) trick is deliberately not used here — a raw query
 * would need its own copy of the read filter, and a second copy is a copy
 * that drifts. Reading the rows and ranking them in memory keeps the one
 * `where` every other list goes through.
 */
export async function listPageTags(): Promise<string[]> {
  const pages = await prisma.page.findMany({
    where: await currentReadableWhere(),
    select: { tags: true },
  });
  return rankByFrequency(pages.flatMap((page) => page.tags));
}

/** Named pages with their current revision — resolving links to their title. */
export async function listPagesWithCurrent(slugs: string[]) {
  return prisma.page.findMany({
    where: { AND: [{ slug: { in: slugs } }, await currentReadableWhere()] },
    include: { current: true },
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

/**
 * Current MDX content of each layout page, keyed by its role. One of the two
 * paths that deliberately escape the check (docs/permissions.md § Application
 * des droits): this is the site's chrome, not its content, and submitting it
 * to the rights would make the menu vanish for some readers and not others.
 */
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

/**
 * Whether the current person may read the page a link, a button or an iframe
 * names — what `hideIfNoAccess` asks before deciding to render at all
 * (docs/permissions.md § Liens et boutons vers l'inaccessible, issue #13). A
 * missing target is not this door's business: `modules/pages/lint.ts`
 * already signals a dead slug, so an unwritten page reads as reachable here
 * rather than as a reason to hide.
 *
 * Memoized per request and per slug (React cache), like every other read
 * behind currentPerson — a menu naming the same page from several entries
 * costs one query, not one per entry.
 */
export const isSlugReadable = cache(async (slug: string): Promise<boolean> => {
  if (ALWAYS_READABLE.includes(slug)) return true;
  const page = await prisma.page.findUnique({
    where: { slug },
    select: { ownerUsername: true, readScope: true, writeScope: true, acls: ACL_ROWS },
  });
  if (!page) return true;
  return canRead(await currentPerson(), page);
});

/**
 * Whether a `hideIfNoAccess` link, button or iframe should vanish
 * (docs/permissions.md § Liens et boutons vers l'inaccessible, issue #13):
 * only when the setting is on, the target is internal, and it resolves to a
 * slug this person may not read. The one door
 * modules/authoring/wiki-components/{wiki-link,button,iframe}.tsx all ask
 * through, so an external target or an
 * unparsable one reads the same way — visible — from every one of them,
 * rather than each re-deriving its own edge cases.
 */
export async function hiddenIfNoAccess(
  link: string,
  hideIfNoAccess: boolean
): Promise<boolean> {
  if (!hideIfNoAccess || !link || isExternalHref(link)) return false;
  const slug = wikiHrefSlug(link);
  if (!slug) return false;
  return !(await isSlugReadable(slug));
}

// --- writes -----------------------------------------------------------------

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
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
}): Promise<{ unchanged: boolean }> {
  const { slug, content, tags } = input;
  const existing = await prisma.page.findUnique({
    where: { slug },
    include: { current: true, ...WITH_RIGHTS },
  });
  // Editing what is there and adding what is not are two different rights:
  // one is posed on the page, the other on the wiki.
  if (existing) await assertCanWrite(existing);
  else await assertCanCreatePage();

  if (existing && existing.current?.content === content) {
    if (sameTags(existing.tags, tags)) {
      return { unchanged: true };
    }
    await prisma.page.update({ where: { id: existing.id }, data: { tags } });
    return { unchanged: false };
  }

  const person = await currentUsername();
  await prisma.$transaction(async (tx) => {
    const page =
      existing ??
      (await tx.page.create({
        data: { slug, ownerUsername: person, ...(await bornWithDefaultRights()) },
      }));

    await mintRevision(
      tx,
      { pageId: page.id, content, authorUsername: person },
      { tags }
    );
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
  await assertAddress();
  await prisma.$transaction(
    async (tx) => {
      await tx.page.update({
        where: { id: pageId },
        data: { slug: rename.newSlug },
      });
      await sweepSlugReferences(tx, rename, referenceProps, "page");
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}

// Hard delete (ADR 0008): revisions go with the page via onDelete: Cascade.
// The rights are read here rather than taken from the caller: deleting is the
// one action nothing undoes, and the door owes it its own look at the page.
export async function deletePageById(id: string): Promise<void> {
  const page = await prisma.page.findUniqueOrThrow({
    where: { id },
    include: WITH_RIGHTS,
  });
  await assertStructuring(page, DELETE_REFUSED);
  await prisma.page.delete({ where: { id } });
}
