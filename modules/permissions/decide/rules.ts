// The decisions themselves, private to permissions by their depth (ADR 0029):
// who may read, who may write, who owns — plus the `where` clauses that carry
// the same verdicts into SQL. Pure logic, no I/O, so a rule can be asserted on
// plain data.
//
// Nothing here is callable from another module, and that is the point (ADR
// 0025, amendment of 2026-08-24): every one of these takes the person as its
// first parameter, and a parameter can be forgotten — a forgotten person reads
// as a visitor, the one mistake that fails open. What the rest of the wiki
// gets instead is the `current*` forms of person.ts, which resolve the person
// themselves and therefore cannot be handed the wrong one.

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  ADMINS_GROUP,
  type AccessRule,
  type PagePermissions,
  type PageRights,
  type PermKind,
  type Person,
  pageRule,
} from "@/modules/permissions/rules";

export function isSignedIn(person: Person): boolean {
  return person.username !== null;
}

export function isAdmin(person: Person): boolean {
  return person.groupSlugs.includes(ADMINS_GROUP.slug);
}

/** Does this person fall inside the scope, and the list it may open? */
export function ruleAllows(person: Person, rule: AccessRule): boolean {
  switch (rule.scope) {
    case "everyone":
      return true;
    case "authenticated":
      return isSignedIn(person);
    case "restricted":
      return (
        (person.username !== null &&
          (rule.usernames ?? []).includes(person.username)) ||
        (rule.groupSlugs ?? []).some((slug) => person.groupSlugs.includes(slug))
      );
  }
}

/**
 * « Son propriétaire ou un administrateur », wherever it is posed — under the
 * rights of a page, and under the definition of a form. One function because
 * it is one rule: what changes from one to the next is only what it is posed
 * on, and two spellings of it would disagree the day one of them moved.
 *
 * The null test is not a formality: a visitor's `username` is null too, so
 * comparing the two straight would hand every unowned subject — every seeded
 * page — to anyone at all.
 */
export function ownsSubject(person: Person, ownerUsername: string | null): boolean {
  if (isAdmin(person)) return true;
  return ownerUsername !== null && person.username === ownerUsername;
}

/** The floor under every right on a page. */
export function ownsPage(
  person: Person,
  page: Pick<PageRights, "ownerUsername">
): boolean {
  return ownsSubject(person, page.ownerUsername);
}

/**
 * Above the floor, the scope decides and nothing else. « Une page sans
 * propriétaire n'est modifiable que par les administrateurs » is a
 * consequence of an empty floor under the default scope, not a rule to add
 * here: adding it would make an unowned page refuse an open write scope.
 */
export function canWrite(person: Person, page: PageRights): boolean {
  if (ownsPage(person, page)) return true;
  return ruleAllows(person, pageRule(page, "WRITE"));
}

/**
 * Writing implies reading, settled here rather than forbidden in the widget:
 * an interface refusing the combination would leave an author stuck between
 * two saves, where the check simply never disagrees with itself.
 */
export function canRead(person: Person, page: PageRights): boolean {
  if (canWrite(person, page)) return true;
  return ruleAllows(person, pageRule(page, "READ"));
}

export function permissionsOn(person: Person, page: PageRights): PagePermissions {
  return {
    write: canWrite(person, page),
    structuring: ownsPage(person, page),
    address: isAdmin(person),
  };
}

// --- the same decisions, as a `where` ----------------------------------------

// Two moments, never a load followed by a sort (docs/permissions.md): SQL says
// which pages, memory says which fields inside them. The clause is built here,
// beside the unit decision, and a test holds the two to the same verdict on
// the same cases — the one thing that could go wrong silently is a filter that
// disagrees with the check.
//
// The Prisma import is type-only: this module stays free of I/O, and the
// clause it returns is a plain object until a query is handed it.

/**
 * The column a sense's scope lives in. Spelled here as well as in rules.ts,
 * where pageRule reads it: two lines are a smaller price than making an
 * implementation detail of the storage cross the seam, and a reexport from a
 * private file is what module-seam refuses.
 */
const SCOPE_COLUMN = { READ: "readScope", WRITE: "writeScope" } as const;

/** The listed-in-the-ACL predicates, empty for a visitor — who is in none. */
function aclBranches(person: Person): Prisma.PageAclWhereInput[] {
  const branches: Prisma.PageAclWhereInput[] = [];
  if (person.username !== null) branches.push({ username: person.username });
  if (person.groupSlugs.length > 0) {
    branches.push({ groupSlug: { in: [...person.groupSlugs] } });
  }
  return branches;
}

/** What the scope of one sense lets this person through by. */
function scopeBranches(person: Person, kind: PermKind): Prisma.PageWhereInput[] {
  const scope = SCOPE_COLUMN[kind];
  const branches: Prisma.PageWhereInput[] = [{ [scope]: "everyone" }];
  if (isSignedIn(person)) branches.push({ [scope]: "authenticated" });
  const listed = aclBranches(person);
  if (listed.length > 0) {
    // On a public page the first predicate answers and the EXISTS is never
    // run; the scope is repeated here so a row left over from an earlier
    // « seulement » can never grant what the scope no longer reads.
    branches.push({ [scope]: "restricted", acls: { some: { kind, OR: listed } } });
  }
  return branches;
}

/** The write predicates, which the read clause also carries — writing implies reading. */
function writeBranches(person: Person): Prisma.PageWhereInput[] {
  const branches: Prisma.PageWhereInput[] = [];
  // No branch for a visitor: `ownerUsername = NULL` would match every unowned
  // page — the null coincidence ownsPage guards against.
  if (person.username !== null) branches.push({ ownerUsername: person.username });
  branches.push(...scopeBranches(person, "WRITE"));
  return branches;
}

/** Which pages this person may write — `{}` for an administrator: all of them. */
export function writableWhere(person: Person): Prisma.PageWhereInput {
  if (isAdmin(person)) return {};
  return { OR: writeBranches(person) };
}

/** Which pages this person may read, the counterpart of canRead. */
export function readableWhere(person: Person): Prisma.PageWhereInput {
  if (isAdmin(person)) return {};
  return { OR: [...writeBranches(person), ...scopeBranches(person, "READ")] };
}

/**
 * « This clause, or that one » — the only way these clauses are ever joined.
 *
 * Written by hand, that join is a trap: a person who may read everything gets
 * the empty clause `{}`, and **Prisma drops an empty branch from an `OR`**.
 * The branch that meant « everything » disappears, leaving the others to
 * narrow what should not have been narrowed — silently, and only for whoever
 * has the most rights, which is why it went unnoticed for days.
 *
 * Here the empty clause absorbs instead, as « everything or anything » does in
 * logic. An ESLint rule refuses `OR:` around these clauses so that this
 * function is not merely the recommended way but the only one left.
 */
export function anyClause(
  clauses: readonly Prisma.PageWhereInput[]
): Prisma.PageWhereInput {
  if (clauses.some(isEverything)) return {};
  return { OR: [...clauses] };
}

/** No condition at all, which SQL-side means every row — never « no row ». */
function isEverything(clause: Prisma.PageWhereInput): boolean {
  return Object.keys(clause).length === 0;
}

/**
 * What a list filters on: what the person may read, plus the handful of pages
 * that answer to everyone whatever is posed on them (the account system pages —
 * signing in has to work where the content refuses).
 */
export function listReadableWhere(
  person: Person,
  alwaysReadable: readonly string[]
): Prisma.PageWhereInput {
  return anyClause([
    readableWhere(person),
    { slug: { in: [...alwaysReadable] } },
  ]);
}

