import {
  type AccessGrant,
  type RightsReplacement,
  alreadyGrants,
  nothingToReplace,
} from "@/modules/permissions/bulk";
import { isEntryPage } from "@/modules/pages/entry-page";
import {
  type AccessRule,
  type AclFloor,
  type Identity,
  type PageRights,
  type RefusalKind,
  PERM_KINDS,
  aclEntries,
  pageRule,
  storedRights,
  withoutFloor,
  refuse,
} from "@/modules/permissions/rules";
import { refGroupSlug, refUsername } from "@/modules/permissions/groups";
import { existingPrincipals, grantTarget } from "@/modules/permissions/groups-queries";
import {
  assertAdmin,
  currentAllows,
  currentWritableWhere,
} from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { wikiConfig } from "@/wiki.config";
import {
  assertStructuring,
  structuredPage,
} from "@/modules/pages/access/guards";

// The rights of one page, and of the wiki as a whole: everything
// modules/pages/content.ts, modules/pages/revisions.ts and
// modules/pages/entries.ts need to decide who reads or writes what, plus the
// administration system pages' own bulk actions. Part of ADR 0025's access layer.
//
// PUBLIC_IDENTITY, ACL_ROWS, WITH_RIGHTS and COLD_ADMIN_TRANSACTION_TIMEOUT_MS
// live here rather than in modules/pages/access/guards.ts (private to the
// module by its depth) because modules/forms/forms.ts imports several of them — a shared brick lives at a module's root, never
// behind its guards (ADR 0029). PUBLIC_IDENTITY and ACL_ROWS specifically
// cannot move to guards.ts even as an implementation detail: WITH_RIGHTS
// composes them in a top-level `const`, evaluated at import time, and guards.ts
// already imports WITH_RIGHTS and currentCanCreatePage back from this same
// file — a cycle bundlers resolve fine when every crossing is inside a
// function body, but not when one side of it is a top-level `const`.

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
  await assertStructuring(page, "rights");
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
  const page = await structuredPage(slug, "rights");
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

// `gerer-pages` (docs/permissions.md § Les pages système): the state of the
// rights of every page on one system page, and a decision applied to dozens
// of them at once without wondering what has just been broken. Reading it is
// an administrator's action — it names the owner of everything and what each
// page is open to — so the check is in the access layer, like the accounts
// system page.

/** A line of the management system page: what it shows, and what it decides on. */
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
async function lotPages(slugs: readonly string[], refusal: RefusalKind) {
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
  const pages = await lotPages(slugs, "rights");
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
  const pages = await lotPages(slugs, "rights");
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
  const pages = await lotPages(slugs, "transfer");
  const known = await existingPrincipals({
    usernames: [toUsername],
    groupSlugs: [],
  });
  if (!known.usernames.has(toUsername)) refuse("unknownRecipient");
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
  const page = await structuredPage(slug, "transfer");
  // Whom the client names is checked before it reaches the column: an unknown
  // username would come back as a foreign-key failure, and the refusal a
  // view prints has to be one this wiki wrote.
  const known = await existingPrincipals({
    usernames: [toUsername],
    groupSlugs: [],
  });
  if (!known.usernames.has(toUsername)) refuse("unknownRecipient");
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
