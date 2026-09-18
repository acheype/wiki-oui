import { expect, test } from "@playwright/test";
import { ADMIN } from "./support/admin";
import { CONTRIBUTOR, READER } from "./support/personas";
import { E2E } from "./support/fixtures";

// The permission parcours (ADR 0032), at the four storeys of docs/permissions.md.
// Each proves what no component test can: a guard deciding on a real session,
// against the running server and a disposable database. The restricted-rights
// content is seeded (prisma/seed/e2e-fixtures.ts); the roles are minted by the
// personas setup. Read refusal wording is REFUSALS (modules/permissions/rules.ts).
const REFUSED_READ = "Vous n'avez pas accès à cette page.";
const REFUSED_WRITE = "Vous n'avez pas le droit de modifier cette page.";
// The entry form words a refused creation in the scope's own terms
// (modules/forms/entry/refusal.ts): a « restricted » form with no named group.
const REFUSED_CREATE_ENTRY = "Réservé aux personnes autorisées.";

// --- P1 — droit de formulaire (créer une fiche) ------------------------------

test.describe("P1 — droit de formulaire", () => {
  test.describe("le contributeur, sans le droit de créer", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("voit le refus, pas le formulaire de saisie", async ({ page }) => {
      await page.goto(`/${E2E.entryFormPage}`);
      await expect(page.getByText(REFUSED_CREATE_ENTRY)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Créer la fiche" })
      ).toHaveCount(0);
    });
  });

  test.describe("l'administrateur, qui a le droit", () => {
    test.use({ storageState: ADMIN.statePath });

    test("voit le formulaire de saisie", async ({ page }) => {
      await page.goto(`/${E2E.entryFormPage}`);
      await expect(page.getByLabel(E2E.openFieldLabel)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Créer la fiche" })
      ).toBeVisible();
    });
  });
});

// --- P2 — droit de champ (sur le formulaire de saisie) -----------------------

test.describe("P2 — droit de champ à la saisie", () => {
  test.describe("le contributeur", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("ne voit pas le champ non lisible, voit grisé le champ non modifiable", async ({
      page,
    }) => {
      await page.goto(`/${E2E.fieldsEntry}/edit`);
      // A field it may read and write: present and usable.
      await expect(page.getByLabel(E2E.openFieldLabel)).toBeEnabled();
      // A field it may not read: absent, not shown empty.
      await expect(page.getByLabel(E2E.restrictedFieldLabel)).toHaveCount(0);
      // A field it may read but not fill: present and disabled (greyed).
      await expect(page.getByLabel(E2E.readOnlyFieldLabel)).toBeDisabled();
    });
  });

  test("un champ non modifiable est préservé à la sauvegarde", async ({
    browser,
  }) => {
    // The contributor edits the fiche, touching only the field it may fill.
    const cctx = await browser.newContext({
      storageState: CONTRIBUTOR.statePath,
    });
    const cpage = await cctx.newPage();
    await cpage.goto(`/${E2E.fieldsEntry}/edit`);
    await cpage.getByLabel(E2E.openFieldLabel).fill("Poste modifié");
    await cpage.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await cpage.waitForURL(`**/${E2E.fieldsEntry}`);
    await cctx.close();

    // An administrator confirms the merge left the restricted values in place —
    // saving what one cannot see never erases it (mergedEntryData).
    const actx = await browser.newContext({ storageState: ADMIN.statePath });
    const apage = await actx.newPage();
    const res = await apage.request.get(`/${E2E.fieldsEntry}/raw`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body[E2E.openFieldName]).toBe("Poste modifié");
    expect(body[E2E.restrictedFieldName]).toBe("4000");
    expect(body[E2E.readOnlyFieldName]).toBe("Note interne");
    await actx.close();
  });
});

// --- P3 — droit de fiche -----------------------------------------------------

test.describe("P3 — droit de fiche", () => {
  test.describe("le lecteur, hors de la liste", () => {
    test.use({ storageState: READER.statePath });

    test("est refusé sur la fiche restreinte", async ({ page }) => {
      await page.goto(`/${E2E.restrictedEntry}`);
      await expect(page.getByText(REFUSED_READ)).toBeVisible();
      await expect(page.getByText("Poste restreint")).toHaveCount(0);
    });

    test("reçoit 403 sur son /raw", async ({ page }) => {
      const res = await page.request.get(`/${E2E.restrictedEntry}/raw`);
      expect(res.status()).toBe(403);
    });
  });

  test.describe("l'administrateur", () => {
    test.use({ storageState: ADMIN.statePath });

    test("lit la fiche restreinte", async ({ page }) => {
      await page.goto(`/${E2E.restrictedEntry}`);
      // The title « Poste restreint » is also the poste value: match the heading.
      await expect(
        page.getByRole("heading", { name: "Poste restreint" })
      ).toBeVisible();
    });
  });
});

// --- P4 — droit de champ vu sur la fiche (rendu + /raw) -----------------------

test.describe("P4 — droit de champ sur la fiche", () => {
  test.describe("le contributeur", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("ne reçoit pas le champ restreint dans /raw", async ({ page }) => {
      const res = await page.request.get(`/${E2E.openEntry}/raw`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body[E2E.openFieldName]).toBe("Poste ouvert");
      expect(body).not.toHaveProperty(E2E.restrictedFieldName);
    });
  });

  test.describe("l'administrateur", () => {
    test.use({ storageState: ADMIN.statePath });

    test("reçoit le champ restreint dans /raw", async ({ page }) => {
      const res = await page.request.get(`/${E2E.openEntry}/raw`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body[E2E.restrictedFieldName]).toBe("1500");
    });
  });
});

// --- Droit de page : lecture -------------------------------------------------

test.describe("Droit de page — lecture restreinte", () => {
  test.describe("le lecteur", () => {
    test.use({ storageState: READER.statePath });

    test("est refusé sur la page restreinte", async ({ page }) => {
      await page.goto(`/${E2E.restrictedPage}`);
      await expect(page.getByText(REFUSED_READ)).toBeVisible();
    });
  });

  test.describe("l'administrateur", () => {
    test.use({ storageState: ADMIN.statePath });

    test("lit la page restreinte", async ({ page }) => {
      await page.goto(`/${E2E.restrictedPage}`);
      await expect(
        page.getByText("Contenu réservé aux administrateurs.")
      ).toBeVisible();
    });
  });
});

// --- Droit de page : écriture ------------------------------------------------

test.describe("Droit de page — écriture restreinte", () => {
  test.describe("le contributeur", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("lit la page mais est refusé à l'édition", async ({ page }) => {
      await page.goto(`/${E2E.readOnlyPage}`);
      await expect(
        page.getByText("Lisible par tous, modifiable par les administrateurs.")
      ).toBeVisible();
      await page.goto(`/${E2E.readOnlyPage}/edit`);
      await expect(page.getByText(REFUSED_WRITE)).toBeVisible();
    });
  });

  test.describe("l'administrateur", () => {
    test.use({ storageState: ADMIN.statePath });

    test("ouvre l'éditeur de la page", async ({ page }) => {
      await page.goto(`/${E2E.readOnlyPage}/edit`);
      await expect(page.locator(".cm-content")).toBeVisible();
    });
  });
});
