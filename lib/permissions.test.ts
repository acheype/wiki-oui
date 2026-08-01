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
  knownEntries,
  ownerLine,
  ownsPage,
  readableWhere,
  ruleAllows,
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

  // The consequence the spec calls mechanical: no owner and nobody listed
  // leaves the administrators, without a rule saying so anywhere.
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
    // Escaped rather than typed: the no-break space before the colon is the
    // French rule, and it has to be visible to whoever edits this line.
    expect(ownerLine("Marie Durand")).toBe("Propriétaire\u00A0: Marie Durand");
  });

  it("says nothing when the page no longer has an owner", () => {
    expect(ownerLine(null)).toBeNull();
  });
});

describe("the floor a « seulement » list stands on", () => {
  it("shows the owner and the administrators, so the box is never empty", () => {
    expect(aclFloorLabels({ ownerName: "Marie Durand" })).toEqual({
      people: ["Marie Durand (propriétaire)"],
      groups: ["@Admins"],
    });
  });

  it("promises nothing about an owner the page no longer has", () => {
    expect(aclFloorLabels({ ownerName: null })).toEqual({
      people: [],
      groups: ["@Admins"],
    });
    expect(alwaysAllowedNote({ ownerName: null })).not.toContain("propriétaire");
    expect(alwaysAllowedNote({ ownerName: "Marie Durand" })).toContain(
      "Le propriétaire et les administrateurs"
    );
  });
});

// --- the crossing ------------------------------------------------------------

// The one thing that could go wrong silently: a filter clause that disagrees
// with the check. So the clauses are run here against the same plain pages the
// check reads, by an interpreter of the handful of shapes they are built from
// — anything else throws rather than passing by default.

function whereMatches(where: Prisma.PageWhereInput, subject: PageRights): boolean {
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
