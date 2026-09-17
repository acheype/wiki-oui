// The administrator the install flow creates and the smoke spec signs in as.
// The password clears MIN_PASSWORD_LENGTH (modules/settings/installation.ts).
// The username is imposed by the installer (INSTALLER.username, ADR 0027); the
// email is ours to choose.
export const ADMIN = {
  email: "admin@wiki-oui.test",
  password: "e2e-admin-password",
} as const;
