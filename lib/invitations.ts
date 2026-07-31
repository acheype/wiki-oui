// Inviting people (docs/permissions.md § Naissance d'un compte): reading a
// pasted list of addresses and telling what came of it. Pure, no I/O — the
// links themselves are minted behind the door, in lib/accounts-db.ts — and
// client-safe, so the invite dialog can count the addresses as they are
// pasted rather than after a round trip.

import { z } from "zod";

/** The fortnight an invitation lasts, announced beside the link. */
export const INVITATION_LIFETIME_DAYS = 14;

/**
 * A password reset is the same primitive with a shorter fuse: the person is
 * at their keyboard asking for it, or an administrator is handing it over
 * right now — nobody waits a fortnight for either.
 */
export const RESET_LIFETIME_DAYS = 1;

/**
 * What became of one mail — the delivery, never the gesture: an invitation
 * whose mail failed is an invitation all the same, and the screen falls back
 * on the link it can always show. Declared here rather than in lib/mailer.ts
 * so the screens can name it without pulling an SMTP client into the browser.
 */
export type MailDelivery = "sent" | "not-configured" | "failed";

/** When a link minted now stops working. */
export function expiresIn(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export interface AddressList {
  /** Addresses, lowercased and each kept once, in order of first appearance. */
  emails: string[];
  /** What names no address, as it was typed, so it can be corrected. */
  invalid: string[];
}

// What separates two entries in what a mail client hands over. Spaces are not
// among them: they also separate a display name from its address.
const ENTRY_SEPARATORS = /[,;\n\r\t]+/;

// « Marie Durand <marie@asso.fr> » — the address is what the angle brackets
// hold, and the name in front is the mail client's, not ours to keep.
const ANGLE_BRACKETED = /<([^<>]*)>/g;

/**
 * Digests what comes out of a mail client (docs/permissions.md): commas,
 * semicolons, newlines and the `Nom <adresse>` form, with duplicates merged.
 * Tolerance stops at silence — a fragment that names no address is handed
 * back rather than dropped, since dropping it would invite nobody without
 * ever saying so.
 */
export function parseAddressList(text: string): AddressList {
  const emails = new Set<string>();
  const invalid = new Set<string>();

  for (const entry of text.split(ENTRY_SEPARATORS)) {
    const fragment = entry.trim();
    if (fragment === "") continue;
    for (const candidate of candidateAddresses(fragment)) {
      const email = candidate.trim().toLowerCase();
      if (z.email().safeParse(email).success) emails.add(email);
      else invalid.add(candidate.trim());
    }
  }
  return { emails: [...emails], invalid: [...invalid] };
}

/**
 * What one entry offers as an address. Angle brackets win when they are
 * there; otherwise every word carrying an @ is one, and a display name left
 * beside it is understood rather than reported. An entry with no @ at all is
 * its own candidate, so the refusal quotes what was typed.
 */
function candidateAddresses(fragment: string): string[] {
  const bracketed = [...fragment.matchAll(ANGLE_BRACKETED)].map(
    (match) => match[1]
  );
  if (bracketed.length > 0) return bracketed;

  const words = fragment.split(/\s+/);
  const addresses = words.filter((word) => word.includes("@"));
  return addresses.length > 0 ? addresses : [fragment];
}

export interface InvitationReport {
  /** Links minted just now. */
  invited: string[];
  /** Addresses that already hold an account: flagged, never recreated. */
  alreadyMember: string[];
  /** Addresses whose pending invitation was left as it was. */
  alreadyInvited: string[];
  /** Fragments that named no address. */
  invalid: string[];
}

/**
 * What the screen reads back after a bulk invitation: one line per thing that
 * happened, and none for what did not. Addresses are named — a count alone
 * would leave the administrator to work out which of forty they must chase.
 */
export function invitationSummaryLines(report: InvitationReport): string[] {
  const lines = [
    report.invited.length === 0
      ? "Aucune invitation créée."
      : `${count(report.invited, "invitation créée", "invitations créées")}.`,
  ];
  if (report.alreadyMember.length > 0) {
    lines.push(
      listed(report.alreadyMember, "adresse a déjà un compte", "adresses ont déjà un compte")
    );
  }
  if (report.alreadyInvited.length > 0) {
    lines.push(
      listed(
        report.alreadyInvited,
        "invitation était déjà en attente",
        "invitations étaient déjà en attente"
      )
    );
  }
  if (report.invalid.length > 0) {
    lines.push(
      listed(
        report.invalid,
        "fragment n'est pas une adresse",
        "fragments ne sont pas des adresses"
      )
    );
  }
  return lines;
}

function count(items: string[], one: string, many: string): string {
  return `${items.length} ${items.length > 1 ? many : one}`;
}

function listed(items: string[], one: string, many: string): string {
  return `${count(items, one, many)} : ${items.join(", ")}`;
}
