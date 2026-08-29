import {
  type AccessGrant,
  type RightsReplacement,
  alreadyGrants,
  nothingToReplace,
} from "@/modules/permissions/bulk";
import {
  type Identity,
  type PageRights,
  type RefusalKind,
  PERM_KINDS,
  aclEntries,
  withoutFloor,
  refuse,
} from "@/modules/permissions/rules";
import { refGroupSlug, refUsername } from "@/modules/permissions/groups-nesting";
import { existingPrincipals, grantTarget } from "@/modules/permissions/groups-directory";
import { assertAdmin } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  ACL_ROWS,
  COLD_ADMIN_TRANSACTION_TIMEOUT_MS,
  PUBLIC_IDENTITY,
  WITH_RIGHTS,
} from "@/modules/pages/rights";
import { assertStructuring } from "@/modules/pages/access/guards";
import { pageFloor } from "@/modules/pages/access/page-rights";

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
