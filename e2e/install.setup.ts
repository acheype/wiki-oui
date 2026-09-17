import { expect, test as setup } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { wikiConfig } from "../wiki.config";

// The real first-run install (ADR 0027): the only path that mints the
// wiki-admin account, since the seed stays pure data. It runs once, before the
// smoke spec, as that spec's project dependency. No storage state is saved on
// purpose — the smoke spec signs in explicitly, the way a person does.
setup("install the wiki", async ({ page }) => {
  // The proxy rewrites any address to the install service until the flag is set.
  await page.goto("/");

  await page.getByLabel("Adresse e-mail").fill(ADMIN.email);
  await page.getByLabel("Mot de passe").fill(ADMIN.password);
  await page
    .getByRole("button", { name: "Créer le compte administrateur" })
    .click();

  // A successful install signs the installer in and lands on the home page.
  await page.waitForURL(`**/${wikiConfig.homeSlug}`);
  await expect(
    page.getByRole("button", { name: "Créer le compte administrateur" })
  ).toHaveCount(0);
});
