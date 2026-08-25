// The vocabulary of authorization (docs/permissions.md): what a right is, who
// is acting, how a right reads back, and what a page stores it as. Public to
// the whole wiki, and deliberately unable to decide anything.
//
// No French here beyond the refusals themselves: a label belongs to the one
// view that shows it (issue #20), so SCOPE_LABELS lives in acl-input.tsx, the
// owner lines in modules/pages/ui/labels.ts and the scope refusal in
// modules/forms/refusal.ts. The refusals stay because they are one channel,
// read at one place and thrown from many.
//
// The decisions themselves — canRead, canWrite, ownsPage and the `where`
// clauses — are one folder down, in decide/rules.ts, private by their depth
// (ADR 0029). What every other module calls is the `current*` forms of
// person.ts, which resolve who is acting themselves.
//
// The model in two sentences: BetterAuth authenticates, WikiOui authorizes
// (ADR 0023); and a right is a scope, optionally completed by a list.

/**
 * The administrators' group. Administration is a membership, never a `role`
 * column (ADR 0023): two sources of truth on "who is an admin" would disagree
 * one day, silently. Protected like a special page — never deletable, never
 * renamable, never empty — and it accepts people only, so that the list of
 * administrators reads at a glance.
 */
export const ADMINS_GROUP = { slug: "admins", name: "Admins" } as const;

/**
 * A signed-in person as the interface names them. The display name signs
 * contributions, the identifier is what the account system pages link to — and
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

/**
 * The scopes a rule may take when it stands under another — a field's, under
 * the fiche's (docs/permissions.md § Champ). Strictly narrower than the cap:
 * the cap itself is what « aucune restriction » already stands for, and
 * offering it twice would be asking the same question in two words.
 *
 * « Seulement » survives every cap, its own included: one list narrows
 * another, where the two wider scopes name an audience outright. And a scope
 * already posed is kept whatever the cap says — a form whose defaults were
 * narrowed afterwards would otherwise show a rule with nothing selected,
 * which is no way to hand the choice back to whoever came to change it.
 */
export function scopesUnder(cap: Scope, posed?: Scope): Scope[] {
  return SCOPES.filter(
    (scope) =>
      SCOPES.indexOf(scope) > SCOPES.indexOf(cap) ||
      scope === "restricted" ||
      scope === posed
  );
}

/** The two senses a right is posed in. Uppercase: it is a Postgres enum. */
export const PERM_KINDS = ["READ", "WRITE"] as const;
export type PermKind = (typeof PERM_KINDS)[number];

/**
 * The people and groups a right names, in the one shape they travel in: two
 * lists of names, never ids (ADR 0024). A rule holds one, so does the floor it
 * stands on, and so does what an action by lot is about to add.
 */
export interface PrincipalList {
  usernames: readonly string[];
  groupSlugs: readonly string[];
}

/**
 * One right, as the widget poses it and as the configuration writes it: a
 * scope, and the list only the « seulement » scope ever reads.
 */
export interface AccessRule extends Partial<PrincipalList> {
  scope: Scope;
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
export interface Person {
  username: string | null;
  /** Effective groups, nesting already resolved by groups.ts. */
  groupSlugs: readonly string[];
}

/** Nobody in particular — the level every wiki always has someone at. */
export const VISITOR: Person = { username: null, groupSlugs: [] };

// --- what the rights read back as -------------------------------------------

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
 * The three rungs the permissions on a page stop at (docs/permissions.md § Quel
 * droit commande quelle action), what the action bar reads to decide what it
 * offers at all. Each rung is named after the reach of what it lets through,
 * not after who it lets in: the ladder is a matter of how far the effect
 * travels, not a hierarchy of people.
 */
export interface PagePermissions {
  /** Editing, restoring a revision, posing tags. */
  write: boolean;
  /**
   * Deleting, posing the rights, handing the page on — « les actions
   * structurantes ». Whoever may write can blank a page anyway, but the
   * history survives a blanking and not a deletion, and opening the writing
   * must not let someone shut the owner out of their own page.
   */
  structuring: boolean;
  /** Changing the address (ADR 0016: retcons references across the wiki). */
  address: boolean;
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
  /** Null when the subject has no owner: the wiki's defaults, an erased account. */
  owner: Identity | null;
}

/**
 * What a floor covers, by the names a right stores. Takes the username rather
 * than the floor, because that is all a row can be compared against: a fiche
 * read by the formful carries an `ownerUsername` and no display name, and the
 * comparison must not depend on one.
 */
export function coveredPrincipals(ownerUsername: string | null): PrincipalList {
  return {
    usernames: ownerUsername === null ? [] : [ownerUsername],
    groupSlugs: [ADMINS_GROUP.slug],
  };
}

/** The floor as a list names people: what it covers cannot be added to it. */
export function aclFloorPrincipals(floor: AclFloor): PrincipalList {
  return coveredPrincipals(floor.owner?.username ?? null);
}

/**
 * Drops what the floor already covers: such a row grants nothing, the owner
 * and the administrators holding their access whatever the scope says. It
 * appears without anyone writing it — handing the page to someone the list
 * already named turns their line into a duplicate of the floor, and so does a
 * configured default naming @Admins.
 */
export function withoutFloor(
  acls: readonly AclEntry[],
  floor: AclFloor
): AclEntry[] {
  return withoutCovered(acls, aclFloorPrincipals(floor));
}

/** The same drop, where the floor is known by its names alone. */
export function withoutCovered(
  acls: readonly AclEntry[],
  covered: PrincipalList
): AclEntry[] {
  return acls.filter(
    (acl) =>
      !(acl.username !== null && covered.usernames.includes(acl.username)) &&
      !(acl.groupSlug !== null && covered.groupSlugs.includes(acl.groupSlug))
  );
}

// --- what someone without the right is told ----------------------------------

/**
 * Every refusal the access layer can raise, named. A kind rather than a bare
 * message, because the message is what a person reads and the kind is what the
 * code decides on: the two used to be the same string, which is how any error
 * at all — a violated Prisma constraint, a TypeError — could reach the screen
 * (issue #20).
 */
export type RefusalKind =
  | "access"
  | "write"
  | "createPage"
  | "createEntry"
  | "createForm"
  | "editForm"
  | "rights"
  | "delete"
  | "transfer"
  | "address"
  | "unknownRecipient"
  | "upload"
  | "lastAdmin";

/**
 * What each refusal says. The views hide what they cannot offer, so most of
 * these are read only after a direct call to a Server Action — but a few are
 * shown outright, where hiding would inform nobody (docs/permissions.md § Ce
 * que voit qui n'a pas le droit).
 */
export const REFUSALS: Record<RefusalKind, string> = {
  // One message for every read refusal: the wiki does not try to hide that the
  // page exists — a 404 would be a second, contradictory story the moment
  // someone reached the page from a link that names it.
  access: "Vous n'avez pas accès à cette page.",
  write: "Vous n'avez pas le droit de modifier cette page.",
  createPage: "Vous n'avez pas le droit de créer une page sur ce wiki.",
  // Creating a fiche reads the form's own rule and not the wiki's: a form
  // decides who may add to it (docs/permissions.md § Formulaire), which is what
  // makes « chacun propose un événement » possible on a wiki that does not hand
  // out pages.
  createEntry: "Vous n'avez pas le droit de créer une fiche avec ce formulaire.",
  // Creating a form reads the wiki's own rule, beside createPage and distinct
  // from it (docs/permissions.md § Où s'appliquent les droits): a page engages
  // a page, a form engages every fiche ever written with it.
  createForm: "Vous n'avez pas le droit de créer un formulaire sur ce wiki.",
  editForm:
    "Seuls le propriétaire du formulaire et les administrateurs peuvent le modifier.",
  rights:
    "Seuls le propriétaire et les administrateurs peuvent modifier les droits d'une page.",
  delete: "Seuls le propriétaire et les administrateurs peuvent supprimer une page.",
  transfer:
    "Seuls le propriétaire et les administrateurs peuvent transmettre la propriété d'une page.",
  address: "Seuls les administrateurs peuvent changer l'adresse d'une page.",
  // The account named to receive a page has gone since the list was read.
  unknownRecipient:
    "Ce compte n'existe pas ou plus : la page n'a pas changé de propriétaire.",
  upload: "Vous n'avez pas le droit de déposer un fichier sur ce wiki.",
  // The floor every action on an account or a membership stops at: a wiki whose
  // administrators have all gone is one nobody can take back, since the
  // installation service is a one-way door (ADR 0027). One sentence, because it
  // is one rule — removing the last member of @Admins, disabling them and
  // deleting them are three ways to the same place.
  lastAdmin: "Ce wiki doit garder au moins un administrateur.",
};

/**
 * A refusal, and nothing else. Its own class so that the reader below can tell
 * it from every other Error: only what the access layer meant to say reaches
 * the person.
 */
export class Refusal extends Error {
  constructor(readonly kind: RefusalKind) {
    super(REFUSALS[kind]);
    this.name = "Refusal";
  }
}

/** How the access layer refuses. Never `throw new Error(<a French sentence>)`. */
export function refuse(kind: RefusalKind): never {
  throw new Refusal(kind);
}

/**
 * That refusal, as the view that asked can show it. A Server Action that let
 * it through would land on the error boundary, where a right that went away
 * between opening a page and saving it reads as a crash.
 *
 * Anything that is not a Refusal falls back on the read refusal rather than
 * being repeated: a violated constraint or a message naming a column is not
 * something to hand a reader, and it is not something they can act on either.
 * Called on the server, inside the action — an instance of a class does not
 * survive the server-to-client boundary a thrown value crosses.
 */
export function refusalMessage(error: unknown): string {
  return error instanceof Refusal ? REFUSALS[error.kind] : REFUSALS.access;
}
