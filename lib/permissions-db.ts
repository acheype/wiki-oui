import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { currentGroupSlugs } from "@/lib/groups-db";
import { type Actor, type Identity, isAdmin } from "@/lib/permissions";

// The database side of the rules (docs/permissions.md): who is acting, and
// which access level that puts them at. The rules themselves — and the `where`
// clauses that carry them into SQL — are pure, and live in permissions.ts.
//
// The groups that actor ends up in are resolved next door, in lib/groups-db.ts,
// which reads back the session from here: the two modules name each other, and
// only ever inside a function body, once a request is being served.

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

/**
 * Who is acting, with the groups that decide what they may see — the one
 * value every rule of permissions.ts reads. Memoized for the request like
 * everything derived from the session, and resolved by the access layer
 * itself rather than passed in by a caller (ADR 0025): an argument can be
 * forgotten, and a forgotten actor reads as a visitor, which is the one
 * mistake that fails open.
 */
export const currentActor = cache(
  async (): Promise<Actor> => ({
    username: await currentUsername(),
    groupSlugs: await currentGroupSlugs(),
  })
);

/** The administrator access level: a membership of @Admins (ADR 0023). */
export async function isCurrentAdmin(): Promise<boolean> {
  return isAdmin(await currentActor());
}

const ADMINISTRATORS_ONLY = "Réservé aux administrateurs.";

/**
 * The check every action of the two administration screens passes, at the
 * door rather than in each caller (ADR 0025) — lib/groups-db.ts and
 * lib/accounts-db.ts both ask for it by name.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isCurrentAdmin())) throw new Error(ADMINISTRATORS_ONLY);
}
