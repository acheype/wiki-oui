import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { CONTRIBUTOR, READER } from "./support/personas";
import { createPage } from "./support/pages";

// O — groups compose into rights (ADR 0023/0024, ADR 0032). What only e2e
// proves: creating a group, adding a member, and granting that group a right
// actually changes what a real session may do. The parcours grants write to the
// group and leaves read open, so the group's own « Ajouter… » is the only one
// on the rights dialog (an unrestricted read shows no principal box). Self-
// contained with unique names, run as the administrator who owns the page.

const REFUSED_WRITE = "Vous n'avez pas le droit de modifier cette page.";

test.use({ storageState: ADMIN.statePath });

test("O — a group grants write, and membership decides who may edit", async ({
  page,
  browser,
}) => {
  const ts = Date.now();
  const groupName = `E2e Groupe ${ts}`;
  const groupSlug = `e2e-groupe-${ts}`;
  const pageSlug = `e2e-groupe-page-${ts}`;

  // 1. Create the group on gerer-utilisateurs; creating it opens its editor.
  await page.goto("/gerer-utilisateurs");
  await page.getByRole("button", { name: "Nouveau groupe" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nom").fill(groupName);
  await dialog.getByRole("button", { name: "Créer le groupe" }).click();
  // Predicate, not a glob: a « ? » in a glob pattern is a wildcard.
  await page.waitForURL((url) => url.searchParams.get("groupe") === groupSlug);

  // 2. Add the reader to the group (member add is immediate, group-editor.tsx).
  await page.getByRole("button", { name: "Ajouter…" }).click();
  await page.getByPlaceholder("Rechercher une personne…").fill("Lea");
  // Anchor the name: the users list below also has an « Actions sur le compte
  // de Lea Lecteur » button, so a bare « Lea Lecteur » match is ambiguous.
  await page.getByRole("button", { name: /^Lea Lecteur/ }).click();
  // The member row now offers to remove them — unique to the group editor.
  await expect(
    page.getByRole("button", { name: `Retirer ${READER.name}` })
  ).toBeVisible();

  // 3. Create a page (owned by the admin), then grant write to the group,
  //    leaving read open so only the write « Ajouter… » is on the dialog.
  await createPage(page, pageSlug, "# Page de groupe\n\nContenu.");
  await page.goto(`/${pageSlug}`);
  await page.getByRole("button", { name: "Plus d'actions" }).click();
  await page.getByRole("menuitem", { name: /Modifier les accès/ }).click();

  // The write scope is « restricted » by its stable id, not by the text
  // « Seulement » (which reads twice — once for read, once for write).
  await page.locator('label[for="page-write-acl-restricted"]').click();
  await page.getByRole("button", { name: "Ajouter…" }).click();
  await page
    .getByPlaceholder("Rechercher une personne, un groupe…")
    .fill("E2e Groupe");
  await page.getByRole("button", { name: `@${groupName}` }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

  // 4. The member may edit; a non-member may not — same page, opposite verdict.
  const reader = await browser.newContext({ storageState: READER.statePath });
  const readerPage = await reader.newPage();
  await readerPage.goto(`/${pageSlug}/edit`);
  await expect(readerPage.locator(".cm-content")).toBeVisible();
  await reader.close();

  const contributor = await browser.newContext({
    storageState: CONTRIBUTOR.statePath,
  });
  const contributorPage = await contributor.newPage();
  await contributorPage.goto(`/${pageSlug}/edit`);
  await expect(contributorPage.getByText(REFUSED_WRITE)).toBeVisible();
  await contributor.close();
});
