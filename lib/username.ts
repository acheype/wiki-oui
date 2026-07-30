// The identity rules of an account (docs/permissions.md § Identité). The
// username is a public identifier, so it obeys the same pattern as a page
// slug (ADR 0001): derived from the display name, personalisable before
// saving, then frozen — the fixed-identity move of ADR 0014.

import { SLUG_PATTERN, slugify } from "./slug";

/** The identifier a display name suggests. "" when nothing survives. */
export function deriveUsername(displayName: string): string {
  return slugify(displayName);
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
