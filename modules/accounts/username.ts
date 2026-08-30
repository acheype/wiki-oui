// The identity rules of an account (docs/permissions.md § Identité). The
// username is a public identifier, so it obeys the same pattern as a page
// slug (ADR 0001): derived from the display name, personalisable before
// saving, then frozen — the fixed-identity move of ADR 0014.

import { SLUG_PATTERN, slugify } from "@/lib/slug";

/** The identifier a display name suggests. "" when nothing survives. */
export function deriveUsername(name: string): string {
  return slugify(name);
}

/**
 * Given to BetterAuth as its `usernameValidator`, so the library refuses at
 * sign-up what the wiki could not put in a URL. A collision is answered by an
 * invitation to personalise, never by an automatic suffix — hence no
 * uniqueness concern here: that is the column's unique index.
 */
export function isValidUsername(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * Sign-in asks for one thing, not two: "your email or your identifier". The
 * @ is what tells them apart — an identifier follows the slug pattern, which
 * has no room for one.
 */
export function signInMethod(value: string): "email" | "username" {
  return value.trim().includes("@") ? "email" : "username";
}

/**
 * One label for every content without an identified owner or author, whatever
 * the reason — older than the accounts, written by a visitor on an open wiki,
 * or an erased account (docs/permissions.md). The wiki does not tell those
 * cases apart: it would do nothing with the distinction, and staying silent
 * serves a requested erasure better than announcing it happened.
 */
export const ANONYMOUS = "Anonyme";

/** Reading an owner or an author, either of whom may be nobody. */
export function displayName(
  person: { name: string } | null | undefined
): string {
  return person?.name ?? ANONYMOUS;
}
