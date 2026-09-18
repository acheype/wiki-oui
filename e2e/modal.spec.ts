import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";

// H — the inline modal (ADR 0022, ADR 0032). What only e2e proves: the modal's
// content is a real page rendered by the server through the access layer, its
// state lives in the URL (?modale=), so it is shareable, survives a reload and
// is closed by the browser's Back button. The CSS confinement, focus trap and
// hover timing are component-test matters (ADR 0032), not this parcours.
//
// Opened by clicking a fiche in an <EntriesView view="list" openOnClick>
// (seeded page voir-blog-simple), whose fiches are readable by everyone.

test.use({ storageState: ADMIN.statePath });

test("a fiche opens in a modal that the URL, reload and Back all follow", async ({
  page,
}) => {
  await page.goto("/voir-blog-simple");

  // The first fiche of the list; openOnClick renders each as a button.
  await page.locator("article button").first().click();

  // The state is in the URL, and the modal (a dialog) is on screen.
  await expect(page).toHaveURL(/[?&]modale=/);
  await expect(page.getByRole("dialog")).toBeVisible();

  // A reload rebuilds the modal from the URL — it is reload-proof.
  await page.reload();
  await expect(page).toHaveURL(/[?&]modale=/);
  await expect(page.getByRole("dialog")).toBeVisible();

  // Back closes it and drops ?modale= from the URL.
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]modale=/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
