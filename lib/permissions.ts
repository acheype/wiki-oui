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

/** The note that carries the invariant the missing scope would have hidden. */
export const OWNER_AND_ADMINS_NOTE =
  "Le propriétaire et les administrateurs ont toujours accès.";

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

/** The page's right in one sense, read back as the widget poses it. */
export function pageRule(page: PageRights, kind: PermKind): AccessRule {
  const listed = page.acls.filter((acl) => acl.kind === kind);
  return {
    scope: kind === "READ" ? page.readScope : page.writeScope,
    usernames: listed.flatMap((acl) => (acl.username ? [acl.username] : [])),
    groupSlugs: listed.flatMap((acl) => (acl.groupSlug ? [acl.groupSlug] : [])),
  };
}

/**
 * The owner and the administrators are always allowed and never appear in the
 * list: the owner is a floor, not a checkbox. A page without an owner is
 * therefore writable by administrators only — the floor is simply empty, and
 * nothing else can be read into an unowned page's write scope.
 */
export function canWrite(actor: Actor, page: PageRights): boolean {
  if (isAdmin(actor)) return true;
  if (page.ownerUsername === null) return false;
  if (actor.username === page.ownerUsername) return true;
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
  const scope = kind === "READ" ? "readScope" : "writeScope";
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
  if (actor.username !== null) branches.push({ ownerUsername: actor.username });
  // An unowned page answers to administrators only, and they never get here.
  branches.push({
    ownerUsername: { not: null },
    OR: scopeBranches(actor, "WRITE"),
  });
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

// --- copying a default -------------------------------------------------------

/** The rights a page is born with, before anyone has posed any. */
export interface PageRightsDefaults {
  read: AccessRule;
  write: AccessRule;
}

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
 * (ADR 0026). Changing a default afterwards touches nothing that exists, and
 * the only way to the existing is an explicit « Appliquer aux fiches
 * existantes ».
 */
export function copyDefaultRights(defaults: PageRightsDefaults): StoredRights {
  return {
    readScope: defaults.read.scope,
    writeScope: defaults.write.scope,
    acls: [
      ...aclEntries(defaults.read, "READ"),
      ...aclEntries(defaults.write, "WRITE"),
    ],
  };
}

/** The rights the modal saves, both senses at once. */
export function storedRights(read: AccessRule, write: AccessRule): StoredRights {
  return copyDefaultRights({ read, write });
}

// --- what someone without the right is told ----------------------------------

/**
 * One message, the same for every refusal: the wiki does not try to hide that
 * the page exists — a 404 would be a second, contradictory story the moment
 * someone reached the page from a link that names it.
 */
export const ACCESS_DENIED = "Vous n'avez pas accès à cette page.";

/** Omitted when the page no longer has an owner: there is nobody to name. */
export function managedByLine(ownerName: string | null): string | null {
  return ownerName === null ? null : `Gérée par ${ownerName}.`;
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
