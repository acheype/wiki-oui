import path from "node:path";
import { AUTH_DIR } from "./personas";

// The administrator the install flow creates and the parcours sign in as.
// The password clears MIN_PASSWORD_LENGTH (modules/settings/installation.ts).
// The username is imposed by the installer (INSTALLER.username, ADR 0027); the
// email is ours to choose.
export const ADMIN = {
  email: "admin@wiki-oui.test",
  password: "e2e-admin-password",
  username: "wiki-admin",
  /** Where install.setup saves the admin's signed-in storage state. */
  statePath: path.join(AUTH_DIR, "admin.json"),
} as const;
