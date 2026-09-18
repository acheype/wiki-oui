import path from "node:path";

// The non-admin accounts the personas setup mints through the real invitation
// flow (ADR 0032), so a permission parcours can oppose an authorised person to
// a third party. Kept beside ADMIN (support/admin.ts): the admin is minted by
// the install flow, these two by an admin inviting them. Their password clears
// MIN_PASSWORD_LENGTH (modules/settings/installation.ts).
//
// Signing in uses the email, never the derived identifier — one field, one
// source of truth, whatever slugify makes of the display name.

export interface Persona {
  /** Typed into « Nom affiché » on the invitation form. */
  readonly name: string;
  readonly email: string;
  readonly password: string;
  /** Where personas.setup saves this role's signed-in storage state. */
  readonly statePath: string;
}

/** One dir for every signed-in state, under the git-ignored .playwright/. */
export const AUTH_DIR = ".playwright/.auth";

export const CONTRIBUTOR: Persona = {
  name: "Camille Contributeur",
  email: "contributeur@wiki-oui.test",
  password: "e2e-contributeur-password",
  statePath: path.join(AUTH_DIR, "contributeur.json"),
};

export const READER: Persona = {
  name: "Lea Lecteur",
  email: "lecteur@wiki-oui.test",
  password: "e2e-lecteur-password",
  statePath: path.join(AUTH_DIR, "lecteur.json"),
};

export const PERSONAS: readonly Persona[] = [CONTRIBUTOR, READER];

/** The gerer-utilisateurs special page, where an admin invites people. */
export const USERS_ADMIN_SLUG = "gerer-utilisateurs";
