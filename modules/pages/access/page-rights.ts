import { isEntryPage } from "@/modules/pages/entry-page";
import {
  type AccessRule,
  type AclFloor,
  pageRule,
  storedRights,
  withoutFloor,
  refuse,
} from "@/modules/permissions/rules";
import { existingPrincipals } from "@/modules/permissions/groups-directory";
import { prisma } from "@/lib/prisma";
import { WITH_RIGHTS } from "@/modules/pages/rights";
import {
  assertStructuring,
  structuredPage,
} from "@/modules/pages/access/guards";

/** Whoever the page always allows, whatever its lists hold. */
export function pageFloor(page: { owner: { name: string; username: string | null } | null }): AclFloor {
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
