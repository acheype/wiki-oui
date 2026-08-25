import { describe, expect, it } from "vitest";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  type AclEntry,
  type PageRights,
  type PermKind,
  type Person,
  type Scope,
  ADMINS_GROUP,
  SCOPES,
} from "@/modules/permissions/rules";
import {
  anyClause,
  canRead,
  canWrite,
  ownsPage,
  permissionsOn,
  readableWhere,
  ruleAllows,
  writableWhere,
} from "./rules";

const VISITOR: Person = { username: null, groupSlugs: [] };
const MARIE: Person = { username: "marie-durand", groupSlugs: [] };
// Bureau is nested in Rédacteurs, so both slugs are already in the effective
// list effectiveGroups (modules/permissions/groups.ts) hands over.
const JEAN: Person = { username: "jean-martin", groupSlugs: ["bureau", "redacteurs"] };
const ADMIN: Person = { username: "wiki-admin", groupSlugs: [ADMINS_GROUP.slug] };

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

  it("counts a group the person reaches by nesting", () => {
    expect(ruleAllows(JEAN, { scope: "restricted", groupSlugs: ["redacteurs"] })).toBe(true);
  });

  it("lets nobody through an empty « seulement » list", () => {
    for (const person of [VISITOR, MARIE, JEAN]) {
      expect(ruleAllows(person, { scope: "restricted" })).toBe(false);
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
  const people: [string, Person][] = [
    ["a visitor", VISITOR],
    ["someone with no group", MARIE],
    ["someone in two groups", JEAN],
    ["an administrator", ADMIN],
  ];

  const senses: [PermKind, typeof canRead, typeof readableWhere][] = [
    ["READ", canRead, readableWhere],
    ["WRITE", canWrite, writableWhere],
  ];

  for (const [who, person] of people) {
    for (const [kind, decide, clause] of senses) {
      it(`give the same verdict on ${kind} for ${who}`, () => {
        const where = clause(person);
        const disagreements = everyPage().filter(
          (subject) => decide(person, subject) !== whereMatches(where, subject)
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

describe("the clause an administrator gets", () => {
  // The property anyClause exists for, held here rather than inferred: an
  // administrator reads everything, so their clause is empty — and an empty
  // clause is the one Prisma drops from an OR.
  it("is empty, in both senses", () => {
    expect(readableWhere(ADMIN)).toEqual({});
    expect(writableWhere(ADMIN)).toEqual({});
  });

  it("is never empty for anyone else", () => {
    expect(readableWhere(VISITOR)).not.toEqual({});
    expect(readableWhere(MARIE)).not.toEqual({});
  });
});
