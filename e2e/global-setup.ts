import { execSync } from "node:child_process";
import dotenv from "dotenv";

// Brings the disposable database to a known state before anything runs (ADR
// 0032): the schema, then the seed as the e2e fixture. The install flow is
// NOT here — it is a Server Action, so it needs the web server and runs later
// in the `setup` project (e2e/install.setup.ts).
export default async function globalSetup() {
  // Same source as playwright.config.ts; a CI-provided DATABASE_URL still wins.
  dotenv.config({ path: ".env.test" });

  const run = (command: string) =>
    execSync(command, { stdio: "inherit", env: process.env });

  run("pnpm prisma migrate deploy");
  // E2E_FIXTURES adds the restricted-rights form and fiches the permission
  // parcours read (prisma/seed/e2e-fixtures.ts); a real install never sets it.
  process.env.E2E_FIXTURES = "1";
  run("pnpm prisma db seed");
}
