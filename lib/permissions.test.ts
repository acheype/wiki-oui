import { describe, expect, it } from "vitest";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  type AclEntry,
  type Actor,
  type PageRights,
  type PermKind,
  type Scope,
  ADMINS_GROUP,
  SCOPES,
  aclEntries,
  canRead,
  aclFloorLabels,
  alwaysAllowedNote,
  canWrite,
  aclFloorPrincipals,
  knownEntries,
  ownerLine,
  withoutFloor,
  ownsPage,
  permissionsOn,
  anyClause,
  listReadableWhere,
  readableWhere,
  ownerTransferNote,
  ownerTransferWarning,
  ruleAllows,
  scopeRefusal,
  ruleSummary,
  storedRights,
  writableWhere,
} from "./permissions";

const VISITOR: Actor = { username: null, groupSlugs: [] };
const MARIE: Actor = { username: "marie-durand", groupSlugs: [] };
// Bureau is nested in Rédacteurs, so both slugs are already in the effective
// list lib/groups.ts hands over.
const JEAN: Actor = { username: "jean-martin", groupSlugs: ["bureau", "redacteurs"] };
const ADMIN: Actor = { username: "wiki-admin", groupSlugs: [ADMINS_GROUP.slug] };

function page(rights: Partial<PageRights> = {}): PageRights {
  return {
    ownerUsername: "marie-durand",
    readScope: "everyone",
    writeScope: "restricted",
    acls: [],
    ...rights,
  };
}

describe("ruleAllows", () => {
  it("lets anyone through the everyone scope", () => {
    expect(ruleAllows(VISITOR, { scope: "everyone" })).toBe(true);
  });

  it("holds a visitor back from what is open to signed-in people", () => {
    expect(ruleAllows(VISITOR, { scope: "authenticated" })).toBe(false);
    expect(ruleAllows(MARIE, { scope: "authenticated" })).toBe(true);
  });

  it("reads the list only under the « seulement » scope", () => {
    const listed = { scope: "restricted", usernames: ["marie-durand"] } as const;
    expect(ruleAllows(MARIE, listed)).toBe(true);
    expect(ruleAllows(JEAN, listed)).toBe(false);
  });

  it("counts a group the actor reaches by nesting", () => {
    expect(ruleAllows(JEAN, { scope: "restricted", groupSlugs: ["redacteurs"] })).toBe(true);
  });

  it("lets nobody through an empty « seulement » list", () => {
    for (const actor of [VISITOR, MARIE, JEAN]) {
      expect(ruleAllows(actor, { scope: "restricted" })).toBe(false);
    }
  });
});

describe("ownsPage", () => {
  it("stands the owner and the administrators on the floor", () => {
    expect(ownsPage(MARIE, page())).toBe(true);
    expect(ownsPage(ADMIN, page())).toBe(true);
    expect(ownsPage(JEAN, page())).toBe(false);
  });

  // A visitor's username is null, and so is an unowned page's owner: comparing
  // the two straight would hand every seeded example page to anyone at all.
  it("leaves an unowned page to the administrators, a visitor included", () => {
    const orphan = page({ ownerUsername: null });
    expect(ownsPage(VISITOR, orphan)).toBe(false);
    expect(ownsPage(MARIE, orphan)).toBe(false);
    expect(ownsPage(ADMIN, orphan)).toBe(true);
  });
});

describe("canWrite", () => {
  it("always allows the owner, who never appears in the list", () => {
    expect(canWrite(MARIE, page({ writeScope: "restricted" }))).toBe(true);
  });

  it("always allows an administrator", () => {
    expect(canWrite(ADMIN, page({ writeScope: "restricted" }))).toBe(true);
  });

  it("reads the scope of a page without an owner, whose floor is just empty", () => {
    const orphan = (writeScope: Scope) => page({ ownerUsername: null, writeScope });
    expect(canWrite(VISITOR, orphan("everyone"))).toBe(true);
    expect(canWrite(VISITOR, orphan("authenticated"))).toBe(false);
    expect(canWrite(JEAN, orphan("authenticated"))).toBe(true);
  });

  it("leaves an unowned page at « seulement » to the administrators alone", () => {
    const orphan = page({ ownerUsername: null, writeScope: "restricted" });
    expect(canWrite(VISITOR, orphan)).toBe(false);
    expect(canWrite(JEAN, orphan)).toBe(false);
    expect(canWrite(ADMIN, orphan)).toBe(true);
  });

  it("allows whoever the write list names", () => {
    const shared = page({
      writeScope: "restricted",
      acls: [{ kind: "WRITE", username: null, groupSlug: "bureau" }],
    });
    expect(canWrite(JEAN, shared)).toBe(true);
  });

  it("ignores a read right when deciding on writing", () => {
    const readable = page({
      writeScope: "restricted",
      acls: [{ kind: "READ", username: null, groupSlug: "bureau" }],
    });
    expect(canWrite(JEAN, readable)).toBe(false);
  });
});

describe("canRead", () => {
  it("lets whoever may write read, whatever the read scope says", () => {
    const closed = page({
      readScope: "restricted",
      writeScope: "restricted",
      acls: [{ kind: "WRITE", username: "jean-martin", groupSlug: null }],
    });
    expect(canRead(JEAN, closed)).toBe(true);
  });

  it("refuses a visitor a page open to signed-in people only", () => {
    expect(canRead(VISITOR, page({ readScope: "authenticated" }))).toBe(false);
  });

  it("keeps an unowned page readable when its scope says so", () => {
    expect(canRead(VISITOR, page({ ownerUsername: null }))).toBe(true);
  });
});

describe("permissionsOn", () => {
  // The rungs of docs/permissions.md § Quel droit commande quelle action, on the
  // page the whole file reads: Marie owns it, Jean may write it.
  const shared = page({
    writeScope: "restricted",
    acls: [{ kind: "WRITE", username: "jean-martin", groupSlug: null }],
  });

  it("stops an author at editing, whatever they may write", () => {
    expect(permissionsOn(JEAN, shared)).toEqual({
      write: true,
      structuring: false,
      address: false,
    });
  });

  it("opens the structuring permissions to the owner, the address to nobody", () => {
    expect(permissionsOn(MARIE, shared)).toEqual({
      write: true,
      structuring: true,
      address: false,
    });
  });

  it("opens every rung to an administrator", () => {
    expect(permissionsOn(ADMIN, shared)).toEqual({
      write: true,
      structuring: true,
      address: true,
    });
  });

  it("offers a visitor nothing on a page they can only read", () => {
    expect(permissionsOn(VISITOR, page())).toEqual({
      write: false,
      structuring: false,
      address: false,
    });
  });

  // An unowned page has an empty floor, so the structuring rung is the
  // administrators' alone — even for someone the write list names.
  it("leaves the structuring permissions of an unowned page to the administrators", () => {
    const orphan = page({
      ownerUsername: null,
      writeScope: "everyone",
    });
    expect(permissionsOn(JEAN, orphan)).toEqual({
      write: true,
      structuring: false,
      address: false,
    });
  });
});

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

// --- the crossing ------------------------------------------------------------

// The one thing that could go wrong silently: a filter clause that disagrees
// with the check. So the clauses are run here against the same plain pages the
// check reads, by an interpreter of the handful of shapes they are built from
// — anything else throws rather than passing by default.

function whereMatches(
  where: Prisma.PageWhereInput,
  subject: PageRights & { slug?: string }
): boolean {
  return Object.entries(where).every(([key, condition]) => {
    switch (key) {
      case "OR":
        return (condition as Prisma.PageWhereInput[]).some((branch) =>
          whereMatches(branch, subject)
        );
      case "readScope":
        return subject.readScope === condition;
      case "writeScope":
        return subject.writeScope === condition;
      case "ownerUsername":
        return condition !== null && typeof condition === "object"
          ? subject.ownerUsername !== null // the only object form built is { not: null }
          : subject.ownerUsername === condition;
      case "acls": {
        const some = (condition as { some: Prisma.PageAclWhereInput }).some;
        return subject.acls.some((acl) => aclMatches(some, acl));
      }
      case "slug":
        // The account pages, named one by one: the only branch that speaks of
        // a page rather than of a right.
        return (condition as { in: string[] }).in.includes(subject.slug ?? "");
      default:
        throw new Error(`unknown clause key "${key}"`);
    }
  });
}

function aclMatches(where: Prisma.PageAclWhereInput, acl: AclEntry): boolean {
  return Object.entries(where).every(([key, condition]) => {
    switch (key) {
      case "OR":
        return (condition as Prisma.PageAclWhereInput[]).some((branch) =>
          aclMatches(branch, acl)
        );
      case "kind":
        return acl.kind === condition;
      case "username":
        return acl.username === condition;
      case "groupSlug":
        return (
          acl.groupSlug !== null &&
          (condition as { in: string[] }).in.includes(acl.groupSlug)
        );
      default:
        throw new Error(`unknown ACL clause key "${key}"`);
    }
  });
}

const OWNERS = [null, "marie-durand", "jean-martin"];
const LISTS: AclEntry[][] = [
  [],
  [{ kind: "READ", username: "marie-durand", groupSlug: null }],
  [{ kind: "WRITE", username: "marie-durand", groupSlug: null }],
  [{ kind: "READ", username: null, groupSlug: "bureau" }],
  [{ kind: "WRITE", username: null, groupSlug: "redacteurs" }],
  [
    { kind: "READ", username: null, groupSlug: "bureau" },
    { kind: "WRITE", username: "jean-martin", groupSlug: null },
  ],
];

function everyPage(): PageRights[] {
  const pages: PageRights[] = [];
  for (const readScope of SCOPES as readonly Scope[]) {
    for (const writeScope of SCOPES as readonly Scope[]) {
      for (const ownerUsername of OWNERS) {
        for (const acls of LISTS) {
          pages.push({ ownerUsername, readScope, writeScope, acls });
        }
      }
    }
  }
  return pages;
}

describe("the filter clause and the unit decision", () => {
  const actors: [string, Actor][] = [
    ["a visitor", VISITOR],
    ["someone with no group", MARIE],
    ["someone in two groups", JEAN],
    ["an administrator", ADMIN],
  ];

  const senses: [PermKind, typeof canRead, typeof readableWhere][] = [
    ["READ", canRead, readableWhere],
    ["WRITE", canWrite, writableWhere],
  ];

  for (const [who, actor] of actors) {
    for (const [kind, decide, clause] of senses) {
      it(`give the same verdict on ${kind} for ${who}`, () => {
        const where = clause(actor);
        const disagreements = everyPage().filter(
          (subject) => decide(actor, subject) !== whereMatches(where, subject)
        );
        expect(disagreements).toEqual([]);
      });
    }
  }
});

describe("anyClause", () => {
  // The trap it exists for: `{}` means every row, and Prisma drops an empty
  // branch from an OR — so joining it by hand turns « everything » into
  // « only the other branches ».
  it("lets an empty clause absorb the others, as « everything » does", () => {
    expect(anyClause([{}, { slug: { in: ["connexion"] } }])).toEqual({});
  });

  it("joins the rest with an OR", () => {
    expect(
      anyClause([{ readScope: "everyone" }, { slug: { in: ["connexion"] } }])
    ).toEqual({
      OR: [{ readScope: "everyone" }, { slug: { in: ["connexion"] } }],
    });
  });
});

describe("the read clause of a list", () => {
  const ALWAYS = ["connexion", "inscription"];

  // Prisma drops an empty branch from an OR, so wrapping an administrator's
  // clause — which is empty, they read everything — would leave only the
  // account pages, hiding the whole wiki from whoever has the most rights.
  it("hands an administrator's clause back untouched, never inside an OR", () => {
    expect(listReadableWhere(ADMIN, ALWAYS)).toEqual({});
  });

  it("opens the account pages to whoever the rights would refuse", () => {
    const where = listReadableWhere(VISITOR, ALWAYS);
    const closed = page({ ownerUsername: null, readScope: "restricted", writeScope: "restricted" });
    expect(whereMatches(where, closed)).toBe(false);
    expect(whereMatches(where, { ...closed, slug: "connexion" })).toBe(true);
  });

  it("still lets an administrator through every page", () => {
    const where = listReadableWhere(ADMIN, ALWAYS);
    const refused = everyPage().filter((subject) => !whereMatches(where, subject));
    expect(refused).toEqual([]);
  });
});
