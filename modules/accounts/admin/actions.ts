"use server";

// Server Actions of the accounts system page (docs/permissions.md § Les
// pages système). Reading them is an administrator's action — email
// addresses are shown here and nowhere else — and the check lives behind
// the guards, in the files beside this one, so none of these can forget it.
//
// The two at the end are the exception, and are not called from that system page:
// erasing one's own account belongs to the person, not to an administrator's
// goodwill, and it can reach no account but the one signed in.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  type PendingInvitation,
  type UserRow,
  listPendingInvitations,
  listUsersWithGroups,
} from "@/modules/accounts/access/guards";
import {
  type InvitationOutcome,
  createResetLink,
  inviteAddresses,
  resendInvitation,
  revokeInvitation,
} from "@/modules/accounts/admin/invite";
import {
  type AccountDeletionImpact,
  accountDeletionImpact,
  deleteAccount,
  deleteOwnAccount,
  ownDeletionImpact,
  setAccountDisabled,
} from "@/modules/accounts/admin/lifecycle";
import type { AccountRefusal } from "@/modules/accounts/admin/rules";
import { auth } from "@/modules/accounts/auth";
import type { DeliveredLink } from "@/modules/accounts/invitation/link";
import { parseAddressList } from "@/modules/accounts/invitation/rules";
import { isMailerConfigured } from "@/modules/accounts/invitation/mailer";
import { currentUsername } from "@/modules/permissions/person";
import { wikiConfig } from "@/wiki.config";

export type UserError = { error: string };

export async function listUsers(): Promise<UserRow[]> {
  return listUsersWithGroups();
}

export async function listInvitations(): Promise<PendingInvitation[]> {
  return listPendingInvitations();
}

/**
 * Whether the wiki can send a link itself. The system pages ask before they
 * act: with SMTP the link is on its way, without it the administrator is the
 * delivery — and both flows end on the same acceptance page.
 */
export async function canSendMail(): Promise<boolean> {
  return isMailerConfigured();
}

/**
 * A bulk invitation, from what a mail client left on the clipboard. The paste
 * is read again here rather than trusted from the browser: the dialog parses
 * it too, but only to count the addresses under the field as they are typed.
 */
export async function invitePeople(input: {
  pasted: string;
  groupSlug: string | null;
}): Promise<InvitationOutcome> {
  const { emails, invalid } = parseAddressList(input.pasted);
  return inviteAddresses(emails, input.groupSlug, invalid);
}

export async function resendInvite(email: string): Promise<DeliveredLink> {
  return resendInvitation(email);
}

export async function revokeInvite(email: string): Promise<void> {
  return revokeInvitation(email);
}

/** An administrator never sets a password: they hand over a link. */
export async function sendResetLink(
  username: string
): Promise<DeliveredLink | null> {
  return createResetLink(username);
}

export async function setUserDisabled(
  username: string,
  disabled: boolean
): Promise<UserError | void> {
  const refusal = await setAccountDisabled(username, disabled);
  if (refusal) return { error: refusal };
}

export async function getDeletionImpact(
  username: string
): Promise<AccountDeletionImpact> {
  return accountDeletionImpact(username);
}

export async function deleteUser(
  username: string,
  reassignToUsername: string | null
): Promise<UserError | void> {
  const refusal: AccountRefusal = await deleteAccount(
    username,
    reassignToUsername
  );
  if (refusal) return { error: refusal };
}

/**
 * Whose session this is, so the accounts list can tell one line from the
 * others: on your own, disabling is not offered and erasing is the RGPD
 * action rather than an administrator's.
 */
export async function signedInUsername(): Promise<string | null> {
  return currentUsername();
}

/** What the person's own erasure would leave behind, for the modal. */
export async function getOwnDeletionImpact(): Promise<AccountDeletionImpact | null> {
  return ownDeletionImpact();
}

/**
 * The droit à l'effacement, exercised by whoever holds the account. The
 * sessions went with it — `onDelete: Cascade` — so what is left to do is
 * clear the cookie that pointed at one, and land the visitor on the home
 * page, where the wiki now reads them like anyone else arriving.
 */
export async function deleteOwnUser(): Promise<UserError | void> {
  const refusal: AccountRefusal = await deleteOwnAccount();
  if (refusal) return { error: refusal };

  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // The session row is already gone with the account: there is nothing to
    // sign out of, and a cookie pointing at nothing reads as a visitor.
  }
  revalidatePath("/", "layout");
  redirect(`/${wikiConfig.homeSlug}`);
}
