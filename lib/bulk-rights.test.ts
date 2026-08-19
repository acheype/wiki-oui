import { describe, expect, it } from "vitest";
import { ADMINS_GROUP, type PageRights } from "@/lib/permissions";
import {
  type GrantTarget,
  alreadyGrants,
  grantAddsNothing,
  grantNote,
  grantTally,
  lotSelected,
  lotSubject,
  nothingToReplace,
  replacementNote,
} from "./bulk-rights";

const BUREAU: GrantTarget = {
  label: "@Bureau",
  ref: { groupSlug: "bureau" },
  groupSlugs: ["bureau"],
};
const PAUL: GrantTarget = {
  label: "Paul Riva",
  ref: { username: "paul-riva" },
  groupSlugs: [],
};

function page(rights: Partial<PageRights> = {}): PageRights {
  return {
    ownerUsername: "marie-durand",
    readScope: "restricted",
    writeScope: "restricted",
    acls: [],
    ...rights,
  };
}

describe("alreadyGrants", () => {
  it("says nothing to change on a page open to everyone", () => {
    expect(alreadyGrants(page({ readScope: "everyone" }), "READ", BUREAU)).toBe(
      true
    );
  });

  it("counts a group in as a signed-in person, where a person may be a visitor", () => {
    expect(
      alreadyGrants(page({ readScope: "authenticated" }), "READ", BUREAU)
    ).toBe(true);
  });

  it("finds the target in the « seulement » list", () => {
    const listed = page({
      acls: [{ kind: "READ", username: null, groupSlug: "bureau" }],
    });
    expect(alreadyGrants(listed, "READ", BUREAU)).toBe(true);
    expect(alreadyGrants(listed, "READ", PAUL)).toBe(false);
  });

  it("reads the other sense's list too, writing implying reading", () => {
    const writer = page({
      acls: [{ kind: "WRITE", username: null, groupSlug: "bureau" }],
    });
    expect(alreadyGrants(writer, "READ", BUREAU)).toBe(true);
    const reader = page({
      acls: [{ kind: "READ", username: null, groupSlug: "bureau" }],
    });
    expect(alreadyGrants(reader, "WRITE", BUREAU)).toBe(false);
  });

  it("holds the floor: the owner and the administrators are already in", () => {
    const owner: GrantTarget = {
      label: "Marie Durand",
      ref: { username: "marie-durand" },
      groupSlugs: [],
    };
    expect(alreadyGrants(page(), "WRITE", owner)).toBe(true);
    const admins: GrantTarget = {
      label: `@${ADMINS_GROUP.name}`,
      ref: { groupSlug: ADMINS_GROUP.slug },
      groupSlugs: [ADMINS_GROUP.slug],
    };
    expect(alreadyGrants(page(), "WRITE", admins)).toBe(true);
  });

  it("leaves a page nobody named to be added to", () => {
    expect(alreadyGrants(page(), "READ", BUREAU)).toBe(false);
  });
});

describe("grantTally", () => {
  it("splits the lot between what it adds and what already gives access", () => {
    const pages = [
      page({ readScope: "everyone" }),
      page(),
      page({ acls: [{ kind: "READ", username: null, groupSlug: "bureau" }] }),
      page(),
    ];
    expect(grantTally(pages, "READ", BUREAU)).toEqual({
      total: 4,
      added: 2,
      alreadyGranted: 2,
    });
  });
});

describe("grantNote", () => {
  it("counts in what changes, and sets aside what needs nothing", () => {
    const note = grantNote({ total: 40, added: 23, alreadyGranted: 17 }, "READ", BUREAU);
    expect(note.headline).toBe("@Bureau recevra l'accès en lecture à 23 pages.");
    expect(note.lines).toEqual([
      "17 pages lui donnent déjà accès — rien à changer.",
    ]);
  });

  it("says the other sense, and the single page, as they read", () => {
    const note = grantNote({ total: 1, added: 1, alreadyGranted: 0 }, "WRITE", PAUL);
    expect(note.headline).toBe("Paul Riva recevra l'accès en écriture à 1 page.");
    expect(note.lines).toEqual([]);
  });

  it("promises nothing to someone the whole lot already lets in", () => {
    expect(grantNote({ total: 3, added: 0, alreadyGranted: 3 }, "READ", BUREAU)).toEqual(
      {
        headline: "@Bureau a déjà accès en lecture à ces 3 pages : rien à changer.",
        lines: [],
      }
    );
    expect(
      grantNote({ total: 1, added: 0, alreadyGranted: 1 }, "WRITE", PAUL).headline
    ).toBe("Paul Riva a déjà accès en écriture à cette page : rien à changer.");
  });
});

describe("replacementNote", () => {
  it("announces that the lot loses what it holds, sense by sense", () => {
    const note = replacementNote(40, {
      READ: { scope: "everyone" },
      WRITE: { scope: "restricted" },
    });
    expect(note.headline).toBe("Les 40 pages auront exactement ces droits.");
    expect(note.lines).toEqual([
      "Les droits de lecture actuels sont perdus.",
      "Les droits de modification actuels sont perdus.",
    ]);
  });

  it("leaves untouched the sense left on « Ne pas changer »", () => {
    const note = replacementNote(1, { READ: { scope: "everyone" } });
    expect(note.headline).toBe("La page aura exactement ces droits.");
    expect(note.lines).toEqual([
      "Les droits de lecture actuels sont perdus.",
      "La modification n'est pas touchée.",
    ]);
  });

  it("asks for a sense when both are left on « Ne pas changer »", () => {
    expect(nothingToReplace({})).toBe(true);
    expect(replacementNote(40, {}).lines).toEqual([]);
  });
});

describe("lotSubject", () => {
  it("names one page as a page, and a lot by its count", () => {
    expect(lotSubject(1)).toBe("la page");
    expect(lotSubject(12)).toBe("12 pages");
  });
});

describe("lotSelected", () => {
  it("points at the lot with the article the count needs", () => {
    expect(lotSelected(12)).toBe("aux 12 pages sélectionnées");
    expect(lotSelected(1)).toBe("à la page sélectionnée");
  });
});

describe("grantAddsNothing", () => {
  const open = page({ readScope: "everyone", writeScope: "everyone" });
  const closed = page();

  it("holds the action back when nobody is named", () => {
    expect(grantAddsNothing([closed], {})).toBe(true);
    expect(grantAddsNothing([closed], { READ: [], WRITE: [] })).toBe(true);
  });

  it("holds it back when every name already has what it would add", () => {
    expect(grantAddsNothing([open], { READ: [BUREAU], WRITE: [PAUL] })).toBe(true);
  });

  it("lets it through as soon as one sense would add one access", () => {
    expect(grantAddsNothing([open, closed], { WRITE: [BUREAU] })).toBe(false);
  });
});
