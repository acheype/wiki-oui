// Inviting people (docs/permissions.md § Naissance d'un compte): reading a
// pasted list of addresses and telling what came of it. Pure, no I/O — the
// links themselves are minted next door, in
// modules/accounts/invitation/link.ts — and client-safe, so the invite
// dialog can count the addresses as they are pasted rather than after a
// round trip.

import { z } from "zod";
import { plural } from "@/lib/format";

/** The fortnight an invitation lasts, announced beside the link. */
export const INVITATION_LIFETIME_DAYS = 14;

/**
 * The query parameter the link carries its token in. The system page that accepts
 * it is a wiki page (ADR 0028), and what follows the slug of a page is one of
 * its handlers — so the token can only travel in the query string.
 */
export const INVITATION_TOKEN_PARAM = "jeton";

/**
 * A password reset is the same primitive with a shorter fuse: the person is
 * at their keyboard asking for it, or an administrator is handing it over
 * right now — nobody waits a fortnight for either.
 */
export const RESET_LIFETIME_DAYS = 1;

/**
 * Why a mail did not leave, or null when it did — the delivery, never the
 * action: an invitation whose mail failed is an invitation all the same, and
 * the system page falls back on the link it can always show. Declared here rather
 * than in modules/accounts/invitation/mailer.ts so the system pages can name it without pulling an SMTP
 * client into the browser.
 *
 * `detail` is what the server answered. It is shown to an administrator, who
 * configured the thing and can fix it, and never to anyone else: it names
 * hosts and accounts, and a stranger can do nothing with it but learn.
 */
export type MailFailure =
  | { cause: "not-configured" }
  | { cause: "refused"; detail: string };

/** What a failed delivery says to whoever is not an administrator. */
export const MAIL_FAILURE_NOTICE =
  "Le wiki n'a pas réussi à envoyer le courriel. Prévenez un administrateur du wiki : son serveur d'envoi ne répond pas.";

/**
 * Which of the two a link turns out to be. Not a stored kind: the accounts
 * table decides it, the address being invited when it holds no account and
 * reset when it does — one primitive, read twice.
 */
export type LinkPurpose = "invitation" | "reset";

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
 * What the system page reads back after a bulk invitation: one line per thing that
 * happened, and none for what did not. Addresses are named — a count alone
 * would leave the administrator to work out which of forty they must chase.
 */
export function invitationSummaryLines(report: InvitationReport): string[] {
  const lines = [
    report.invited.length === 0
      ? "Aucune invitation créée."
      : `${plural(report.invited.length, "invitation créée", "invitations créées")}.`,
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

/** A count and the addresses behind it: forty names, forty ways to look. */
function listed(items: string[], one: string, many: string): string {
  return `${plural(items.length, one, many)} : ${items.join(", ")}`;
}
