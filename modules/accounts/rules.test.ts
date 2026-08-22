import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FILTERS,
  deleteRefusal,
  deletionImpactLines,
  disableRefusal,
  matchesAccountFilter,
} from "./rules";
import { LAST_ADMIN_REFUSAL } from "@/modules/permissions/rules";

describe("ACCOUNT_FILTERS", () => {
  it("offers the four the system page shows, in the order it shows them", () => {
    expect(ACCOUNT_FILTERS.map((filter) => filter.label)).toEqual([
      "Tous",
      "Actifs",
      "Désactivés",
      "Invitations en attente",
    ]);
  });
});

describe("matchesAccountFilter", () => {
  it("keeps everyone under « Tous », invitations included", () => {
    expect(matchesAccountFilter("active", "all")).toBe(true);
    expect(matchesAccountFilter("disabled", "all")).toBe(true);
    expect(matchesAccountFilter("invited", "all")).toBe(true);
  });

  it("tells the three states apart", () => {
    expect(matchesAccountFilter("active", "active")).toBe(true);
    expect(matchesAccountFilter("disabled", "active")).toBe(false);
    expect(matchesAccountFilter("invited", "active")).toBe(false);
    expect(matchesAccountFilter("disabled", "disabled")).toBe(true);
    expect(matchesAccountFilter("invited", "invited")).toBe(true);
  });
});

describe("disableRefusal", () => {
  const marie = { username: "marie-durand", personUsername: "jean-martin" };

  it("lets an administrator cut someone else's access", () => {
    expect(disableRefusal({ ...marie, lastAdmin: false })).toBeNull();
  });

  it("refuses the action that would lock its own author out", () => {
    expect(
      disableRefusal({
        username: "jean-martin",
        personUsername: "jean-martin",
        lastAdmin: false,
      })
    ).toBe(
      "Vous ne pouvez pas désactiver votre propre compte. Déconnectez-vous plutôt."
    );
  });

  it("refuses to leave the wiki without an administrator", () => {
    expect(disableRefusal({ ...marie, lastAdmin: true })).toBe(
      LAST_ADMIN_REFUSAL
    );
  });
});

describe("deleteRefusal", () => {
  it("lets someone erase their own account, as the RGPD asks", () => {
    expect(
      deleteRefusal({
        username: "jean-martin",
        personUsername: "jean-martin",
        lastAdmin: false,
      })
    ).toBeNull();
  });

  it("holds the same floor as disabling", () => {
    expect(
      deleteRefusal({
        username: "marie-durand",
        personUsername: "jean-martin",
        lastAdmin: true,
      })
    ).toBe(LAST_ADMIN_REFUSAL);
  });

  it("holds it against the last administrator erasing themselves too", () => {
    expect(
      deleteRefusal({
        username: "jean-martin",
        personUsername: "jean-martin",
        lastAdmin: true,
      })
    ).toBe(LAST_ADMIN_REFUSAL);
  });
});

describe("deletionImpactLines", () => {
  it("announces the numbers the modal is there to show", () => {
    expect(
      deletionImpactLines({ pages: 12, forms: 2, revisions: 48 })
    ).toEqual([
      "12 pages et 2 formulaires lui appartiennent.",
      "48 révisions portent sa signature.",
    ]);
  });

  it("names only what there is, in the singular when there is one", () => {
    expect(deletionImpactLines({ pages: 1, forms: 0, revisions: 1 })).toEqual([
      "1 page lui appartient.",
      "1 révision porte sa signature.",
    ]);
  });

  it("says plainly when there is nothing to reassign", () => {
    expect(deletionImpactLines({ pages: 0, forms: 0, revisions: 0 })).toEqual([
      "Ce compte ne possède aucune page et ne signe aucune révision.",
    ]);
  });
});
