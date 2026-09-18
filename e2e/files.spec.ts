import path from "node:path";
import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";

// N — uploading a file (ADR 0012, ADR 0032). What only e2e proves: a file goes
// through the real upload service into the pool, and the page that references it
// renders it back. Driven through the image field of an annuaire fiche, whose
// upload widget hides an <input type="file"> (files/upload-input.tsx).

test.use({ storageState: ADMIN.statePath });

// A real seed asset: a valid JPEG sharp reads and resizes without complaint.
const IMAGE_PATH = path.join("prisma", "seed", "assets", "bike-workshop.jpg");

test("an uploaded image is stored and rendered on the fiche", async ({
  page,
}) => {
  const ts = Date.now();
  await page.goto("/fiches?nouvelle&formulaire=annuaire");

  await page.locator('input[type="file"]').setInputFiles(IMAGE_PATH);
  // The upload finished when the widget offers to remove what it stored.
  await expect(
    page.getByRole("button", { name: "Retirer le fichier" })
  ).toBeVisible();

  await page.getByRole("textbox", { name: "Prénom", exact: true }).fill("Photo");
  await page
    .getByRole("textbox", { name: "Nom", exact: true })
    .fill(`Uploadee${ts}`);
  await page.getByRole("button", { name: "Créer la fiche" }).click();

  await expect(
    page.getByRole("heading", { name: `Photo Uploadee${ts}` })
  ).toBeVisible();
  // The stored pool file is served back and rendered on the fiche.
  const image = page.locator('article img[src*="/api/files/"]').first();
  await expect(image).toBeVisible();
});
