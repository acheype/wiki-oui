import {
  INVITATION_LIFETIME_DAYS,
  type InvitationReport,
  RESET_LIFETIME_DAYS,
} from "@/modules/accounts/link/invitations";
import {
  type DeliveredLink,
  deliver,
  openLink,
} from "@/modules/accounts/link/account-link";
import { assertAdmin } from "@/modules/permissions/person";
import { prisma } from "@/lib/prisma";

// How an administrator gets somebody in (docs/permissions.md § Naissance d'un
// compte): they never set a password, they hand over a single-use link. Every
// action here is an administrator's, and the check sits here rather than in
// the callers (ADR 0025). The link itself is minted next door, in
// modules/accounts/link/account-link.ts.

export interface InvitationOutcome {
  report: InvitationReport;
  /** One per address actually invited, for the administrator to copy. */
  links: (DeliveredLink & { email: string })[];
}

/**
 * Invites a list of addresses at once (docs/permissions.md § Naissance d'un
 * compte). An address that already holds an account is reported and left
 * alone; so is one whose invitation is still live — resending that one is a
 * action of its own, on its own line. An expired link is not: it opens
 * nothing any more, so pasting the address again simply invites afresh.
 */
export async function inviteAddresses(
  emails: readonly string[],
  groupSlug: string | null,
  invalid: readonly string[] = []
): Promise<InvitationOutcome> {
  await assertAdmin();
  const now = new Date();
  const [members, invited] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: [...emails] } },
      select: { email: true },
    }),
    prisma.accountLink.findMany({
      where: { email: { in: [...emails] }, expiresAt: { gt: now } },
      select: { email: true },
    }),
  ]);
  const hasAccount = new Set(members.map((user) => user.email));
  const hasLiveInvitation = new Set(invited.map((link) => link.email));

  const report: InvitationReport = {
    invited: [],
    alreadyMember: [],
    alreadyInvited: [],
    invalid: [...invalid],
  };
  const links: (DeliveredLink & { email: string })[] = [];

  for (const email of emails) {
    if (hasAccount.has(email)) {
      report.alreadyMember.push(email);
      continue;
    }
    if (hasLiveInvitation.has(email)) {
      report.alreadyInvited.push(email);
      continue;
    }
    const url = await openLink(email, INVITATION_LIFETIME_DAYS, groupSlug);
    report.invited.push(email);
    // Each link carries what became of its own mail: one verdict for the
    // batch would tell an address whose mail left that it failed.
    links.push({ email, ...(await deliver(email, url, "invitation")) });
  }
  return { report, links };
}

/** Mints a fresh link for a pending invitation — the old one stops working. */
export async function resendInvitation(email: string): Promise<DeliveredLink> {
  await assertAdmin();
  const existing = await prisma.accountLink.findUnique({ where: { email } });
  const url = await openLink(
    email,
    INVITATION_LIFETIME_DAYS,
    existing?.groupSlug ?? null
  );
  return deliver(email, url, "invitation");
}

export async function revokeInvitation(email: string): Promise<void> {
  await assertAdmin();
  await prisma.accountLink.deleteMany({ where: { email } });
}

/**
 * The reset an administrator triggers — « je lui renvoie un lien ». Same
 * primitive as an invitation, shorter fuse, and still no password set by
 * anyone but the person themselves.
 */
export async function createResetLink(
  username: string
): Promise<DeliveredLink | null> {
  await assertAdmin();
  const user = await prisma.user.findUnique({
    where: { username },
    select: { email: true, disabledAt: true },
  });
  // A disabled account gets no link: it would open on « ce lien n'est plus
  // valable », since a link never reopens an access somebody closed.
  if (!user || user.disabledAt) return null;
  const url = await openLink(user.email, RESET_LIFETIME_DAYS, null);
  return deliver(user.email, url, "reset");
}
