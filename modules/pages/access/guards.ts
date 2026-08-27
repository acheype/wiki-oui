import {
  type AccessRule,
  type AclEntry,
  type PageRights,
  type RefusalKind,
  knownEntries,
  refuse,
  storedRights,
} from "@/modules/permissions/rules";
import { existingPrincipals } from "@/modules/permissions/groups-directory";
import {
  currentCanRead,
  currentCanWrite,
  currentOwns,
  isCurrentAdmin,
} from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import { WITH_RIGHTS, currentCanCreatePage } from "@/modules/pages/rights";
import type { Prisma } from "@/lib/generated/prisma/client";
import { wikiConfig } from "@/wiki.config";

// guards.ts and rights.ts import from each other (WITH_RIGHTS/structuredPage
// on one side, currentCanCreatePage/assertStructuring on the other). Harmless,
// because both sides only reach for the other inside a function body, never
// at module-evaluation time — unlike PUBLIC_IDENTITY/ACL_ROWS, which is
// exactly why those two live in rights.ts and not here: WITH_RIGHTS composes
// them in a top-level `const`, which runs at import time, and a cycle whose
// two halves both touch each other eagerly there is the one shape bundlers
// cannot resolve (a real "Cannot access before initialization" hit during
// this split — see the commit this file was added in).

// The guards of `Page` (ADR 0025), alongside modules/forms/access/guards.ts
// for `Form`. An ESLint rule refuses `prisma.page` anywhere else, so the
// permission checks this layer hosts cannot be bypassed by a caller that
// forgot them — the risk being a silent read, which no test would ever catch.
//
// Named for what it holds rather than for the library it calls: three of the
// wiki's forty-nine Prisma calls are here, and every one of them is a read
// taken so that a right can be posed on it at once.
//
// Private to this module (ADR 0029, wikioui/module-seam): every other file of
// modules/pages/ may import from here, nothing outside the module may. The
// constants any other module needs — WITH_RIGHTS, PUBLIC_IDENTITY, ACL_ROWS,
// COLD_ADMIN_TRANSACTION_TIMEOUT_MS — live in modules/pages/rights.ts instead,
// a root file, precisely because they cross that seam (modules/forms/forms.ts
// uses the first and the last).

export type Decidable = PageRights & { slug: string; owner: { name: string } | null };

/**
 * A single page's read decision — the lists get a `where` instead.
 *
 * No page is exempt, not even the account ones and not even the layout ones
 * (issue #20). The wiki used to keep a list of slugs that answered to everyone
 * whatever was posed on them; it is gone, and with it the two things it cost:
 * an administrator who changed the rights of `connexion` saw nothing happen,
 * and a menu naming every page of a closed wiki was still served to whoever
 * asked. What an administrator poses on a page is what the page does.
 */
export async function ifReadable<T extends Decidable>(
  page: T
): Promise<T | { refused: true; ownerName: string | null }> {
  if (await currentCanRead(page)) return page;
  return { refused: true, ownerName: page.owner?.name ?? null };
}

/** The backstop of every content write; the views refuse long before it. */
export async function assertCanWrite(page: PageRights): Promise<void> {
  if (!(await currentCanWrite(page))) refuse("write");
}

export async function assertCanCreatePage(): Promise<void> {
  if (!(await currentCanCreatePage())) refuse("createPage");
}

/** The configured principals that still exist, as the pure filter reads them. */
export async function keepKnownPrincipals(acls: AclEntry[]): Promise<AclEntry[]> {
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
export async function assertStructuring(
  page: PageRights,
  refusal: RefusalKind
): Promise<void> {
  if (await currentOwns(page)) return;
  refuse(refusal);
}

/**
 * Changing an address is the administrators' alone: the rename retcons
 * references throughout the wiki (ADR 0016), so its effect leaves the page
 * the way no other action on it does.
 */
export async function assertAddress(): Promise<void> {
  if (!(await isCurrentAdmin())) refuse("address");
}

/**
 * The page a structuring action is about to act on, read with what deciding
 * needs and refused on the spot — so that reaching the write means the check
 * has happened, rather than leaving each action to remember an assertion
 * after its own query.
 */
export async function structuredPage(slug: string, refusal: RefusalKind) {
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
export async function bornWith(read: AccessRule, write: AccessRule) {
  const born = storedRights(read, write);
  return {
    readScope: born.readScope,
    writeScope: born.writeScope,
    acls: { create: await keepKnownPrincipals(born.acls) },
  };
}

/** The wiki's own defaults, which every MDX page is born with. */
export async function bornWithDefaultRights() {
  return bornWith(
    wikiConfig.permissions.defaultPageRead,
    wikiConfig.permissions.defaultPageWrite
  );
}

/**
 * Minting a revision and moving the page's current pointer onto it is one act
 * (ADR 0003): the history is append-only and the pointer names its head, so
 * the two writes always travel together, inside the caller's transaction.
 * `pageData` rides along for the columns a caller writes in the same breath.
 */
export async function mintRevision(
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
