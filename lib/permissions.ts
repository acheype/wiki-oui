// Where every authorization decision lives (docs/permissions.md): pure logic,
// no I/O, so a rule can be asserted on plain data. The database side —
// resolving who is acting, turning a rule into a `where` — lives in
// permissions-db.ts, the pairing this project uses throughout (slug-rename,
// field-rename, entry-title).
//
// The model in two sentences: BetterAuth authenticates, WikiOui authorizes
// (ADR 0023); and a right is a scope, optionally completed by a list.

import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * The administrators' group. Administration is a membership, never a `role`
 * column (ADR 0023): two sources of truth on "who is an admin" would disagree
 * one day, silently. Protected like a special page — never deletable, never
 * renamable, never empty — and it accepts people only, so that the list of
 * administrators reads at a glance.
 */
export const ADMINS_GROUP = { slug: "admins", name: "Admins" } as const;

/**
 * The floor every gesture on an account or a membership stops at: a wiki
 * whose administrators have all gone is one nobody can take back, since the
 * installation screen is a one-way door (ADR 0027). One sentence, because it
 * is one rule — removing the last member of @Admins, disabling them and
 * deleting them are three ways to the same place.
 */
export const LAST_ADMIN_REFUSAL = "Ce wiki doit garder au moins un administrateur.";

/**
 * A signed-in person as the interface names them. The display name signs
 * contributions, the identifier is what the account screens link to — and
 * the email is in neither, it belongs to gerer-utilisateurs alone.
 */
export interface Identity {
  username: string;
  name: string;
}

// --- what a right is ---------------------------------------------------------

/**
 * The three exclusive scopes (docs/permissions.md § Le droit). There is
 * deliberately no « Administrateurs » scope: putting it at the same rank
 * would suggest the other two exclude them, when their access is an
 * invariant — the note beside the widget says so instead.
 */
export const SCOPES = ["everyone", "authenticated", "restricted"] as const;
export type Scope = (typeof SCOPES)[number];

/** How each scope reads in the widget, in the order it offers them. */
export const SCOPE_LABELS: Record<Scope, string> = {
  everyone: "Tout le monde",
  authenticated: "Les personnes connectées",
  restricted: "Seulement",
};

/** The two senses a right is posed in. Uppercase: it is a Postgres enum. */
export const PERM_KINDS = ["READ", "WRITE"] as const;
export type PermKind = (typeof PERM_KINDS)[number];

/**
 * One right, as the widget poses it and as the configuration writes it: a
 * scope, and the two lists only the « seulement » scope ever reads. The lists
 * hold usernames and group slugs, never ids (ADR 0024).
 */
export interface AccessRule {
  scope: Scope;
  usernames?: readonly string[];
  groupSlugs?: readonly string[];
}

/** A row of `PageAcl`: a person or a group, never both. */
export interface AclEntry {
  kind: PermKind;
  username: string | null;
  groupSlug: string | null;
}

/** What deciding on a page needs, and nothing more — no title, no content. */
export interface PageRights {
  ownerUsername: string | null;
  readScope: Scope;
  writeScope: Scope;
  acls: readonly AclEntry[];
}

// --- who is acting -----------------------------------------------------------

/**
 * The person acting at a given instant, signed in or not. Their access level
 * is not configured, it is observed: no session is a visitor, a session is a
 * user, and a membership of @Admins is an administrator.
 */
export interface Actor {
  username: string | null;
  /** Effective groups, nesting already resolved by lib/groups.ts. */
  groupSlugs: readonly string[];
}

/** Nobody in particular — the level every wiki always has someone at. */
export const VISITOR: Actor = { username: null, groupSlugs: [] };

export function isSignedIn(actor: Actor): boolean {
  return actor.username !== null;
}

export function isAdmin(actor: Actor): boolean {
  return actor.groupSlugs.includes(ADMINS_GROUP.slug);
}

// --- the decisions -----------------------------------------------------------

/** Does this actor fall inside the scope, and the list it may open? */
export function ruleAllows(actor: Actor, rule: AccessRule): boolean {
  switch (rule.scope) {
    case "everyone":
      return true;
    case "authenticated":
      return isSignedIn(actor);
    case "restricted":
      return (
        (actor.username !== null &&
          (rule.usernames ?? []).includes(actor.username)) ||
        (rule.groupSlugs ?? []).some((slug) => actor.groupSlugs.includes(slug))
      );
  }
}

/** The column a sense's scope lives in, named once for the check and the clause. */
const SCOPE_COLUMN = { READ: "readScope", WRITE: "writeScope" } as const;

/** The page's right in one sense, read back as the widget poses it. */
export function pageRule(page: PageRights, kind: PermKind): AccessRule {
  const listed = page.acls.filter((acl) => acl.kind === kind);
  return {
    scope: page[SCOPE_COLUMN[kind]],
    usernames: listed.flatMap((acl) => (acl.username ? [acl.username] : [])),
    groupSlugs: listed.flatMap((acl) => (acl.groupSlug ? [acl.groupSlug] : [])),
  };
}

/**
 * The floor under every right on a page. The null test is not a formality: a
 * visitor's `username` is null too, so comparing the two straight would hand
 * every unowned page — every seeded one — to anyone at all.
 */
export function ownsPage(
  actor: Actor,
  page: Pick<PageRights, "ownerUsername">
): boolean {
  if (isAdmin(actor)) return true;
  return page.ownerUsername !== null && actor.username === page.ownerUsername;
}

/**
 * Above the floor, the scope decides and nothing else. « Une page sans
 * propriétaire n'est modifiable que par les administrateurs » is a
 * consequence of an empty floor under the default scope, not a rule to add
 * here: adding it would make an unowned page refuse an open write scope.
 */
export function canWrite(actor: Actor, page: PageRights): boolean {
  if (ownsPage(actor, page)) return true;
  return ruleAllows(actor, pageRule(page, "WRITE"));
}

/**
 * Writing implies reading, settled here rather than forbidden in the widget:
 * an interface refusing the combination would leave an author stuck between
 * two saves, where the check simply never disagrees with itself.
 */
export function canRead(actor: Actor, page: PageRights): boolean {
  if (canWrite(actor, page)) return true;
  return ruleAllows(actor, pageRule(page, "READ"));
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

/** The listed-in-the-ACL predicates, empty for a visitor — who is in none. */
function aclBranches(actor: Actor): Prisma.PageAclWhereInput[] {
  const branches: Prisma.PageAclWhereInput[] = [];
  if (actor.username !== null) branches.push({ username: actor.username });
  if (actor.groupSlugs.length > 0) {
    branches.push({ groupSlug: { in: [...actor.groupSlugs] } });
  }
  return branches;
}

/** What the scope of one sense lets this actor through by. */
function scopeBranches(actor: Actor, kind: PermKind): Prisma.PageWhereInput[] {
  const scope = SCOPE_COLUMN[kind];
  const branches: Prisma.PageWhereInput[] = [{ [scope]: "everyone" }];
  if (isSignedIn(actor)) branches.push({ [scope]: "authenticated" });
  const listed = aclBranches(actor);
  if (listed.length > 0) {
    // On a public page the first predicate answers and the EXISTS is never
    // run; the scope is repeated here so a row left over from an earlier
    // « seulement » can never grant what the scope no longer reads.
    branches.push({ [scope]: "restricted", acls: { some: { kind, OR: listed } } });
  }
  return branches;
}

/** The write predicates, which the read clause also carries — writing implies reading. */
function writeBranches(actor: Actor): Prisma.PageWhereInput[] {
  const branches: Prisma.PageWhereInput[] = [];
  // No branch for a visitor: `ownerUsername = NULL` would match every unowned
  // page — the null coincidence ownsPage guards against.
  if (actor.username !== null) branches.push({ ownerUsername: actor.username });
  branches.push(...scopeBranches(actor, "WRITE"));
  return branches;
}

/** Which pages this actor may write — `{}` for an administrator: all of them. */
export function writableWhere(actor: Actor): Prisma.PageWhereInput {
  if (isAdmin(actor)) return {};
  return { OR: writeBranches(actor) };
}

/** Which pages this actor may read, the counterpart of canRead. */
export function readableWhere(actor: Actor): Prisma.PageWhereInput {
  if (isAdmin(actor)) return {};
  return { OR: [...writeBranches(actor), ...scopeBranches(actor, "READ")] };
}

// --- what a page stores ------------------------------------------------------

/** The columns and rows a page carries its rights in, ready to be written. */
export interface StoredRights {
  readScope: Scope;
  writeScope: Scope;
  acls: AclEntry[];
}

/** The rows one rule turns into. A scope other than « seulement » has none. */
export function aclEntries(rule: AccessRule, kind: PermKind): AclEntry[] {
  if (rule.scope !== "restricted") return [];
  return [
    ...(rule.usernames ?? []).map((username) => ({
      kind,
      username,
      groupSlug: null,
    })),
    ...(rule.groupSlugs ?? []).map((groupSlug) => ({
      kind,
      username: null,
      groupSlug,
    })),
  ];
}

/**
 * A page's rights at its creation: the wiki's defaults, copied — never linked
 * Both senses at once, since a page carries both: what the modal saves, and
 * — the wiki's defaults being two rules like any other — what a page is born
 * with, copied and never linked (ADR 0026). One function, because copying a
 * default and posing a right by hand write exactly the same thing.
 */
export function storedRights(read: AccessRule, write: AccessRule): StoredRights {
  return {
    readScope: read.scope,
    writeScope: write.scope,
    acls: [...aclEntries(read, "READ"), ...aclEntries(write, "WRITE")],
  };
}

/**
 * A default naming an account or a group that has since gone must not grant
 * anything on the quiet, so the unknown are dropped as the copy is made (ADR
 * 0026) — the caller passes what still exists, since only the database knows.
 */
export function knownEntries(
  acls: readonly AclEntry[],
  known: { usernames: ReadonlySet<string>; groupSlugs: ReadonlySet<string> }
): AclEntry[] {
  return acls.filter((acl) =>
    acl.username !== null
      ? known.usernames.has(acl.username)
      : acl.groupSlug !== null && known.groupSlugs.has(acl.groupSlug)
  );
}

/** Who an `acl` list may name: the people and groups of the wiki. */
export interface AclDirectory {
  people: Identity[];
  groups: { slug: string; name: string }[];
}

/** What a « seulement » list always allows, over and above what it holds. */
export interface AclFloor {
  /** The owner's display name, null when the subject has no owner. */
  ownerName: string | null;
}

export function aclFloorLabels(floor: AclFloor): {
  people: string[];
  groups: string[];
} {
  return {
    people: floor.ownerName === null ? [] : [`${floor.ownerName} (propriétaire)`],
    groups: [`@${ADMINS_GROUP.name}`],
  };
}

/** The invariant the missing « Administrateurs » scope would have hidden. */
export function alwaysAllowedNote(floor: AclFloor): string {
  return floor.ownerName === null
    ? "Les administrateurs ont toujours accès, et ne peuvent pas être retirés."
    : "Le propriétaire et les administrateurs ont toujours accès, et ne peuvent pas être retirés.";
}

// --- what someone without the right is told ----------------------------------

/**
 * One message, the same for every refusal: the wiki does not try to hide that
 * the page exists — a 404 would be a second, contradictory story the moment
 * someone reached the page from a link that names it.
 */
export const ACCESS_DENIED = "Vous n'avez pas accès à cette page.";

export function ownerLine(ownerName: string | null): string | null {
  return ownerName === null ? null : `Propriétaire : ${ownerName}`;
}

/**
 * What the access layer throws when a write reaches it anyway. The screens
 * hide what they cannot offer, so nobody reads these in the ordinary course
 * — they are the backstop for a direct call to a Server Action.
 */
export const WRITE_REFUSED = "Vous n'avez pas le droit de modifier cette page.";
export const CREATE_REFUSED = "Vous n'avez pas le droit de créer une page sur ce wiki.";
export const RIGHTS_REFUSED =
  "Seuls le propriétaire et les administrateurs peuvent modifier les droits d'une page.";
export const UPLOAD_REFUSED =
  "Vous n'avez pas le droit de déposer un fichier sur ce wiki.";

/**
 * That refusal, as the screen that asked can show it. A Server Action that
 * let it through would land on the error boundary, where a right that went
 * away between opening a page and saving it reads as a crash.
 */
export function refusalMessage(error: unknown): string {
  return error instanceof Error ? error.message : ACCESS_DENIED;
}
