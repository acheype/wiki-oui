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

// --- P1 — form-level right to create a fiche ---------------------------------

test.describe("P1 — form-level right to create a fiche", () => {
  test.describe("the contributor, without the right", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("sees the refusal, not the entry form", async ({ page }) => {
      await page.goto(`/${E2E.entryFormPage}`);
      await expect(page.getByText(REFUSED_CREATE_ENTRY)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Créer la fiche" })
      ).toHaveCount(0);
    });
  });

  test.describe("the administrator, with the right", () => {
    test.use({ storageState: ADMIN.statePath });

    test("sees the entry form", async ({ page }) => {
      await page.goto(`/${E2E.entryFormPage}`);
      await expect(page.getByLabel(E2E.openFieldLabel)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Créer la fiche" })
      ).toBeVisible();
    });
  });
});

// --- P2 — field-level right at entry -----------------------------------------

test.describe("P2 — field-level right at entry", () => {
  test.describe("the contributor", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("cannot see the unreadable field, sees the unfillable one greyed", async ({
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

  test("an unfillable field survives a save", async ({ browser }) => {
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

// --- P3 — fiche-level read right ---------------------------------------------

test.describe("P3 — fiche-level read right", () => {
  test.describe("the reader, off the list", () => {
    test.use({ storageState: READER.statePath });

    test("is refused on the restricted fiche", async ({ page }) => {
      await page.goto(`/${E2E.restrictedEntry}`);
      await expect(page.getByText(REFUSED_READ)).toBeVisible();
      await expect(page.getByText("Poste restreint")).toHaveCount(0);
    });

    test("gets 403 on its /raw", async ({ page }) => {
      const res = await page.request.get(`/${E2E.restrictedEntry}/raw`);
      expect(res.status()).toBe(403);
    });
  });

  test.describe("the administrator", () => {
    test.use({ storageState: ADMIN.statePath });

    test("reads the restricted fiche", async ({ page }) => {
      await page.goto(`/${E2E.restrictedEntry}`);
      // The title « Poste restreint » is also the poste value: match the heading.
      await expect(
        page.getByRole("heading", { name: "Poste restreint" })
      ).toBeVisible();
    });
  });
});

// --- P4 — field-level right on the rendered fiche and /raw --------------------

test.describe("P4 — field-level right on the rendered fiche and /raw", () => {
  test.describe("the contributor", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("does not get the restricted field, in /raw or on the fiche", async ({
      page,
    }) => {
      const res = await page.request.get(`/${E2E.openEntry}/raw`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body[E2E.openFieldName]).toBe("Poste ouvert");
      expect(body).not.toHaveProperty(E2E.restrictedFieldName);

      // Same cut on the rendered fiche: the readable field shows (the title is
      // « Poste ouvert » too, so match the heading), the restricted one (label
      // and value) is absent.
      await page.goto(`/${E2E.openEntry}`);
      await expect(
        page.getByRole("heading", { name: "Poste ouvert" })
      ).toBeVisible();
      await expect(page.getByText(E2E.restrictedFieldLabel)).toHaveCount(0);
      await expect(page.getByText("1500")).toHaveCount(0);
    });
  });

  test.describe("the administrator", () => {
    test.use({ storageState: ADMIN.statePath });

    test("gets the restricted field, in /raw and on the fiche", async ({
      page,
    }) => {
      const res = await page.request.get(`/${E2E.openEntry}/raw`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body[E2E.restrictedFieldName]).toBe("1500");

      await page.goto(`/${E2E.openEntry}`);
      await expect(page.getByText(E2E.restrictedFieldLabel)).toBeVisible();
      await expect(page.getByText("1500")).toBeVisible();
    });
  });
});

// --- Page right — restricted read --------------------------------------------

test.describe("Page right — restricted read", () => {
  test.describe("the reader", () => {
    test.use({ storageState: READER.statePath });

    test("is refused on the restricted page", async ({ page }) => {
      await page.goto(`/${E2E.restrictedPage}`);
      await expect(page.getByText(REFUSED_READ)).toBeVisible();
    });
  });

  test.describe("the administrator", () => {
    test.use({ storageState: ADMIN.statePath });

    test("reads the restricted page", async ({ page }) => {
      await page.goto(`/${E2E.restrictedPage}`);
      await expect(
        page.getByText("Contenu réservé aux administrateurs.")
      ).toBeVisible();
    });
  });
});

// --- Page right — restricted write -------------------------------------------

test.describe("Page right — restricted write", () => {
  test.describe("the contributor", () => {
    test.use({ storageState: CONTRIBUTOR.statePath });

    test("reads the page but is refused at edit", async ({ page }) => {
      await page.goto(`/${E2E.readOnlyPage}`);
      await expect(
        page.getByText("Lisible par tous, modifiable par les administrateurs.")
      ).toBeVisible();
      await page.goto(`/${E2E.readOnlyPage}/edit`);
      await expect(page.getByText(REFUSED_WRITE)).toBeVisible();
    });
  });

  test.describe("the administrator", () => {
    test.use({ storageState: ADMIN.statePath });

    test("opens the page editor", async ({ page }) => {
      await page.goto(`/${E2E.readOnlyPage}/edit`);
      await expect(page.locator(".cm-content")).toBeVisible();
    });
  });
});
