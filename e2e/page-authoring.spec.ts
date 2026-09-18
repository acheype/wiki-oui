import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { wikiConfig } from "../wiki.config";

// The canonical parcours de validation rapide (ADR 0032): sign in, create a
// page, edit it, save it. It drives the real Next server against a disposable
// database, through the same UI a person uses. Sign-in is explicit here — the
// login itself is part of what this parcours validates. The install ran first
// (install.setup.ts).
test("signs in, creates a page, edits it and saves it", async ({ page }) => {
  // A unique slug so repeated runs against one database never collide.
  const slug = `page-e2e-${Date.now()}`;
  const body = "Bonjour depuis le parcours de validation rapide.";

  // Sign in through the connexion page, email or identifier in the one field.
  await page.goto(`/${wikiConfig.authPages.signIn}`);
  await page.getByLabel("Adresse e-mail ou identifiant").fill(ADMIN.email);
  await page.getByLabel("Mot de passe").fill(ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`**/${wikiConfig.homeSlug}`);

  // An address with no page behind it is an invitation to write it.
  await page.goto(`/${slug}`);
  await page.getByRole("link", { name: "Créer cette page" }).click();
  await page.waitForURL(`**/${slug}/edit`);

  // Type into CodeMirror, then save.
  const editor = page.locator(".cm-content");
  await editor.click();
  await editor.pressSequentially(body);
  // Exact: the warnings panel offers « Enregistrer quand même », which a
  // substring match would also select.
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

  // Back on the page, the saved content shows.
  await page.waitForURL(`**/${slug}`);
  await expect(page.getByText(body)).toBeVisible();
});
