import { describe, expect, it } from "vitest";
import {
  type AclEntry,
  ADMINS_GROUP,
  aclEntries,
  aclFloorLabels,
  aclFloorPrincipals,
  alwaysAllowedNote,
  knownEntries,
  ownerLine,
  ownerTransferNote,
  ownerTransferWarning,
  ruleSummary,
  scopeRefusal,
  scopesUnder,
  storedRights,
  withoutFloor,
} from "./rules";

describe("storedRights", () => {
  it("copies the scopes and turns the two lists into rows", () => {
    expect(
      storedRights(
        { scope: "everyone" },
        { scope: "restricted", usernames: ["marie-durand"], groupSlugs: ["bureau"] }
      )
    ).toEqual({
      readScope: "everyone",
      writeScope: "restricted",
      acls: [
        { kind: "WRITE", username: "marie-durand", groupSlug: null },
        { kind: "WRITE", username: null, groupSlug: "bureau" },
      ],
    });
  });

  it("writes no row for a scope that opens no list", () => {
    expect(aclEntries({ scope: "everyone", usernames: ["marie-durand"] }, "READ")).toEqual([]);
  });
});

describe("knownEntries", () => {
  // A default naming an account or a group that has gone must not grant
  // anything on the quiet: it is dropped as the copy is made (ADR 0026).
  const rows: AclEntry[] = [
    { kind: "READ", username: "marie-durand", groupSlug: null },
    { kind: "READ", username: "parti-e", groupSlug: null },
    { kind: "WRITE", username: null, groupSlug: "bureau" },
    { kind: "WRITE", username: null, groupSlug: "dissous" },
  ];

  it("keeps only the names that still exist", () => {
    expect(
      knownEntries(rows, {
        usernames: new Set(["marie-durand"]),
        groupSlugs: new Set(["bureau"]),
      })
    ).toEqual([rows[0], rows[2]]);
  });

  it("drops everything when nothing exists yet", () => {
    expect(
      knownEntries(rows, { usernames: new Set(), groupSlugs: new Set() })
    ).toEqual([]);
  });
});

describe("ownerLine", () => {
  it("names the owner with the word the rights themselves use", () => {
    expect(ownerLine("Marie Durand")).toBe("Propriétaire\u00A0: Marie Durand");
  });

  // Saying nothing would read as a line that failed to load, where the
  // absence of an owner is itself worth knowing: it is what leaves the page
  // to the administrators alone.
  it("says « Anonyme » when the page has no owner, never nothing", () => {
    expect(ownerLine(null)).toBe("Propriétaire\u00A0: Anonyme");
  });
});

describe("why a rule refuses, in words", () => {
  it("words nothing for a rule that refuses nobody", () => {
    expect(scopeRefusal({ scope: "everyone" }, [])).toBeNull();
  });

  it("names the level, not the person", () => {
    expect(scopeRefusal({ scope: "authenticated" }, [])).toBe(
      "Réservé aux personnes connectées."
    );
  });

  it("names the groups a « seulement » is posed for", () => {
    const rule = { scope: "restricted", groupSlugs: ["bureau"] } as const;
    expect(scopeRefusal(rule, ["Bureau"])).toBe("Réservé à @Bureau.");
    expect(scopeRefusal(rule, ["Bureau", "Trésorerie"])).toBe(
      "Réservé à @Bureau et @Trésorerie."
    );
  });

  it("stays vague when only people are named, who are nobody's business", () => {
    const rule = { scope: "restricted", usernames: ["marie-durand"] } as const;
    expect(scopeRefusal(rule, [])).toBe(
      "Réservé aux personnes autorisées."
    );
  });
});

describe("what handing a page over says", () => {
  it("agrees with the count, pronoun and all", () => {
    expect(ownerTransferNote(1)).toBe(
      "La personne choisie deviendra responsable de cette page. Elle pourra la voir, la modifier et définir qui peut y accéder."
    );
    expect(ownerTransferNote(12)).toBe(
      "La personne choisie deviendra responsable de ces 12 pages. Elle pourra les voir, les modifier et définir qui peut y accéder."
    );
  });

  it("warns that giving is final, whatever the count", () => {
    expect(ownerTransferWarning(1)).toBe(
      "Une fois le transfert effectué, seul le nouveau propriétaire, ou un administrateur, pourra transférer à nouveau la propriété de cette page."
    );
    expect(ownerTransferWarning(12)).toContain("la propriété de ces pages.");
  });
});

const MARIE_FLOOR = { owner: { username: "marie-durand", name: "Marie Durand" } };
const NO_OWNER_FLOOR = { owner: null };

describe("the floor a « seulement » list stands on", () => {
  it("shows the owner and the administrators, so the box is never empty", () => {
    expect(aclFloorLabels(MARIE_FLOOR)).toEqual({
      people: ["Marie Durand (propriétaire)"],
      groups: ["@Admins"],
    });
  });

  it("promises nothing about an owner the page no longer has", () => {
    expect(aclFloorLabels(NO_OWNER_FLOOR)).toEqual({
      people: [],
      groups: ["@Admins"],
    });
    expect(alwaysAllowedNote(NO_OWNER_FLOOR)).not.toContain("propriétaire");
    expect(alwaysAllowedNote(MARIE_FLOOR)).toContain(
      "Le propriétaire et les administrateurs"
    );
  });
});

describe("the scopes a rule may take under another", () => {
  // « Aucune restriction » already stands for the cap itself, so the widest
  // scope offered is the first one that says something the fiche has not.
  it("stops short of the cap, which is what posing nothing means", () => {
    expect(scopesUnder("everyone")).toEqual(["authenticated", "restricted"]);
  });

  // A field of a form whose fiches only signed-in people see: opening it to
  // everyone would promise an audience the fiche itself refuses.
  it("drops what is wider than the cap", () => {
    expect(scopesUnder("authenticated")).toEqual(["restricted"]);
  });

  // « Seulement » stays offered under a « seulement »: one list narrows
  // another — @Bureau inside a fiche opened to @Bureau and @Trésorerie.
  it("keeps « seulement » under a « seulement »", () => {
    expect(scopesUnder("restricted")).toEqual(["restricted"]);
  });

  // A form whose defaults were narrowed after the fact leaves fields holding
  // a scope the cap no longer offers. Dropping it from the radio group would
  // show a rule with nothing selected, and steal the choice from whoever came
  // to change it.
  it("keeps a scope already posed, wider than the cap or not", () => {
    expect(scopesUnder("restricted", "everyone")).toEqual([
      "everyone",
      "restricted",
    ]);
    expect(scopesUnder("everyone", "everyone")).toEqual([
      "everyone",
      "authenticated",
      "restricted",
    ]);
  });
});

describe("ruleSummary", () => {
  const directory = {
    people: [
      { username: "paul-riva", name: "Paul Riva" },
      { username: "jean-martin", name: "Jean Martin" },
    ],
    groups: [{ slug: "bureau", name: "Bureau" }],
  };

  it("names the two open scopes in the room a column leaves", () => {
    expect(ruleSummary({ scope: "everyone" }, MARIE_FLOOR, directory)).toBe("Tous");
    expect(ruleSummary({ scope: "authenticated" }, MARIE_FLOOR, directory)).toBe(
      "Connectés"
    );
  });

  it("reads an empty « seulement » list as the floor it stands on", () => {
    expect(ruleSummary({ scope: "restricted" }, MARIE_FLOOR, directory)).toBe(
      "Le propriétaire"
    );
    expect(ruleSummary({ scope: "restricted" }, NO_OWNER_FLOOR, directory)).toBe(
      "@Admins"
    );
  });

  it("names whoever is listed, and counts the rest", () => {
    expect(
      ruleSummary(
        { scope: "restricted", groupSlugs: ["bureau"] },
        MARIE_FLOOR,
        directory
      )
    ).toBe("@Bureau");
    expect(
      ruleSummary(
        {
          scope: "restricted",
          usernames: ["paul-riva", "jean-martin"],
          groupSlugs: ["bureau"],
        },
        MARIE_FLOOR,
        directory
      )
    ).toBe("Paul Riva +2");
  });
});

describe("withoutFloor", () => {
  const rows: AclEntry[] = [
    { kind: "READ", username: "marie-durand", groupSlug: null },
    { kind: "READ", username: "jean-martin", groupSlug: null },
    { kind: "WRITE", username: null, groupSlug: ADMINS_GROUP.slug },
    { kind: "WRITE", username: null, groupSlug: "bureau" },
  ];

  it("drops the rows the owner and the administrators already cover", () => {
    expect(withoutFloor(rows, MARIE_FLOOR)).toEqual([rows[1], rows[3]]);
  });

  it("keeps the owner's row when the page has lost its owner", () => {
    expect(withoutFloor(rows, NO_OWNER_FLOOR)).toEqual([
      rows[0],
      rows[1],
      rows[3],
    ]);
  });

  it("names the same principals the picker refuses to offer", () => {
    expect(aclFloorPrincipals(MARIE_FLOOR)).toEqual({
      usernames: ["marie-durand"],
      groupSlugs: [ADMINS_GROUP.slug],
    });
  });
});
