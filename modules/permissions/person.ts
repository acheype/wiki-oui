import { headers } from "next/headers";
import type { Prisma } from "@/lib/generated/prisma/client";
import { cache } from "react";
import { auth } from "@/modules/accounts/auth";
import { currentGroupSlugs } from "@/modules/permissions/groups-queries";
import type {
  AccessRule,
  Identity,
  PagePermissions,
  PageRights,
  Person,
} from "@/modules/permissions/rules";
import {
  canRead,
  canWrite,
  isAdmin,
  readableWhere,
  ownsSubject,
  permissionsOn,
  ruleAllows,
  writableWhere,
} from "@/modules/permissions/decide/rules";

// The one interface the rest of the wiki decides through (docs/permissions.md):
// who is acting, and every verdict about them, already taken. The rules
// themselves — and the `where` clauses that carry them into SQL — are pure and
// live in decide/rules.ts, private to this module by their depth (ADR 0029).
//
// Every form here resolves the person itself rather than taking one (ADR 0025,
// amendment of 2026-08-24): an argument can be forgotten, and a forgotten
// person reads as a visitor, which is the one mistake that fails open. It also
// means each of these reads the session, so none of them runs in a client
// component — sorting rows in memory that were read without a right is not
// merely discouraged, it cannot be written.
//
// The groups a person ends up in are resolved next door, in
// groups-queries.ts, which reads back the session from here: the two files
// name each other, and only ever inside a function body, once a request is
// being served.

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
 * forgotten, and a forgotten person reads as a visitor, which is the one
 * mistake that fails open.
 */
export const currentPerson = cache(
  async (): Promise<Person> => ({
    username: await currentUsername(),
    groupSlugs: await currentGroupSlugs(),
  })
);

/** The administrator access level: a membership of @Admins (ADR 0023). */
export async function isCurrentAdmin(): Promise<boolean> {
  return isAdmin(await currentPerson());
}

const ADMINISTRATORS_ONLY = "Réservé aux administrateurs.";

/**
 * The check every action of the two administration system pages passes, at the
 * door rather than in each caller (ADR 0025) — groups-queries.ts and
 * modules/accounts/queries/queries.ts both ask for it by name.
 */
export async function assertAdmin(): Promise<void> {
  if (!(await isCurrentAdmin())) throw new Error(ADMINISTRATORS_ONLY);
}

// --- the verdicts, for whoever is asking now ---------------------------------

/**
 * Whether the current person may read this page — canRead with the one person
 * it could ever be asked about.
 */
export async function currentCanRead(page: PageRights): Promise<boolean> {
  return canRead(await currentPerson(), page);
}

/** Whether the current person may write this page. */
export async function currentCanWrite(page: PageRights): Promise<boolean> {
  return canWrite(await currentPerson(), page);
}

/**
 * « Son propriétaire ou un administrateur », posed on whatever carries an
 * owner: a page, read straight from its rights, or a form, which hands its
 * `ownerUsername` over on its own.
 */
export async function currentOwns(
  subject: Pick<PageRights, "ownerUsername"> | string | null
): Promise<boolean> {
  const ownerUsername = typeof subject === "object" && subject !== null
    ? subject.ownerUsername
    : subject;
  return ownsSubject(await currentPerson(), ownerUsername);
}

/** The three rungs at once, so a system page cannot answer half the question. */
export async function currentPermissions(page: PageRights): Promise<PagePermissions> {
  return permissionsOn(await currentPerson(), page);
}

/**
 * Whether a rule that stands on its own lets the current person through — the
 * wiki's `createPage` and `createForm`, which no page carries.
 *
 * Administrators pass every rule, and that is settled here rather than at each
 * site: their access is an invariant of the model (ADR 0023), not a scope one
 * may forget to name. Written by hand, this check was spelled `isAdmin(person)
 * || ruleAllows(person, rule)` in three places, which is three chances to drop
 * the first half.
 */
export async function currentAllows(rule: AccessRule): Promise<boolean> {
  const person = await currentPerson();
  return isAdmin(person) || ruleAllows(person, rule);
}

/** Which pages the current person may write, as a `where` — `{}` for an administrator. */
export async function currentWritableWhere(): Promise<Prisma.PageWhereInput> {
  return writableWhere(await currentPerson());
}

/**
 * What a list filters on, in SQL and never afterwards (docs/permissions.md
 * § Deux temps) — so that counters, pagination and « effacer les filtres »
 * come out right mechanically, working on what actually arrived.
 *
 * Every page is in scope of it: no slug answers to everyone whatever is posed
 * on it (issue #20). `{}` for an administrator, which is why it is never
 * joined by hand — see the wikioui/access-clauses ESLint rule.
 */
export async function currentReadableWhere(): Promise<Prisma.PageWhereInput> {
  return readableWhere(await currentPerson());
}
