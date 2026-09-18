import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";

// The fiche parcours (ADR 0032): create and edit an entry of a seeded form
// (annuaire), through the generated entry form. Each crosses the server, the
// access layer and the database — the automatic title is computed on the server
// at save (ADR 0020), then read back from the stored snapshot. Unique names per
// run keep the parcours independent. Building a *form* is its own parcours,
// form-builder.spec.ts (the palette adds a field on click, no drag needed).

test.use({ storageState: ADMIN.statePath });

// --- K — create a fiche, automatic title, visible in EntriesView -------------

test("creating an annuaire fiche computes its title and lists it", async ({
  page,
}) => {
  const ts = Date.now();
  const prenom = "Zephyrin";
  const nom = `Testafiche${ts}`;
  const fullName = `${prenom} ${nom}`;

  await page.goto("/fiches?nouvelle&formulaire=annuaire");
  // By accessible name (role), not by label: a required field's <label> text
  // carries the « * » marker, which the control's name excludes.
  await page.getByRole("textbox", { name: "Prénom", exact: true }).fill(prenom);
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill(nom);
  await page.getByRole("button", { name: "Créer la fiche" }).click();

  // The title « {prenom} {nom} » was computed on save and is the fiche heading.
  await expect(page.getByRole("heading", { name: fullName })).toBeVisible();

  // And the new fiche shows up in the annuaire grid <EntriesView>.
  await page.goto("/trombi-annuaire");
  await expect(page.getByText(fullName)).toBeVisible();
});

// --- M — edit a fiche --------------------------------------------------------

test("editing a fiche updates its rendered value", async ({ page }) => {
  const ts = Date.now();
  const nom = `Editafiche${ts}`;
  const fonction = "Coordinatrice de test";

  await page.goto("/fiches?nouvelle&formulaire=annuaire");
  await page.getByRole("textbox", { name: "Prénom", exact: true }).fill("Iris");
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill(nom);
  await page.getByRole("button", { name: "Créer la fiche" }).click();
  await expect(
    page.getByRole("heading", { name: `Iris ${nom}` })
  ).toBeVisible();

  const slug = new URL(page.url()).pathname.slice(1);
  await page.goto(`/${slug}/edit`);
  await page
    .getByRole("textbox", { name: "Fonction, rôle dans le collectif" })
    .fill(fonction);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForURL(`**/${slug}`);

  await expect(page.getByText(fonction)).toBeVisible();
});
