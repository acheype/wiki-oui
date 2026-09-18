import { expect, test as setup } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { PERSONAS, USERS_ADMIN_SLUG } from "./support/personas";
import { signIn } from "./support/sign-in";
import { wikiConfig } from "../wiki.config";

// Mints the non-admin personas the permission parcours need (ADR 0032),
// through the real invitation flow — the only path that forges a usable
// account, the seed staying pure data (ADR 0027). Depends on the install,
// which minted the admin who does the inviting. The admin signs in explicitly
// (the install service does not persist a reusable session for the harness),
// and every role's signed-in storageState is saved for the specs to reuse.

setup("mint the personas", async ({ browser }) => {
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await signIn(adminPage, ADMIN.email, ADMIN.password);
  await admin.storageState({ path: ADMIN.statePath });

  for (const persona of PERSONAS) {
    // Invite one address at a time on gerer-utilisateurs; with no SMTP in an
    // e2e run, the single-use link is shown on the page rather than mailed.
    await adminPage.goto(`/${USERS_ADMIN_SLUG}`);
    await adminPage
      .getByRole("button", { name: "Inviter des personnes" })
      .click();
    const dialog = adminPage.getByRole("dialog");
    await dialog.getByLabel("Adresses e-mail").fill(persona.email);
    await dialog.getByRole("button", { name: "Inviter", exact: true }).click();
    // The link lands in the read-only field of the outcome (link-to-copy.tsx).
    const link = await dialog.locator("input[readonly]").inputValue();
    expect(link).toContain("/" + wikiConfig.authPages.invitation);
    // No need to close the dialog: the next iteration reloads gerer-utilisateurs,
    // and « Fermer » is ambiguous (the footer button and the dialog's own cross).

    // Accept in a fresh context: the token is the whole credential, and the
    // saved state must be the persona's alone, not the admin's plus theirs.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(link);
    await page.getByLabel("Nom affiché").fill(persona.name);
    await page.getByLabel("Mot de passe").fill(persona.password);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    // Accepting redirects to the home page, signed in as the new account.
    await page.waitForURL(`**/${wikiConfig.homeSlug}`);
    await context.storageState({ path: persona.statePath });
    await context.close();
  }

  await admin.close();
});
