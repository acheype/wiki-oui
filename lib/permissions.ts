// Where every authorization decision will live (docs/permissions.md): pure
// logic, no I/O, so a rule can be asserted on plain data. The database side —
// resolving who is acting, turning a rule into a `where` — lives in
// permissions-db.ts, the pairing this project uses throughout (slug-rename,
// field-rename, entry-title).

/**
 * The person acting at a given moment, connected or not. The three access
 * levels are not settings, they are observations (docs/permissions.md):
 * visitor (no session), user (a session), administrator (a member of
 * @Admins).
 */
export interface Actor {
  /** null for a visitor — nobody is signed in. */
  username: string | null;
  /**
   * Administration is a membership of @Admins, never a `role` column (ADR
   * 0023): two sources of truth on "who is an admin" would disagree one day,
   * silently. @Admins holds people only, so no nesting is resolved here.
   */
  isAdmin: boolean;
}

export const VISITOR: Actor = { username: null, isAdmin: false };

/**
 * The administrators' group. Protected like a special page: never deletable,
 * never renamable, never empty — and it accepts people only, so that the list
 * of administrators reads at a glance.
 */
export const ADMINS_GROUP = { slug: "admins", name: "Admins" } as const;

/**
 * A signed-in person as the interface names them. The display name signs
 * contributions, the identifier is what the account screens link to — and
 * the email is in neither, it belongs to gerer-utilisateurs alone.
 */
export interface Identity {
  username: string;
  name: string;
}
