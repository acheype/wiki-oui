import { describe, expect, it } from "vitest";
import {
  type AclEntry,
  ADMINS_GROUP,
  REFUSALS,
  Refusal,
  refuse,
  refusalMessage,
  aclEntries,
  aclFloorPrincipals,
  knownEntries,
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
const MARIE_FLOOR = { owner: { username: "marie-durand", name: "Marie Durand" } };
const NO_OWNER_FLOOR = { owner: null };
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

describe("the refusal channel", () => {
  it("shows what the access layer meant to say", () => {
    try {
      refuse("delete");
    } catch (error) {
      expect(refusalMessage(error)).toBe(REFUSALS.delete);
    }
    expect.assertions(1);
  });

  it("keeps every other error off the screen", () => {
    // The one that mattered: an ORM message naming a column used to travel
    // straight into a toast, because the channel carried a string (issue #20).
    expect(refusalMessage(new Error('Unique constraint failed on "Page_slug_key"')))
      .toBe(REFUSALS.access);
    expect(refusalMessage(new TypeError("x is not a function"))).toBe(REFUSALS.access);
    expect(refusalMessage("something thrown that is not an error")).toBe(
      REFUSALS.access
    );
  });

  it("is an Error, so a stack trace still names where it was refused", () => {
    expect(new Refusal("write")).toBeInstanceOf(Error);
    expect(new Refusal("write").message).toBe(REFUSALS.write);
  });
});
