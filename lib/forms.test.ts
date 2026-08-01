import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_FORM_REFUSED } from "@/lib/permissions";

// What a screen announces and what it then shows have to be filtered the same
// way. Nothing held that: the count of `formulaires` read one clause and the
// list it heads read another, and for months every administrator was told
// « 0 fiche » over six — a wrong number is not an exception anyone notices,
// it just looks like an empty wiki.
//
// So the two are asked here for their clause, and held to the same one.

const { db, actor } = vi.hoisted(() => ({
  db: {
    form: { findMany: vi.fn(), create: vi.fn() },
    page: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  actor: { current: { username: null as string | null, groupSlugs: [] as string[] } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/permissions-db", () => ({
  currentActor: async () => actor.current,
  currentUsername: async () => actor.current.username,
  assertAdmin: async () => {},
}));

const {
  actorCanCreateForm,
  createForm,
  listFormsWithEntries,
  listFormsWithEntryCount,
} = await import("@/lib/forms");

/** The `where` each call handed Prisma for the entries of a form. */
function countClause() {
  const query = db.form.findMany.mock.calls.at(-1)?.[0];
  return query.include._count.select.entries.where;
}

function listClause() {
  const query = db.form.findMany.mock.calls.at(-1)?.[0];
  return query.include.entries.where;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.form.findMany.mockResolvedValue([]);
});

describe("the count of a screen and the list it heads", () => {
  const actors: [string, { username: string | null; groupSlugs: string[] }][] = [
    ["a visitor", { username: null, groupSlugs: [] }],
    ["an ordinary user", { username: "jean-martin", groupSlugs: ["bureau"] }],
    // The one whose clause comes out empty, and the one nobody doubts.
    ["an administrator", { username: "wiki-admin", groupSlugs: ["admins"] }],
  ];

  for (const [who, current] of actors) {
    it(`filter on one and the same clause for ${who}`, async () => {
      actor.current = current;
      await listFormsWithEntryCount();
      const announced = countClause();
      await listFormsWithEntries(["annuaire"]);
      expect(announced).toEqual(listClause());
    });
  }

  // An empty clause is what an administrator gets, and it has to travel as it
  // is: wrapped in an OR, Prisma would drop it and the count would answer on
  // the account pages alone.
  it("hands an administrator a clause that filters nothing out", async () => {
    actor.current = { username: "wiki-admin", groupSlugs: ["admins"] };
    await listFormsWithEntryCount();
    expect(countClause()).toEqual({});
  });

  it("still narrows what a visitor is counted, so nothing is opened", async () => {
    actor.current = { username: null, groupSlugs: [] };
    await listFormsWithEntryCount();
    expect(countClause()).not.toEqual({});
  });
});

// Creating a form was open to anyone who could reach the screen, which on a
// wiki that had closed its pages was still every signed-in member: a form
// shapes every fiche written with it and takes them all with it when it goes
// (ADR 0014), so it is the wiki's own rule that decides — and the check is
// held here, at the door, not in the button that hides it.
describe("the door on creating a form", () => {
  const DEFINITION = {
    name: "Agenda",
    schema: { fields: [] },
    template: null,
  };

  it("refuses a visitor, and writes nothing", async () => {
    actor.current = { username: null, groupSlugs: [] };
    expect(await actorCanCreateForm()).toBe(false);
    await expect(createForm("agenda", DEFINITION)).rejects.toThrow(
      CREATE_FORM_REFUSED
    );
    expect(db.form.create).not.toHaveBeenCalled();
  });

  // The shipped configuration writes « seulement » with an empty list, and on
  // a rule posed on the wiki there is no owner under it: an ordinary member
  // is refused, where the same shape on a page would let its owner through.
  it("refuses an ordinary member under the shipped configuration", async () => {
    actor.current = { username: "jean-martin", groupSlugs: ["bureau"] };
    expect(await actorCanCreateForm()).toBe(false);
    await expect(createForm("agenda", DEFINITION)).rejects.toThrow(
      CREATE_FORM_REFUSED
    );
    expect(db.form.create).not.toHaveBeenCalled();
  });

  it("lets an administrator through, and hands them what they made", async () => {
    actor.current = { username: "wiki-admin", groupSlugs: ["admins"] };
    expect(await actorCanCreateForm()).toBe(true);
    await createForm("agenda", DEFINITION);
    expect(db.form.create).toHaveBeenCalledWith({
      data: { ...DEFINITION, slug: "agenda", ownerUsername: "wiki-admin" },
    });
  });
});
