import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";

// L — building a form (ADR 0014, ADR 0032). The FormBuilder palette adds a
// field on click (form-builder.tsx: each palette entry is a button calling
// addField); drag-and-drop only reorders the canvas, so no dnd is needed here.
// A new form is born with a title field already on the canvas. What e2e proves:
// the built descriptor is saved server-side and its entry form then offers the
// field a person clicked in.

test.use({ storageState: ADMIN.statePath });

test("L — a form built by clicking a palette field is saved and usable", async ({
  page,
}) => {
  const ts = Date.now();
  const formName = `E2E Builder ${ts}`;
  const slug = `e2e-builder-${ts}`;

  await page.goto("/formulaires?nouveau");
  await page.getByLabel("Nom du formulaire").fill(formName);
  // Add a « Texte court » field from the palette (a click, not a drag).
  await page.getByRole("button", { name: "Texte court", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  // Saving a new form lands back on the forms list (forms-admin.tsx).
  await page.waitForURL("**/formulaires");

  // The form persisted with its field: its entry form offers « Texte court ».
  await page.goto(`/fiches?nouvelle&formulaire=${slug}`);
  await expect(
    page.getByRole("textbox", { name: "Texte court" })
  ).toBeVisible();
});
