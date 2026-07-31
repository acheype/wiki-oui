import { cache } from "react";
import { type EntryData, readEntryData } from "@/lib/form-descriptor";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  type AccessRule,
  type PageRights,
  CREATE_REFUSED,
  RIGHTS_REFUSED,
  WRITE_REFUSED,
  canRead,
  canWrite,
  copyDefaultRights,
  isAdmin,
  pageRule,
  readableWhere,
  ruleAllows,
  storedRights,
  writableWhere,
} from "@/lib/permissions";
import { currentActor, currentUsername } from "@/lib/permissions-db";
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

/**
 * What a namespace-wide retcon is allowed to take (ADR 0016/0017/0020): a
 * large wiki means many rewrites in one sweep, where Prisma's default 5s is
 * sized for hot-path transactions. Shared with lib/forms.ts — the same rare
 * cold admin actions, on the other side of the door.
 */
export const COLD_ADMIN_TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * What the wiki says about a person beside a contribution: the display name,
 * and the identifier the account screens link to. Never the email — it is
 * shown in gerer-utilisateurs and nowhere else (docs/permissions.md).
 *
 * A live reference, not a name frozen at write time (ADR 0024): renaming an
 * account renames its signature throughout the history.
 */
export const PUBLIC_IDENTITY = {
  select: { name: true, username: true },
} as const;

// --- the rights, at the door -------------------------------------------------

/** The « seulement » list of a page, in the shape the pure rules read it. */
const ACL_ROWS = {
  select: { kind: true, username: true, groupSlug: true },
} as const;

/** What deciding on a page needs, plus the name a refusal would print. */
const WITH_RIGHTS = {
  owner: PUBLIC_IDENTITY,
  acls: ACL_ROWS,
} as const;

type Decidable = PageRights & { owner: { name: string } | null };

/**
 * What a refused read hands back instead of the page. A distinct shape rather
 * than null, for two reasons: the refusal screen has to name whoever looks
 * after the page, and a caller that forgets the case gets a type error rather
 * than a wiki that quietly answers « cette page n'existe pas encore ».
 */
export interface AccessRefusal {
  refused: true;
  /** Display name of whoever looks after the page, null when nobody does. */
  ownerName: string | null;
}

export function isRefused<T extends object>(
  result: T | AccessRefusal
): result is AccessRefusal {
  return "refused" in result;
}

/**
 * What the lists filter on, in SQL and never afterwards (docs/permissions.md
 * § Deux temps) — so that counters, pagination and « effacer les filtres »
 * come out right mechanically, working on what actually arrived.
 */
export async function currentReadableWhere(): Promise<Prisma.PageWhereInput> {
  return readableWhere(await currentActor());
}

/** A single page's read decision — the lists get a `where` instead. */
async function ifReadable<T extends Decidable>(
  page: T
): Promise<T | AccessRefusal> {
  if (canRead(await currentActor(), page)) return page;
  return { refused: true, ownerName: page.owner?.name ?? null };
}

/** The backstop of every content write; the screens refuse long before it. */
async function assertCanWrite(page: PageRights): Promise<void> {
  if (!canWrite(await currentActor(), page)) throw new Error(WRITE_REFUSED);
}

/**
 * Creating a page reads the wiki's own rule (docs/permissions.md § Où
 * s'appliquent les droits), the only right no page carries.
 */
export async function actorCanCreatePage(): Promise<boolean> {
  const actor = await currentActor();
  return isAdmin(actor) || ruleAllows(actor, wikiConfig.permissions.createPage);
}

async function assertCanCreatePage(): Promise<void> {
  if (!(await actorCanCreatePage())) throw new Error(CREATE_REFUSED);
}

/** Posing the rights is the owner's and the administrators' alone. */
async function assertOwnsPage(page: PageRights): Promise<void> {
  const actor = await currentActor();
  if (isAdmin(actor) || actor.username === page.ownerUsername) return;
  throw new Error(RIGHTS_REFUSED);
}

/**
 * The rights a page is born with: the wiki's defaults, copied — never linked
 * (ADR 0026). Written as a nested create so the page and its list land in one
 * statement, and no page ever exists without the columns saying what it is.
 */
function bornWithDefaultRights() {
  const born = copyDefaultRights({
    read: wikiConfig.permissions.defaultPageRead,
    write: wikiConfig.permissions.defaultPageWrite,
  });
  return {
    readScope: born.readScope,
    writeScope: born.writeScope,
    acls: { create: born.acls },
  };
}

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

/** A page with the form it is an entry of, null form for an MDX page. */
export async function getPageWithForm(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: { form: true, current: true, ...WITH_RIGHTS },
  });
  return page && ifReadable(page);
}

export async function getPageWithRevisions(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      ...WITH_RIGHTS,
      revisions: {
        orderBy: { createdAt: "asc" },
        include: {
          author: PUBLIC_IDENTITY,
          restoredFrom: { select: { id: true, createdAt: true } },
        },
      },
    },
  });
  return page && ifReadable(page);
}

export async function listPageSlugs(): Promise<string[]> {
  const pages = await prisma.page.findMany({
    where: await currentReadableWhere(),
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  return pages.map((page) => page.slug);
}

/** Named pages with their current revision — resolving links to their title. */
export async function listPagesWithCurrent(slugs: string[]) {
  return prisma.page.findMany({
    where: { AND: [{ slug: { in: slugs } }, await currentReadableWhere()] },
    include: { current: true },
  });
}

/** The entry pages of one form, or of every form when no slug is given. */
export async function listEntryPages(formSlug?: string) {
  return prisma.page.findMany({
    where: {
      AND: [
        formSlug ? { form: { slug: formSlug } } : { formId: { not: null } },
        await currentReadableWhere(),
      ],
    },
    include: { form: true, current: true, owner: PUBLIC_IDENTITY },
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
  const revision = await prisma.revision.findUnique({
    where: { id: revisionId },
    include: { page: { include: { form: true, ...WITH_RIGHTS } } },
  });
  if (!revision) return null;
  const page = await ifReadable(revision.page);
  return isRefused(page) ? page : revision;
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

  const actor = await currentUsername();
  await prisma.$transaction(async (tx) => {
    const page =
      existing ??
      (await tx.page.create({
        data: { slug, ownerUsername: actor, ...bornWithDefaultRights() },
      }));

    await mintRevision(
      tx,
      { pageId: page.id, content, authorUsername: actor },
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

/**
 * Hands a set of pages to an owner, by address. The installation uses it to
 * put the special pages under the initial administrator's account (ADR
 * 0027): the site's chrome gets someone responsible for it, while the
 * example pages keep no owner — demonstration content has none.
 */
export async function assignPagesOwner(
  slugs: readonly string[],
  username: string
): Promise<void> {
  await prisma.page.updateMany({
    where: { slug: { in: [...slugs] } },
    data: { ownerUsername: username },
  });
}

/**
 * What an account leaves behind, for the modal that announces the numbers
 * before an erasure (docs/permissions.md § Fin d'un compte). Entries are
 * pages (ADR 0014), so one count covers both.
 */
export async function countOwnedByAccount(
  username: string
): Promise<{ pages: number; revisions: number }> {
  const [pages, revisions] = await Promise.all([
    prisma.page.count({ where: { ownerUsername: username } }),
    prisma.revision.count({ where: { authorUsername: username } }),
  ]);
  return { pages, revisions };
}

/**
 * Hands the pages of one account to another, the reassignment the deletion
 * modal offers. Only ownership moves: a revision keeps its author, since
 * rewriting who wrote what would be a lie the history cannot carry — those go
 * to « Anonyme » on their own, by `onDelete: SetNull`.
 */
export async function reassignOwnedPages(
  fromUsername: string,
  toUsername: string
): Promise<void> {
  await prisma.page.updateMany({
    where: { ownerUsername: fromUsername },
    data: { ownerUsername: toUsername },
  });
}

// Hard delete (ADR 0008): revisions go with the page via onDelete: Cascade.
export async function deletePageById(id: string): Promise<void> {
  await prisma.page.delete({ where: { id } });
}

// --- the rights of one page --------------------------------------------------

/** Whether the screens offer a gesture or simply leave it out. */
export async function actorCanWrite(page: PageRights): Promise<boolean> {
  return canWrite(await currentActor(), page);
}

/** Posing the rights, like deleting, stops at the owner and the admins. */
export async function actorOwns(page: PageRights): Promise<boolean> {
  const actor = await currentActor();
  return isAdmin(actor) || actor.username === page.ownerUsername;
}

/** A page's rights as the modal poses them, both senses at once. */
export interface PageRightsView {
  ownerName: string | null;
  read: AccessRule;
  write: AccessRule;
}

export async function getPageRights(slug: string): Promise<PageRightsView | null> {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: WITH_RIGHTS,
  });
  if (!page) return null;
  await assertOwnsPage(page);
  return {
    ownerName: page.owner?.name ?? null,
    read: pageRule(page, "READ"),
    write: pageRule(page, "WRITE"),
  };
}

/**
 * What the « Droits » modal saves. The list is rewritten rather than diffed:
 * it is the whole of what the widget shows, and a page carries a handful of
 * lines at most. No revision is minted — rights live on the Page and are not
 * historized, like tags (ADR 0007).
 */
export async function setPageRights(
  slug: string,
  read: AccessRule,
  write: AccessRule
): Promise<void> {
  const page = await prisma.page.findUniqueOrThrow({
    where: { slug },
    include: WITH_RIGHTS,
  });
  await assertOwnsPage(page);
  const rights = storedRights(read, write);
  await prisma.$transaction(async (tx) => {
    await tx.pageAcl.deleteMany({ where: { pageId: page.id } });
    await tx.page.update({
      where: { id: page.id },
      data: {
        readScope: rights.readScope,
        writeScope: rights.writeScope,
        acls: { create: rights.acls },
      },
    });
  });
}

/**
 * What deleting a group takes with it: « @Bureau apparaît dans les droits de
 * 23 pages. » Counted on the Page, so a group named in both senses of the
 * same page is one page and not two.
 */
export async function countPagesGrantingGroup(groupSlug: string): Promise<number> {
  return prisma.page.count({ where: { acls: { some: { groupSlug } } } });
}

/**
 * « Cet acteur peut-il contribuer quelque part ? » — the only question the
 * upload asks (docs/permissions.md § Quel droit commande quel geste): there is
 * no right of its own on files. The two free tests come first and short-
 * circuit the third, which is the only one that touches the database.
 */
export async function canContributeSomewhere(): Promise<boolean> {
  const actor = await currentActor();
  if (isAdmin(actor)) return true;
  if (ruleAllows(actor, wikiConfig.permissions.createPage)) return true;
  const writable = await prisma.page.findFirst({
    where: writableWhere(actor),
    select: { id: true },
  });
  return writable !== null;
}

/** An entry's first save (ADR 0014): the page, its snapshot, and the link. */
export async function createEntryPage(input: {
  slug: string;
  formId: string;
  data: EntryData;
  tags: string[];
}): Promise<void> {
  const { slug, formId, data, tags } = input;
  await assertCanCreatePage();
  const actor = await currentUsername();
  await prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: {
        slug,
        ownerUsername: actor,
        formId,
        tags,
        ...bornWithDefaultRights(),
      },
    });
    await mintRevision(tx, {
      pageId: page.id,
      data: data as Prisma.InputJsonValue,
      authorUsername: actor,
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
}): Promise<void> {
  const { pageId, data, tags } = input;
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { current: true, ...WITH_RIGHTS },
  });
  await assertCanWrite(page);
  const unchanged =
    JSON.stringify(readEntryData(page.current?.data)) === JSON.stringify(data);
  const actor = await currentUsername();
  await prisma.$transaction(async (tx) => {
    await tx.page.update({ where: { id: pageId }, data: { tags } });
    if (unchanged) return;
    await mintRevision(tx, {
      pageId,
      data: data as Prisma.InputJsonValue,
      authorUsername: actor,
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
  restoredFromId: string;
}): Promise<void> {
  const { pageId, content, data, restoredFromId } = input;
  await assertCanWrite(
    await prisma.page.findUniqueOrThrow({ where: { id: pageId }, include: WITH_RIGHTS })
  );
  const actor = await currentUsername();
  await prisma.$transaction(async (tx) => {
    await mintRevision(tx, {
      pageId,
      content,
      data,
      authorUsername: actor,
      restoredFromId,
    });
  });
}
