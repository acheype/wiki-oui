import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import type { Identity } from "@/lib/permissions";

// The database side of the rules (docs/permissions.md): who is acting, and —
// once the rights land — the `where` clauses that decide what they see. The
// groups that actor ends up in are resolved next door, in lib/groups-db.ts.

/**
 * Who the current HTTP request comes from, memoized for its duration with
 * React's cache() — the pattern getPageWithCurrent already uses. What is
 * derived from an account is deliberately never carried in the session:
 * removing someone from a group must take effect at once, not when their
 * session is renewed.
 */
const currentSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);

/**
 * The username stamped on what is written now — null for a visitor, which the
 * wiki reads back as "Anonyme". The access layer resolves it itself (ADR
 * 0025) rather than trusting a caller to pass it.
 */
export async function currentUsername(): Promise<string | null> {
  return (await currentSession())?.user.username ?? null;
}

/** The signed-in person as the interface names them, null for a visitor. */
export async function currentIdentity(): Promise<Identity | null> {
  const session = await currentSession();
  if (!session?.user.username) return null;
  return { username: session.user.username, name: session.user.name };
}
