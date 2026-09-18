import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { CONTRIBUTOR } from "./support/personas";
import { acceptInvitation, inviteAndGetLink } from "./support/invitations";
import { wikiConfig } from "../wiki.config";

// The account parcours (ADR 0032): signing out, closed sign-up, the single-use
// invitation link, and a disabled account. Each crosses BetterAuth and the
// running server end to end. Sign-in here is explicit — the session itself is
// what these parcours are about.

// --- A — signing out ---------------------------------------------------------

test.describe("A — déconnexion", () => {
  test.use({ storageState: CONTRIBUTOR.statePath });

  test("signing out returns to the visitor state", async ({ page }) => {
    await page.goto(`/${wikiConfig.homeSlug}`);
    await page.getByRole("button", { name: CONTRIBUTOR.name }).click();
    await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
    await expect(
      page.getByRole("link", { name: "Se connecter" })
    ).toBeVisible();
  });
});

// --- D — free sign-up is closed ----------------------------------------------

test("D — l'inscription libre est fermée", async ({ page }) => {
  // As a visitor (no storageState).
  await page.goto(`/${wikiConfig.authPages.signUp}`);
  await expect(
    page.getByRole("heading", { name: "L'inscription n'est pas ouverte" })
  ).toBeVisible();
});

// --- B — an invitation link works once ---------------------------------------

test("B — un lien d'invitation ne fonctionne qu'une fois", async ({
  browser,
}) => {
  const email = `invite-b-${Date.now()}@wiki-oui.test`;
  const password = "e2e-invite-b-password";

  const admin = await browser.newContext({ storageState: ADMIN.statePath });
  const link = await inviteAndGetLink(await admin.newPage(), email);
  await admin.close();

  // First use consumes the link.
  const first = await browser.newContext();
  await acceptInvitation(await first.newPage(), link, "Usage Unique", password);
  await first.close();

  // Second use lands on « ce lien n'est plus valable ».
  const second = await browser.newContext();
  const page = await second.newPage();
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Ce lien n'est plus valable" })
  ).toBeVisible();
  await second.close();
});

// --- P — a disabled account cannot sign in -----------------------------------

test("P — un compte désactivé ne peut plus se connecter", async ({
  browser,
}) => {
  const ts = Date.now();
  const email = `disable-${ts}@wiki-oui.test`;
  const name = `Compte Desactive ${ts}`;
  const password = "e2e-disable-password";

  // Mint the account through a real invitation.
  const admin = await browser.newContext({ storageState: ADMIN.statePath });
  const adminPage = await admin.newPage();
  const link = await inviteAndGetLink(adminPage, email);
  const newcomer = await browser.newContext();
  await acceptInvitation(await newcomer.newPage(), link, name, password);
  await newcomer.close();

  // The admin disables it on gerer-utilisateurs.
  await adminPage.goto("/gerer-utilisateurs");
  await adminPage
    .getByRole("button", { name: `Actions sur le compte de ${name}` })
    .click();
  await adminPage
    .getByRole("menuitem", { name: "Désactiver le compte" })
    .click();
  await expect(
    adminPage.getByText("ne peut plus se connecter")
  ).toBeVisible();
  await admin.close();

  // Signing in is now refused, in words.
  const attempt = await browser.newContext();
  const page = await attempt.newPage();
  await page.goto(`/${wikiConfig.authPages.signIn}`);
  await page.getByLabel("Adresse e-mail ou identifiant").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(
    page.getByText("Ce compte est désactivé. Contactez un administrateur.")
  ).toBeVisible();
  await attempt.close();
});

// --- C — a reset link sets a new password ------------------------------------

test("C — un lien de réinitialisation change le mot de passe", async ({
  browser,
}) => {
  const ts = Date.now();
  const email = `reset-${ts}@wiki-oui.test`;
  const name = `Compte Reset ${ts}`;
  const oldPassword = "e2e-reset-old-password";
  const newPassword = "e2e-reset-new-password";

  // Mint the account through a real invitation.
  const admin = await browser.newContext({ storageState: ADMIN.statePath });
  const adminPage = await admin.newPage();
  const link = await inviteAndGetLink(adminPage, email);
  const newcomer = await browser.newContext();
  await acceptInvitation(await newcomer.newPage(), link, name, oldPassword);
  await newcomer.close();

  // The admin sends a password link; with no SMTP it is shown in the dialog.
  await adminPage.goto("/gerer-utilisateurs");
  await adminPage
    .getByRole("button", { name: `Actions sur le compte de ${name}` })
    .click();
  await adminPage
    .getByRole("menuitem", { name: "Envoyer un lien de mot de passe" })
    .click();
  const resetLink = await adminPage
    .getByRole("dialog")
    .locator("input[readonly]")
    .inputValue();
  await admin.close();

  // Through the link, the person chooses a new password and lands signed in.
  const reset = await browser.newContext();
  const resetPage = await reset.newPage();
  await resetPage.goto(resetLink);
  await resetPage.getByLabel("Mot de passe").fill(newPassword);
  await resetPage
    .getByRole("button", { name: "Enregistrer et me connecter" })
    .click();
  await resetPage.waitForURL(`**/${wikiConfig.homeSlug}`);
  await reset.close();

  // The new password now signs in.
  const check = await browser.newContext();
  const checkPage = await check.newPage();
  await checkPage.goto(`/${wikiConfig.authPages.signIn}`);
  await checkPage
    .getByLabel("Adresse e-mail ou identifiant")
    .fill(email);
  await checkPage.getByLabel("Mot de passe").fill(newPassword);
  await checkPage.getByRole("button", { name: "Se connecter" }).click();
  await checkPage.waitForURL(`**/${wikiConfig.homeSlug}`);
  await check.close();
});
