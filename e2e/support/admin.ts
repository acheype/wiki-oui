import path from "node:path";
import { AUTH_DIR } from "./personas";

// The administrator the install flow creates and the parcours sign in as.
// The password clears MIN_PASSWORD_LENGTH (modules/settings/installation.ts);
// the email is ours to choose (the installer imposes the name and identifier).
export const ADMIN = {
  email: "admin@wiki-oui.test",
  password: "e2e-admin-password",
  /** Where personas.setup saves the admin's signed-in storage state. */
  statePath: path.join(AUTH_DIR, "admin.json"),
} as const;
