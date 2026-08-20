import { cache } from "react";
import {
  type AccessGrant,
  type RightsReplacement,
  alreadyGrants,
  nothingToReplace,
} from "@/lib/bulk-rights";
import { hasForm, isEntryPage } from "@/lib/entry-page";
import { restoredEntryValues } from "@/lib/entry-title";
import { readableForm } from "@/lib/field-rights-db";
import { mergedEntryData } from "@/lib/field-rights";
import {
  type EntryData,
  type FormDescriptor,
  computeAutomaticTitle,
  emptyTitleMessage,
  orderedEntryData,
  readEntryData,
} from "@/lib/form-descriptor";
import {
  type EntryRightsImpact,
  type FormPermissions,
  canCreateEntry,
  defaultsPrincipals,
  entryRightsFrom,
  entryRightsImpact,
  entryRightsVerdict,
  withKnownPrincipals,
} from "@/lib/form-rights";
import { Prisma } from "@/lib/generated/prisma/client";
import { refGroupSlug, refUsername } from "@/lib/groups";
import { existingPrincipals, grantTarget } from "@/lib/groups-db";
import {
  type AccessRule,
  type AclEntry,
  type AclFloor,
  type Identity,
  type PagePermissions,
  type PageRights,
  ADDRESS_REFUSED,
  CREATE_ENTRY_REFUSED,
  CREATE_REFUSED,
  DELETE_REFUSED,
  PERM_KINDS,
  RIGHTS_REFUSED,
  TRANSFER_REFUSED,
  UNKNOWN_RECIPIENT,
  WRITE_REFUSED,
  aclEntries,
  canRead,
  canWrite,
  isAdmin,
  knownEntries,
  ownsPage,
  permissionsOn,
  pageRule,
  listReadableWhere,
  ruleAllows,
  storedRights,
  withoutFloor,
  writableWhere,
} from "@/lib/permissions";
import { assertAdmin, currentPerson, currentUsername } from "@/lib/permissions-db";
import { prisma } from "@/lib/prisma";
import { rankByFrequency } from "@/lib/suggested-values";
import type { SlugRename } from "@/lib/slug-rename";
import { displayName } from "@/lib/username";
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

/**
 * What deciding on a page needs, plus the name a refusal would print. Shared
 * with lib/forms.ts, which loads entries by the formful: a screen that offers
 * a action per row has to know the rights of every one of them.
 */
export const WITH_RIGHTS = {
  owner: PUBLIC_IDENTITY,
  acls: ACL_ROWS,
} as const;

type Decidable = PageRights & { slug: string; owner: { name: string } | null };

/**
 * The four account screens answer to everyone, whatever right is posed on
 * them (docs/permissions.md § Les écrans): signing in has to work exactly
 * where the content refuses, and the refusal screen's own « Se connecter »
 * would otherwise lead to a second refusal. Read by the single-page check and
 * by the list clause alike, so the two cannot drift apart.
 */
const ALWAYS_READABLE: readonly string[] = Object.values(wikiConfig.authPages);

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

// isEntryPage() and hasForm() live in lib/entry-page.ts, a module with no
// server-only imports of its own (unlike this one, ADR 0025's door): a
// Client Component can call them directly without pulling next/headers into
// its bundle (components/page/pages-admin.tsx does exactly that). Re-exported
// here so every server-side caller still reaches them through this one door.
export { isEntryPage, hasForm };

/**
 * What the lists filter on, in SQL and never afterwards (docs/permissions.md
 * § Deux temps) — so that counters, pagination and « effacer les filtres »
 * come out right mechanically, working on what actually arrived.
 */
export async function currentReadableWhere(): Promise<Prisma.PageWhereInput> {
  return listReadableWhere(await currentPerson(), ALWAYS_READABLE);
}

/** A single page's read decision — the lists get a `where` instead. */
async function ifReadable<T extends Decidable>(
  page: T
): Promise<T | AccessRefusal> {
  if (ALWAYS_READABLE.includes(page.slug)) return page;
  if (canRead(await currentPerson(), page)) return page;
  return { refused: true, ownerName: page.owner?.name ?? null };
}

/** The backstop of every content write; the screens refuse long before it. */
async function assertCanWrite(page: PageRights): Promise<void> {
  if (!canWrite(await currentPerson(), page)) throw new Error(WRITE_REFUSED);
}

/**
 * Creating a page reads the wiki's own rule (docs/permissions.md § Où
 * s'appliquent les droits), the only right no page carries.
 */
export async function personCanCreatePage(): Promise<boolean> {
  const person = await currentPerson();
  return isAdmin(person) || ruleAllows(person, wikiConfig.permissions.createPage);
}

async function assertCanCreatePage(): Promise<void> {
  if (!(await personCanCreatePage())) throw new Error(CREATE_REFUSED);
}

/** The configured principals that still exist, as the pure filter reads them. */
async function keepKnownPrincipals(acls: AclEntry[]): Promise<AclEntry[]> {
  if (acls.length === 0) return acls;
  const known = await existingPrincipals({
    usernames: acls.flatMap((acl) => (acl.username ? [acl.username] : [])),
    groupSlugs: acls.flatMap((acl) => (acl.groupSlug ? [acl.groupSlug] : [])),
  });
  return knownEntries(acls, known);
}

/**
 * The rung deleting, posing the rights and handing the page on stop at. Each
 * caller names the refusal its own action would print: they all land in the
 * same toast, where « vous ne pouvez pas supprimer cette page » says something
 * and « vous n'êtes pas le propriétaire » leaves the reader to work it out.
 */
async function assertStructuring(
  page: PageRights,
  refusal: string
): Promise<void> {
  if (ownsPage(await currentPerson(), page)) return;
  throw new Error(refusal);
}

/**
 * Changing an address is the administrators' alone: the rename retcons
 * references throughout the wiki (ADR 0016), so its effect leaves the page
 * the way no other action on it does.
 */
async function assertAddress(): Promise<void> {
  if (!isAdmin(await currentPerson())) throw new Error(ADDRESS_REFUSED);
}

/**
 * The page a structuring action is about to act on, read with what deciding
 * needs and refused on the spot — so that reaching the write means the check
 * has happened, rather than leaving each action to remember an assertion
 * after its own query.
 */
async function structuredPage(slug: string, refusal: string) {
  const page = await prisma.page.findUniqueOrThrow({
    where: { slug },
    include: WITH_RIGHTS,
  });
  await assertStructuring(page, refusal);
  return page;
}

/**
 * The rights a page is born with: a pair of defaults, copied — never linked
 * (ADR 0026). Written as a nested create so the page and its list land in one
 * statement, and no page ever exists without the columns saying what it is.
 *
 * A default naming an account or a group that has since gone is dropped here
 * rather than granted on the quiet (ADR 0026) — and the query that decides
 * that runs only when the defaults name anyone at all, which the shape a wiki
 * ships with does not.
 *
 * One function for both storeys: a page copies the wiki's defaults, a fiche
 * copies its form's (docs/permissions.md § Défauts). Same action, and the
 * only difference is where the pair was read.
 */
async function bornWith(read: AccessRule, write: AccessRule) {
  const born = storedRights(read, write);
  return {
    readScope: born.readScope,
    writeScope: born.writeScope,
    acls: { create: await keepKnownPrincipals(born.acls) },
  };
}

/** The wiki's own defaults, which every MDX page is born with. */
async function bornWithDefaultRights() {
  return bornWith(
    wikiConfig.permissions.defaultPageRead,
    wikiConfig.permissions.defaultPageWrite
  );
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
 * lib/form-descriptor.ts refuses the form at save time) — nothing short of
 * renaming this key itself could avoid that one collision.
 * A fiche's values are filtered through readableForm() (lib/field-rights-db.ts),
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

/**
 * Every slug, readable or not — what « cette page n'existe pas » is decided
 * against (lib/page-lint.ts). Filtering here would report a link to a page the
 * author cannot read as a broken one, and the spec is explicit that the
 * warning is about a writing mistake and nothing else: a slug one has already
 * typed is not an enumeration of the wiki.
 */
export async function listAllPageSlugs(): Promise<string[]> {
  return slugsMatching({});
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
 * The current snapshots of one form's entries, and nothing else: what
 * counting a field's used values needs (issue #15). listEntryPages would
 * drag the form, the owner and an ordering along for rows nobody displays.
 */
export async function listEntrySnapshots(formSlug: string): Promise<unknown[]> {
  const pages = await prisma.page.findMany({
    where: {
      AND: [{ form: { slug: formSlug } }, await currentReadableWhere()],
    },
    select: { current: { select: { data: true } } },
  });
  return pages.map((page) => page.current?.data);
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

/**
 * « Transmettre la propriété » (docs/permissions.md § Quel droit commande quelle
 * action): there is no way back for whoever gives it away — nothing hands the
 * page over again, and the confirmation says so before the click.
 *
 * Only the ownership moves. The revisions keep their authors: rewriting who
 * wrote what would be a lie the history cannot carry.
 */
export async function transferPageOwnership(
  slug: string,
  toUsername: string
): Promise<void> {
  const page = await structuredPage(slug, TRANSFER_REFUSED);
  // Whom the client names is checked before it reaches the column: an unknown
  // username would come back as a foreign-key failure, and the refusal a
  // screen prints has to be one this wiki wrote.
  const known = await existingPrincipals({
    usernames: [toUsername],
    groupSlugs: [],
  });
  if (!known.usernames.has(toUsername)) throw new Error(UNKNOWN_RECIPIENT);
  await prisma.$transaction(async (tx) => {
    await tx.page.update({
      where: { id: page.id },
      data: { ownerUsername: toUsername },
    });
    // The new owner stands on the floor of both senses now, so the lines
    // naming them grant nothing — the rule withoutFloor applies when the
    // rights are posed, reaching the same rows from the other end.
    await tx.pageAcl.deleteMany({
      where: { pageId: page.id, username: toUsername },
    });
  });
}

// --- the rights of one page --------------------------------------------------

/** Whether the screens offer a action or simply leave it out. */
export async function personCanWrite(page: PageRights): Promise<boolean> {
  return canWrite(await currentPerson(), page);
}

/**
 * What the action bar may offer at all — the three rungs at once, so a screen
 * asks the question once and cannot answer half of it. What it does not get
 * is absent from the bar, never greyed out: an offer nobody can take up
 * informs nobody (docs/permissions.md § Ce que voit qui n'a pas le droit).
 */
export async function personPermissions(page: PageRights): Promise<PagePermissions> {
  return permissionsOn(await currentPerson(), page);
}

/** Whoever the page always allows, whatever its lists hold. */
function pageFloor(page: { owner: { name: string; username: string | null } | null }): AclFloor {
  const owner = page.owner;
  return {
    owner: owner?.username ? { username: owner.username, name: owner.name } : null,
  };
}

/** A page's rights as the modal poses them, both senses at once. */
export interface PageRightsView {
  /** Doubles as the widget's floor: whoever is here is never in the list. */
  floor: AclFloor;
  /** A fiche, so the modal names it as one — « Qui peut voir cette fiche ? ». */
  isEntry: boolean;
  read: AccessRule;
  write: AccessRule;
}

export async function getPageRights(slug: string): Promise<PageRightsView | null> {
  // The one caller that answers null rather than throwing: the modal opens on
  // a page the bar was drawn from, and a page deleted in between is not a
  // refusal to print.
  const page = await prisma.page.findUnique({
    where: { slug },
    include: WITH_RIGHTS,
  });
  if (!page) return null;
  await assertStructuring(page, RIGHTS_REFUSED);
  return {
    floor: pageFloor(page),
    isEntry: isEntryPage(page),
    read: pageRule(page, "READ"),
    write: pageRule(page, "WRITE"),
  };
}

/**
 * What the « Accès » modal saves. The list is rewritten rather than diffed:
 * it is the whole of what the widget shows, and a page carries a handful of
 * lines at most. No revision is minted — rights live on the Page and are not
 * historized, like tags (ADR 0007).
 */
export async function setPageRights(
  slug: string,
  read: AccessRule,
  write: AccessRule
): Promise<void> {
  const page = await structuredPage(slug, RIGHTS_REFUSED);
  const rights = storedRights(read, write);
  const kept = withoutFloor(rights.acls, pageFloor(page));
  await prisma.$transaction(async (tx) => {
    await tx.pageAcl.deleteMany({ where: { pageId: page.id } });
    await tx.page.update({
      where: { id: page.id },
      data: {
        readScope: rights.readScope,
        writeScope: rights.writeScope,
        acls: { create: kept },
      },
    });
  });
}

// --- the rights of the whole wiki --------------------------------------------

// `gerer-pages` (docs/permissions.md § Les écrans): the state of the rights of
// every page on one screen, and a decision applied to dozens of them at once
// without wondering what has just been broken. Reading it is an
// administrator's action — it names the owner of everything and what each
// page is open to — so the check is at the door, like the accounts screen.

/** A line of the management screen: what it shows, and what it decides on. */
export interface ManagedPage extends PageRights {
  slug: string;
  owner: Identity | null;
  /** isEntryPage()'s own scalar — see there for why this is the signal, not `form`. */
  formId: string | null;
  /** The `⌗Formulaire` marker, which tells a fiche from a page. Null for a page. */
  form: { slug: string; name: string } | null;
}

export async function listManagedPages(): Promise<ManagedPage[]> {
  await assertAdmin();
  const pages = await prisma.page.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      ownerUsername: true,
      readScope: true,
      writeScope: true,
      owner: PUBLIC_IDENTITY,
      acls: ACL_ROWS,
      formId: true,
      form: { select: { slug: true, name: true } },
    },
  });
  return pages.map(({ owner, ...page }) => ({
    ...page,
    owner: owner?.username ? { username: owner.username, name: owner.name } : null,
  }));
}

/**
 * The pages an action by lot is about, each read with what deciding on it
 * needs. Every one of them passes the rung posing rights stops at: a lot is a
 * handful of single permissions, and one page refused refuses the lot — half an
 * action by lot would be worse than none.
 */
async function lotPages(slugs: readonly string[], refusal: string) {
  const pages = await prisma.page.findMany({
    where: { slug: { in: [...slugs] } },
    include: WITH_RIGHTS,
  });
  for (const page of pages) await assertStructuring(page, refusal);
  return pages;
}

/**
 * « Donner accès » (docs/permissions.md § gerer-pages): adds people and groups
 * to the rights already posed, and takes access from nobody. No scope is
 * touched and no row is removed — the whole action is rows added, which is
 * what makes it the one that destroys nothing.
 *
 * A page that already gives the target access gets no row: the same
 * alreadyGrants the modal counted with, so what was announced is what happens.
 */
export async function grantPagesAccess(
  slugs: readonly string[],
  grant: AccessGrant
): Promise<void> {
  const pages = await lotPages(slugs, RIGHTS_REFUSED);
  const rows: Prisma.PageAclCreateManyInput[] = [];
  for (const kind of PERM_KINDS) {
    for (const ref of grant[kind] ?? []) {
      const target = await grantTarget(ref);
      if (!target) continue;
      for (const page of pages) {
        if (alreadyGrants(page, kind, target)) continue;
        rows.push({
          pageId: page.id,
          kind,
          username: refUsername(ref),
          groupSlug: refGroupSlug(ref),
        });
      }
    }
  }
  // Both senses in one statement: the two are one action, and a lot half
  // written is what refusing whole was meant to rule out. skipDuplicates for
  // the row another administrator may have added between the count and here.
  await prisma.pageAcl.createMany({ data: rows, skipDuplicates: true });
}

/**
 * « Remplacer les accès »: the lot ends up with exactly what was chosen, and
 * what it carried is gone. A sense left on « Ne pas changer » is absent from
 * the replacement and nothing of it is read — that is how touching the reading
 * alone stays possible.
 *
 * Four statements rather than four per page: this is a cold administration
 * action over hundreds of rows, and the floor is the only thing that differs
 * from one page to the next.
 */
export async function replacePagesRights(
  slugs: readonly string[],
  replacement: RightsReplacement
): Promise<void> {
  if (nothingToReplace(replacement)) return;
  const pages = await lotPages(slugs, RIGHTS_REFUSED);
  const ids = pages.map((page) => page.id);
  const posed = PERM_KINDS.filter((kind) => replacement[kind] !== undefined);
  const rows = pages.flatMap((page) =>
    posed.flatMap((kind) =>
      withoutFloor(aclEntries(replacement[kind]!, kind), pageFloor(page)).map(
        (entry) => ({ pageId: page.id, ...entry })
      )
    )
  );

  await prisma.$transaction(
    async (tx) => {
      await tx.pageAcl.deleteMany({
        where: { pageId: { in: ids }, kind: { in: posed } },
      });
      if (replacement.READ) {
        await tx.page.updateMany({
          where: { id: { in: ids } },
          data: { readScope: replacement.READ.scope },
        });
      }
      if (replacement.WRITE) {
        await tx.page.updateMany({
          where: { id: { in: ids } },
          data: { writeScope: replacement.WRITE.scope },
        });
      }
      await tx.pageAcl.createMany({ data: rows });
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}

/**
 * « Changer le propriétaire », by lot. Same action as the modal's transfer,
 * and just as final for whoever gives the pages away: only the ownership
 * moves, the revisions keeping their authors.
 */
export async function handPagesTo(
  slugs: readonly string[],
  toUsername: string
): Promise<void> {
  const pages = await lotPages(slugs, TRANSFER_REFUSED);
  const known = await existingPrincipals({
    usernames: [toUsername],
    groupSlugs: [],
  });
  if (!known.usernames.has(toUsername)) throw new Error(UNKNOWN_RECIPIENT);
  const ids = pages.map((page) => page.id);
  await prisma.$transaction(
    async (tx) => {
      await tx.page.updateMany({
        where: { id: { in: ids } },
        data: { ownerUsername: toUsername },
      });
      // The new owner is the floor of both senses now, so the lines naming
      // them grant nothing — the same rows setPageRights drops from the other
      // end.
      await tx.pageAcl.deleteMany({
        where: { pageId: { in: ids }, username: toUsername },
      });
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
}

// --- a form's defaults, over the fiches already there -------------------------

// Applying a form's defaults to the fiches already there (docs/permissions.md
// § Défauts): the one
// path from a default to what already exists, since the copy made at creation
// is never a link (ADR 0026). Both halves read the same pure function, so the
// numbers the confirmation announced are the ones the write then produces.

/** The fiches of one form, each with what deciding on its rights needs. */
async function formEntries(formId: string) {
  return prisma.page.findMany({ where: { formId }, include: WITH_RIGHTS });
}

/**
 * The defaults as they can actually be written today: a name that has gone
 * since the tab saved it is dropped (ADR 0026). Read once for the whole lot,
 * and by the count as well as by the write — otherwise a row nothing can
 * carry would leave its fiche « à changer » for good, and the write that
 * tried it would break on the foreign key and take the whole action with it.
 *
 * Costs no query in the shape a wiki runs in, where the defaults name nobody.
 */
async function liveDefaults(
  permissions: FormPermissions
): Promise<FormPermissions> {
  const named = defaultsPrincipals(permissions);
  if (named.usernames.length === 0 && named.groupSlugs.length === 0) {
    return permissions;
  }
  return withKnownPrincipals(permissions, await existingPrincipals(named));
}

export async function countEntryRightsImpact(
  formId: string,
  permissions: FormPermissions
): Promise<EntryRightsImpact> {
  return entryRightsImpact(
    await currentPerson(),
    await formEntries(formId),
    await liveDefaults(permissions)
  );
}

/**
 * Rewrites the rights of the form's fiches from its defaults. Only the fiches
 * the person may pose rights on are touched, and only those the defaults would
 * actually move — the two counts the confirmation showed, reached from the
 * other end.
 *
 * The list is rewritten rather than diffed, as the « Accès » modal rewrites
 * one: this is a replacement, and the confirmation says so before the click.
 */
export async function applyFormDefaultsToEntries(
  formId: string,
  permissions: FormPermissions
): Promise<void> {
  const person = await currentPerson();
  // The very defaults the count was taken against, names dropped and all.
  const live = await liveDefaults(permissions);
  const entries = (await formEntries(formId)).filter(
    (entry) => entryRightsVerdict(person, entry, live) === "changed"
  );
  if (entries.length === 0) return;

  const ids = entries.map((entry) => entry.id);
  const rows = entries.flatMap((entry) =>
    entryRightsFrom(live, entry.ownerUsername).acls.map((acl) => ({
      pageId: entry.id,
      ...acl,
    }))
  );
  // The scopes are the same for every fiche — only the floor differs from one
  // to the next — so two statements answer for the lot rather than two each.
  const posed = storedRights(live.defaultEntryRead, live.defaultEntryWrite);
  await prisma.$transaction(
    async (tx) => {
      await tx.pageAcl.deleteMany({ where: { pageId: { in: ids } } });
      await tx.page.updateMany({
        where: { id: { in: ids } },
        data: { readScope: posed.readScope, writeScope: posed.writeScope },
      });
      await tx.pageAcl.createMany({ data: rows });
    },
    { timeout: COLD_ADMIN_TRANSACTION_TIMEOUT_MS }
  );
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
 * « Cette personne peut-elle contribuer quelque part ? » — the only question the
 * upload asks (docs/permissions.md § Quel droit commande quelle action): there is
 * no right of its own on files. The two free tests come first and short-
 * circuit the third, which is the only one that touches the database.
 */
export async function canContributeSomewhere(): Promise<boolean> {
  const person = await currentPerson();
  if (isAdmin(person)) return true;
  if (ruleAllows(person, wikiConfig.permissions.createPage)) return true;
  const writable = await prisma.page.findFirst({
    where: writableWhere(person),
    select: { id: true },
  });
  return writable !== null;
}

/**
 * An entry's first save (ADR 0014): the page, its snapshot, and the link.
 * Both the right that lets it through and the rights it is born with come
 * from the form, not from the wiki (docs/permissions.md § Formulaire) — that
 * is what lets a wiki which hands out no page still say « chacun propose un
 * événement ».
 *
 * The form's three rules travel in rather than being read here: `Form` is the
 * other door's (ADR 0025), and lib/forms.ts has already read the descriptor
 * they come from on the way to this call.
 */
export async function createEntryPage(input: {
  slug: string;
  formId: string;
  formName: string;
  data: EntryData;
  permissions: FormPermissions;
}): Promise<void> {
  const { slug, formId, formName, data, permissions } = input;
  if (!canCreateEntry(await currentPerson(), permissions)) {
    throw new Error(CREATE_ENTRY_REFUSED);
  }
  // No merge here, where an edit has one: the merge protects the values a
  // revision already holds (docs/permissions.md § Champ), and a fiche being
  // born holds none. Its author owns it, and the fields they may not fill are
  // absent from their screen.
  const author = await currentUsername();
  const born = await bornWith(
    permissions.defaultEntryRead,
    permissions.defaultEntryWrite
  );
  await prisma.$transaction(async (tx) => {
    // Page.tags (ADR 0007) is shared machinery, not the fiche's own `tags`
    // field (docs/forms.md § Mots-clés ≠ tags de Page). The form's name is
    // the one default that makes sense for every fiche, whatever its form.
    const page = await tx.page.create({
      data: { slug, ownerUsername: author, formId, tags: [formName], ...born },
    });
    await mintRevision(tx, {
      pageId: page.id,
      data: data as Prisma.InputJsonValue,
      authorUsername: author,
    });
  });
}

/**
 * A new snapshot for an existing entry, unless the data is unchanged
 * (revisions are the content's history, ADR 0003).
 *
 * A revision stores a **complete** snapshot, so the write merges rather than
 * replaces (docs/permissions.md § Champ): it starts from the current revision
 * and lays over it only the fields this person may write. Done here, at the
 * door, and from the revision the door itself just read — a caller could hand
 * over a merge made against a snapshot that has moved since, and that stale
 * base is exactly the salary somebody wipes by saving the fiche.
 *
 * The descriptor travels in rather than being read here: `Form` is the other
 * door's (ADR 0025), and lib/forms.ts has already read it on the way to this
 * call.
 */
export async function writeEntryRevision(input: {
  pageId: string;
  data: EntryData;
  descriptor: FormDescriptor;
}): Promise<void> {
  const { pageId, data, descriptor } = input;
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { current: true, ...WITH_RIGHTS },
  });
  await assertCanWrite(page);
  const person = await currentPerson();
  const current = readEntryData(page.current?.data);
  const merged = mergedEntryData(person, descriptor, current, data);
  // The title is worked out here, from the merge and after it — the same
  // order a restore follows next door, and for the same reason: a gabarit
  // naming a field this person may not write has to go on reading the value
  // the fiche holds, where what arrived from the browser no longer carries
  // it. Stored, never recomputed at read (ADR 0020), so a title worked out
  // from the wrong values would stay wrong for good.
  const title = computeAutomaticTitle(descriptor, merged);
  if (title.trim() === "") throw new Error(emptyTitleMessage(descriptor));
  const withTitle = { ...merged, title };
  // Compared before reordering, against `merged` — which, like `current`,
  // carries only genuinely new keys out of place: storage makes no order
  // promise (jsonb), so reordering first would make every save look changed,
  // the reorder itself masquerading as new content.
  const unchanged = JSON.stringify(current) === JSON.stringify(withTitle);
  const author = await currentUsername();
  if (unchanged) return;
  // Ordered by the form's own fields (docs/permissions.md § /{slug}/raw) —
  // `title` lands wherever the form's own author placed it, never forced to
  // the front — the one reorder that actually reaches storage, done last so
  // nothing above has to reason about anything but values. `withTitle`
  // already exists above for the comparison, so this reuses it directly
  // rather than through withTitleOrdered, which would fold `title` back in
  // a second time for no reason.
  const written = orderedEntryData(descriptor, withTitle);
  // Two writes — the revision and the pointer that names it current — so the
  // transaction stays, though the tags no longer ride along with them.
  await prisma.$transaction(async (tx) => {
    await mintRevision(tx, {
      pageId,
      data: written as Prisma.InputJsonValue,
      authorUsername: author,
    });
  });
}

/**
 * A restore is a NEW revision labeled with its origin (ADR 0003/0009):
 * history stays append-only, nothing is rewound. Both snapshot columns are
 * carried over, which preserves the content-xor-data invariant (ADR 0014) for
 * MDX pages and entries alike.
 *
 * An entry's snapshot goes through the same merge a save does: putting an old
 * revision back is a write like any other, and the fields this person may not
 * write keep the values they hold today. Without it, restoring would be the
 * way round the merge — and a silent one, the restorer never having seen on
 * screen what they were putting back (docs/permissions.md § Champ).
 */
export async function writeRestoredRevision(input: {
  pageId: string;
  content: string | null;
  data: Prisma.InputJsonValue | undefined;
  restoredFromId: string;
  /** The form's fields for an entry; null for an MDX page, which has none. */
  descriptor: FormDescriptor | null;
}): Promise<void> {
  const { pageId, content, data, restoredFromId, descriptor } = input;
  const page = await prisma.page.findUniqueOrThrow({
    where: { id: pageId },
    include: { current: true, ...WITH_RIGHTS },
  });
  await assertCanWrite(page);
  const restored =
    descriptor && data !== undefined
      ? (restoredEntryValues(
          descriptor,
          mergedEntryData(
            await currentPerson(),
            descriptor,
            readEntryData(page.current?.data),
            data as EntryData
          )
          // The title is worked out again, after the merge and not before it:
          // the caller computed one from the archived snapshot, and a field
          // the restorer may not write is not going back to what that title
          // names. Stored titles are never recomputed at read (ADR 0020), so
          // a title left naming values the fiche does not hold would stay
          // wrong for good.
        ).values as Prisma.InputJsonValue)
      : data;
  const author = await currentUsername();
  await prisma.$transaction(async (tx) => {
    await mintRevision(tx, {
      pageId,
      content,
      data: restored,
      authorUsername: author,
      restoredFromId,
    });
  });
}
