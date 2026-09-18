import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { createPage, editPage } from "./support/pages";

// The page life-cycle parcours (ADR 0032): rename, delete and restore. Each is
// a structuring action reserved to the owner or an administrator, and each
// crosses the running server, the access layer and the database — what no
// component test reaches. Run as the administrator; unique slugs per run keep
// them independent (no per-test reset).

test.use({ storageState: ADMIN.statePath });

// --- E — « Changer l'adresse » rewrites references ---------------------------

test("renaming a page rewrites the wiki links that point at it", async ({
  page,
}) => {
  const ts = Date.now();
  const target = `e2e-cible-${ts}`;
  const renamed = `e2e-cible-r-${ts}`;
  const source = `e2e-source-${ts}`;

  await createPage(page, target, "# Cible\n\nContenu de la cible.");
  // The link is written while the target exists, so no dead-link warning.
  await createPage(page, source, `# Source\n\n[vers la cible](${target})`);

  await page.goto(`/${target}`);
  await page.getByRole("button", { name: "Plus d'actions" }).click();
  await page.getByRole("menuitem", { name: /Changer l'adresse/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nouvelle adresse").fill(renamed);
  await dialog.getByRole("button", { name: "Changer l'adresse" }).click();
  await page.waitForURL(`**/${renamed}`);

  // The old address stops existing: an administrator is invited to write it.
  await page.goto(`/${target}`);
  await expect(
    page.getByRole("link", { name: "Créer cette page" })
  ).toBeVisible();

  // The source's link now resolves to the new address — the reference was swept.
  await page.goto(`/${source}`);
  await page.getByRole("link", { name: "vers la cible" }).click();
  await page.waitForURL(`**/${renamed}`);
});

// --- F — deleting a page -----------------------------------------------------

test("deleting a page removes it for good", async ({ page }) => {
  const slug = `e2e-suppr-${Date.now()}`;
  await createPage(page, slug, "# À supprimer\n\nContenu jetable.");

  await page.goto(`/${slug}`);
  await page.getByRole("button", { name: "Plus d'actions" }).click();
  await page.getByRole("menuitem", { name: /Supprimer/ }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByRole("button", { name: "Supprimer définitivement" })
    .click();
  // deletePage redirects to the home page on success.
  await page.waitForURL(`**/page-principale`);

  await page.goto(`/${slug}`);
  await expect(
    page.getByRole("link", { name: "Créer cette page" })
  ).toBeVisible();
});

// --- G — restoring an old revision -------------------------------------------

test("restoring an old revision brings its content back", async ({ page }) => {
  const slug = `e2e-hist-${Date.now()}`;
  await createPage(page, slug, "Version un du contenu.");
  await editPage(page, slug, "Version deux du contenu.");

  await page.goto(`/${slug}/revisions`);
  // The timeline lists revisions oldest first: the first anchor is the creation.
  await page.locator("ol a").first().click();
  await page
    .getByRole("button", { name: "Restaurer cette révision" })
    .click();
  await page.waitForURL(`**/${slug}`);

  await expect(page.getByText("Version un du contenu.")).toBeVisible();
  await expect(page.getByText("Version deux du contenu.")).toHaveCount(0);
});
