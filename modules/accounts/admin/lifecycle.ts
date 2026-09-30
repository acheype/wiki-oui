import {
  type AccountRefusal,
  disableRefusal,
} from "@/modules/accounts/admin/rules";
import { sweepAclReferences } from "@/modules/permissions/acl-rename-sweep";
import { countFormsOwnedByAccount, reassignOwnedForms } from "@/modules/forms/forms";
import { administratorDepartureRefusal, preservingAdministrator } from "@/modules/permissions/administrators";
import { countOwnedByAccount, reassignOwnedPages } from "@/modules/pages/rights";
import { assertAdmin, currentUsername } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";

// The two ways a person stops getting in (docs/permissions.md § Fin d'un
// compte): the reversible one and the final one. Every action here is an
// administrator's, and the check sits here rather than in the callers
// (ADR 0025) — except the two self-service ones, which reach exactly one
// account, the one already signed in, and say so in their own comment.

/**
 * « Cette personne n'est plus des nôtres » — the everyday action, and a
 * reversible one: sign-in refused and sessions revoked at once, ownership and
 * authorship untouched, one click back the other way.
 */
export async function setAccountDisabled(
  username: string,
  disabled: boolean
): Promise<AccountRefusal> {
  await assertAdmin();
  if (!disabled) {
    await prisma.user.update({
      where: { username },
      data: { disabledAt: null },
    });
    return null;
  }

  const refusal = disableRefusal(username, await currentUsername());
  if (refusal) return refusal;
  return preservingAdministrator(username, async (tx) => {
    await tx.user.update({
      where: { username },
      data: {
        disabledAt: new Date(),
        // Revoked, not left to expire: « refuse the next sign-in » would leave
        // whoever is already signed in inside for as long as their session lasts.
        sessions: { deleteMany: {} },
      },
    });
  });
}

export interface AccountDeletionImpact {
  pages: number;
  forms: number;
  revisions: number;
  /** Why the deletion cannot happen at all, null when it can. */
  refusal: AccountRefusal;
}

/** The numbers the deletion modal announces, before anything is decided. */
export async function accountDeletionImpact(
  username: string
): Promise<AccountDeletionImpact> {
  await assertAdmin();
  return countErasure(username);
}

/**
 * The same numbers, for whoever is asking about their own account — no
 * administrator involved, since the only account this can ever describe is
 * the one already signed in.
 */
export async function ownDeletionImpact(): Promise<AccountDeletionImpact | null> {
  const username = await currentUsername();
  if (!username) return null;
  return countErasure(username);
}

async function countErasure(username: string): Promise<AccountDeletionImpact> {
  const [owned, forms, refusal] = await Promise.all([
    countOwnedByAccount(username),
    countFormsOwnedByAccount(username),
    administratorDepartureRefusal(username),
  ]);
  return {
    pages: owned.pages,
    forms,
    revisions: owned.revisions,
    refusal,
  };
}

/**
 * The erasure an administrator carries out (docs/permissions.md § Fin d'un
 * compte). Reassignment first, when one was chosen; then the plain DELETE.
 */
export async function deleteAccount(
  username: string,
  reassignToUsername: string | null
): Promise<AccountRefusal> {
  await assertAdmin();
  return erase(username, reassignToUsername);
}

/**
 * The erasure someone asks for themselves — the droit à l'effacement, which
 * belongs to the person and not to an administrator's goodwill. It needs no
 * check beyond being signed in, because it reaches exactly one account: the
 * one acting. Nothing is reassigned: handing pages to a named colleague would
 * mean showing a departing user the list of everyone else, and « Anonyme » is
 * what an erasure asks for anyway.
 */
export async function deleteOwnAccount(): Promise<AccountRefusal> {
  const username = await currentUsername();
  if (!username) return "Vous n'êtes pas connecté.";
  return erase(username);
}

/**
 * The DELETE itself: the `onDelete` of each relation does the rest —
 * memberships, sessions and pending link gone with the account, pages and
 * history staying, signed « Anonyme » (ADR 0024). One transaction beyond the
 * cascade: the field rights and form defaults naming this username live in
 * `Form.schema`, which no foreign key reaches (ADR 0024), so the sweep runs
 * here rather than trusting Postgres to have done it.
 */
async function erase(
  username: string,
  reassignToUsername?: string | null
): Promise<AccountRefusal> {
  return preservingAdministrator(username, async (tx) => {
    const user = await tx.user.findUnique({
      where: { username },
      select: { id: true, email: true },
    });
    if (!user) return;
    if (reassignToUsername) {
      await reassignOwnedPages(username, reassignToUsername, tx);
      await reassignOwnedForms(username, reassignToUsername, tx);
    }
    await tx.accountLink.deleteMany({ where: { email: user.email } });
    await tx.user.delete({ where: { id: user.id } });
    await sweepAclReferences(tx, {
      kind: "username",
      from: username,
      to: null,
    });
  });
}
