import { createHash, randomBytes } from "node:crypto";
import {
  INVITATION_TOKEN_PARAM,
  type LinkPurpose,
  type MailFailure,
  expiresIn,
} from "@/modules/accounts/link/invitations";
import { sendAccountLink } from "@/modules/accounts/link/mailer";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/site-url";
import { authPagePath } from "@/wiki.config";

// The single-use link, and nothing else (docs/permissions.md § Comptes): how
// one is minted, stored, and put in the post. Who may ask for one is not
// decided here — an administrator invites through admin/invite.ts, a stranger
// asks for a reset through link-actions.ts, and each of those two answers for
// its own rung.
//
// The same link answers three needs: an invitation when the address holds no
// account, a reset when it does. Which one it is, nobody stores — the accounts
// table already knows.

/**
 * A link is a secret in an address bar, so it is minted like one and stored
 * like one: 32 random bytes for what travels, its SHA-256 for what the
 * database keeps. A stolen dump then opens nothing, and nobody — including an
 * administrator reading the table — can replay a link they did not receive.
 */
function mintToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: fingerprint(token) };
}

export function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Puts a live link on an address, replacing whatever was there: one door per
 * address, never two. This is where the duplicates of a pasted list actually
 * merge — the parser only reads, the unique index decides.
 */
export async function openLink(
  email: string,
  lifetimeDays: number,
  groupSlug: string | null
): Promise<string> {
  const { token, tokenHash } = mintToken();
  const expiresAt = expiresIn(new Date(), lifetimeDays);
  await prisma.accountLink.upsert({
    where: { email },
    create: { email, tokenHash, expiresAt, groupSlug },
    update: { tokenHash, expiresAt, groupSlug },
  });
  // The system page that accepts the link is the `invitation` wiki page, so the
  // token travels as a query parameter: a segment behind the slug would be
  // read as a page handler (ADR 0028).
  const path = `${authPagePath("invitation")}?${INVITATION_TOKEN_PARAM}=${token}`;
  return absoluteUrl(path);
}

/** A minted link, and what became of the attempt to deliver it by mail. */
export interface DeliveredLink {
  url: string;
  /** null once the mail left; otherwise why it did not. */
  failure: MailFailure | null;
}

export async function deliver(
  email: string,
  url: string,
  purpose: LinkPurpose
): Promise<DeliveredLink> {
  return { url, failure: await sendAccountLink({ to: email, url, purpose }) };
}
