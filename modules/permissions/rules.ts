// The vocabulary of authorization (docs/permissions.md): what a right is, who
// is acting, how a right reads back, what a page stores it as, and what
// someone without it is told. Public to the whole wiki, and deliberately
// unable to decide anything.
//
// The decisions themselves — canRead, canWrite, ownsPage and the `where`
// clauses — are one folder down, in decide/rules.ts, private by their depth
// (ADR 0029). What every other module calls is the `current*` forms of
// person.ts, which resolve who is acting themselves.
//
// The model in two sentences: BetterAuth authenticates, WikiOui authorizes
// (ADR 0023); and a right is a scope, optionally completed by a list.

import { plural } from "@/lib/format";
import { ANONYMOUS } from "@/modules/accounts/username";

/**
 * The administrators' group. Administration is a membership, never a `role`
 * column (ADR 0023): two sources of truth on "who is an admin" would disagree
 * one day, silently. Protected like a special page — never deletable, never
 * renamable, never empty — and it accepts people only, so that the list of
 * administrators reads at a glance.
 */
export const ADMINS_GROUP = { slug: "admins", name: "Admins" } as const;

/**
 * The floor every action on an account or a membership stops at: a wiki
 * whose administrators have all gone is one nobody can take back, since the
 * installation service is a one-way door (ADR 0027). One sentence, because it
 * is one rule — removing the last member of @Admins, disabling them and
 * deleting them are three ways to the same place.
 */
export const LAST_ADMIN_REFUSAL = "Ce wiki doit garder au moins un administrateur.";

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

/** How each scope reads in the widget, in the order it offers them. */
export const SCOPE_LABELS: Record<Scope, string> = {
  everyone: "Tout le monde",
  authenticated: "Les personnes connectées",
  restricted: "Seulement",
};

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

/**
 * A rule as a column of a list has room for it (docs/permissions.md §
 * gerer-pages): where the widget poses a right, this reads one back at a
 * glance, over hundreds of lines. The floor is what an empty « seulement »
 * list means — « eux seuls » — so the summary names it rather than showing
 * nothing, which would read as « personne ».
 */
export function ruleSummary(
  rule: AccessRule,
  floor: AclFloor,
  directory: AclDirectory
): string {
  switch (rule.scope) {
    case "everyone":
      return "Tous";
    case "authenticated":
      return "Connectés";
    case "restricted": {
      const nameOfPerson = new Map(
        directory.people.map((person) => [person.username, person.name])
      );
      const nameOfGroup = new Map(
        directory.groups.map((group) => [group.slug, group.name])
      );
      const named = [
        ...(rule.usernames ?? []).map(
          (username) => nameOfPerson.get(username) ?? username
        ),
        ...(rule.groupSlugs ?? []).map(
          (slug) => `@${nameOfGroup.get(slug) ?? slug}`
        ),
      ];
      if (named.length === 0) {
        return floor.owner === null ? `@${ADMINS_GROUP.name}` : "Le propriétaire";
      }
      const others = named.length - 1;
      return others === 0 ? named[0] : `${named[0]} +${others}`;
    }
  }
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

/** The floor as the widget shows it, locked. */
export function aclFloorLabels(floor: AclFloor): {
  people: string[];
  groups: string[];
} {
  return {
    people: floor.owner === null ? [] : [`${floor.owner.name} (propriétaire)`],
    groups: [`@${ADMINS_GROUP.name}`],
  };
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

/** The invariant the missing « Administrateurs » scope would have hidden. */
export function alwaysAllowedNote(floor: AclFloor): string {
  return floor.owner === null
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

/**
 * Why a rule refuses, in the words the scope was posed in. Two things read it,
 * and they are the two the general rule (docs/permissions.md § Ce que voit qui
 * n'a pas le droit) leaves on screen rather than hiding: the `<EntryForm>` an
 * person may not add to, and a field they may see but not fill. Both are shown
 * with their motif — a block that vanished would read as a page that failed to
 * load, and a field that vanished as a fiche someone forgot to fill in.
 *
 * The named groups arrive resolved to their display names — « @Bureau », not
 * `bureau`, since a slug says nothing to whoever reads the refusal. The people
 * a « seulement » names stay unsaid: naming them would publish who is on the
 * wiki to a visitor, where a group is already how the wiki talks about itself
 * in public.
 */
export function scopeRefusal(
  rule: AccessRule,
  groupNames: readonly string[]
): string | null {
  switch (rule.scope) {
    case "everyone":
      return null; // refuses nobody, so there is nothing to word
    case "authenticated":
      return "Réservé aux personnes connectées.";
    case "restricted":
      return groupNames.length === 0
        ? "Réservé aux personnes autorisées."
        : `Réservé à ${joinNames(groupNames.map((name) => `@${name}`))}.`;
  }
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

/**
 * What handing pages over means for whoever receives them, as the two views
 * that offer it say it — the « Accès » modal on one page, `gerer-pages` on a
 * lot. Written out both ways rather than built from a count: at one page the
 * pronoun agrees with it too, and assembling the pieces is what once produced
 * « 1 page passeront sous la responsabilité ».
 */
export function ownerTransferNote(total: number): string {
  return total === 1
    ? "La personne choisie deviendra responsable de cette page. Elle pourra la voir, la modifier et définir qui peut y accéder."
    : `La personne choisie deviendra responsable de ces ${plural(total, "page", "pages")}. Elle pourra les voir, les modifier et définir qui peut y accéder.`;
}

/**
 * And what it means for whoever gives them: transmettre la propriété est sans
 * retour (docs/permissions.md § Quel droit commande quelle action), so the
 * confirmation says so before the click rather than after it.
 */
export function ownerTransferWarning(total: number): string {
  const subject = total === 1 ? "cette page" : "ces pages";
  return `Une fois le transfert effectué, seul le nouveau propriétaire, ou un administrateur, pourra transférer à nouveau la propriété de ${subject}.`;
}

/**
 * Who looks after the page, as a view states it. A page with no owner says
 * « Anonyme » rather than saying nothing: the absence is itself the
 * information — it is what leaves the page to the administrators alone — and
 * a line that disappears reads as a screen that failed to load it.
 *
 * The widget's floor stays silent about them all the same: a locked
 * « Anonyme » chip beside the administrators would promise access to
 * somebody, where the whole point is that there is nobody.
 */
export function ownerLine(ownerName: string | null): string {
  return `Propriétaire : ${ownerName ?? ANONYMOUS}`;
}

/**
 * What the access layer throws when a write reaches it anyway. The views
 * hide what they cannot offer, so nobody reads these in the ordinary course
 * — they are the backstop for a direct call to a Server Action.
 */
export const WRITE_REFUSED = "Vous n'avez pas le droit de modifier cette page.";
export const CREATE_REFUSED = "Vous n'avez pas le droit de créer une page sur ce wiki.";
/**
 * Creating a fiche reads the form's own rule and not the wiki's: a form
 * decides who may add to it (docs/permissions.md § Formulaire), which is what
 * makes « chacun propose un événement » possible on a wiki that does not hand
 * out pages.
 */
export const CREATE_ENTRY_REFUSED =
  "Vous n'avez pas le droit de créer une fiche avec ce formulaire.";
/**
 * Creating a form reads the wiki's own rule, beside createPage and distinct
 * from it (docs/permissions.md § Où s'appliquent les droits): a page engages a
 * page, a form engages every fiche ever written with it.
 */
export const CREATE_FORM_REFUSED =
  "Vous n'avez pas le droit de créer un formulaire sur ce wiki.";
export const FORM_EDIT_REFUSED =
  "Seuls le propriétaire du formulaire et les administrateurs peuvent le modifier.";
export const RIGHTS_REFUSED =
  "Seuls le propriétaire et les administrateurs peuvent modifier les droits d'une page.";
export const DELETE_REFUSED =
  "Seuls le propriétaire et les administrateurs peuvent supprimer une page.";
export const TRANSFER_REFUSED =
  "Seuls le propriétaire et les administrateurs peuvent transmettre la propriété d'une page.";
export const ADDRESS_REFUSED =
  "Seuls les administrateurs peuvent changer l'adresse d'une page.";
/** The account named to receive a page has gone since the list was read. */
export const UNKNOWN_RECIPIENT =
  "Ce compte n'existe pas ou plus : la page n'a pas changé de propriétaire.";
export const UPLOAD_REFUSED =
  "Vous n'avez pas le droit de déposer un fichier sur ce wiki.";

/**
 * That refusal, as the view that asked can show it. A Server Action that
 * let it through would land on the error boundary, where a right that went
 * away between opening a page and saving it reads as a crash.
 */
export function refusalMessage(error: unknown): string {
  return error instanceof Error ? error.message : ACCESS_DENIED;
}
