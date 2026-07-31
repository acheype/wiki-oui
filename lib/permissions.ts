// Where every authorization decision will live (docs/permissions.md): pure
// logic, no I/O, so a rule can be asserted on plain data. The database side —
// resolving who is acting, turning a rule into a `where` — lives in
// permissions-db.ts, the pairing this project uses throughout (slug-rename,
// field-rename, entry-title).
//
// Only what the accounts already need is here. The actor and its three access
// levels arrive with the rules that read them, and with the tests that hold
// canRead and readableWhere to the same verdict.

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
 * contributions, the identifier is what the account screens link to — and
 * the email is in neither, it belongs to gerer-utilisateurs alone.
 */
export interface Identity {
  username: string;
  name: string;
}
