import {
  currentAllows,
  currentWritableWhere,
} from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import { wikiConfig } from "@/wiki.config";

// The shared vocabulary of a page's rights — the Prisma shapes every module
// that reads or decides on a page needs — and the cross-module lifecycle
// helpers other modules call when an account or a group is deleted.
//
// The operations that *use* these shapes (the rights modal, the bulk admin
// actions) live in access/page-rights.ts and access/admin-rights.ts, private
// to this module by their depth (ADR 0029).

/**
 * What the wiki says about a person beside a contribution: the display name,
 * and the identifier the account system pages link to. Never the email — it is
 * shown in gerer-utilisateurs and nowhere else (docs/permissions.md).
 *
 * A live reference, not a name frozen at write time (ADR 0024): renaming an
 * account renames its signature throughout the history.
 */
export const PUBLIC_IDENTITY = {
  select: { name: true, username: true },
} as const;

/** The « seulement » list of a page, in the shape the pure rules read it. */
export const ACL_ROWS = {
  select: { kind: true, username: true, groupSlug: true },
} as const;

/**
 * What deciding on a page needs, plus the name a refusal would print. Shared
 * with modules/forms/forms.ts, which loads a whole form's entries at once: a
 * system page that offers an action per row has to know the rights of each.
 */
export const WITH_RIGHTS = {
  owner: PUBLIC_IDENTITY,
  acls: ACL_ROWS,
} as const;

/**
 * What a namespace-wide retcon is allowed to take (ADR 0016/0017/0020): a
 * large wiki means many rewrites in one sweep, where Prisma's default 5s is
 * sized for hot-path transactions. Shared with modules/forms/forms.ts — the
 * same rare cold admin actions, on the other side of the access layer.
 */
export const COLD_ADMIN_TRANSACTION_TIMEOUT_MS = 60_000;

/**
 * What a refused read hands back instead of the page. A distinct shape rather
 * than null, for two reasons: the refusal view has to name whoever looks
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
 * Creating a page reads the wiki's own rule (docs/permissions.md § Où
 * s'appliquent les droits), the only right no page carries.
 */
export async function currentCanCreatePage(): Promise<boolean> {
  return currentAllows(wikiConfig.permissions.createPage);
}

/**
 * « Cette personne peut-elle contribuer quelque part ? » — the only question the
 * upload asks (docs/permissions.md § Quel droit commande quelle action): there is
 * no right of its own on files. The free test comes first and short-circuits
 * the query, which is the only half that touches the database.
 */
export async function canContributeSomewhere(): Promise<boolean> {
  if (await currentCanCreatePage()) return true;
  const writable = await prisma.page.findFirst({
    where: await currentWritableWhere(),
    select: { id: true },
  });
  return writable !== null;
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

/**
 * What deleting a group takes with it: « @Bureau apparaît dans les droits de
 * 23 pages. » Counted on the Page, so a group named in both senses of the
 * same page is one page and not two.
 */
export async function countPagesGrantingGroup(groupSlug: string): Promise<number> {
  return prisma.page.count({ where: { acls: { some: { groupSlug } } } });
}
