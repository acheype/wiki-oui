import type { Page } from "@playwright/test";
import { USERS_ADMIN_SLUG } from "./personas";
import { wikiConfig } from "../../wiki.config";

// The invitation flow, factored for the account parcours (ADR 0032). An admin
// invites an address on gerer-utilisateurs; with no SMTP in an e2e run, the
// single-use link is shown on the page rather than mailed, so the test reads it
// straight from the outcome field (link-to-copy.tsx).

export async function inviteAndGetLink(
  adminPage: Page,
  email: string
): Promise<string> {
  await adminPage.goto(`/${USERS_ADMIN_SLUG}`);
  await adminPage
    .getByRole("button", { name: "Inviter des personnes" })
    .click();
  const dialog = adminPage.getByRole("dialog");
  await dialog.getByLabel("Adresses e-mail").fill(email);
  await dialog.getByRole("button", { name: "Inviter", exact: true }).click();
  return dialog.locator("input[readonly]").inputValue();
}

/** Accept an invitation link, choosing a name and password; lands signed in. */
export async function acceptInvitation(
  page: Page,
  link: string,
  name: string,
  password: string
): Promise<void> {
  await page.goto(link);
  await page.getByLabel("Nom affiché").fill(name);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(`**/${wikiConfig.homeSlug}`);
}
