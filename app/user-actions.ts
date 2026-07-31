"use server";

// Server Actions of the accounts screen (docs/permissions.md § Les écrans).
// Reading them is an administrator's gesture — email addresses are shown here
// and nowhere else — and the check lives behind the door, in
// lib/accounts-db.ts, so none of these can forget it.

import {
  type AccountDeletionImpact,
  type AccountRefusal,
  type DeliveredLink,
  type InvitationOutcome,
  type PendingInvitation,
  type UserRow,
  accountDeletionImpact,
  createResetLink,
  deleteAccount,
  inviteAddresses,
  listPendingInvitations,
  listUsersWithGroups,
  resendInvitation,
  revokeInvitation,
  setAccountDisabled,
} from "@/lib/accounts-db";
import { parseAddressList } from "@/lib/invitations";
import { isMailerConfigured } from "@/lib/mailer";

export type UserError = { error: string };

export async function listUsers(): Promise<UserRow[]> {
  return listUsersWithGroups();
}

export async function listInvitations(): Promise<PendingInvitation[]> {
  return listPendingInvitations();
}

/**
 * Whether the wiki can send a link itself. The screens ask before they act:
 * with SMTP the link is on its way, without it the administrator is the
 * delivery — and both flows end on the same acceptance screen.
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
