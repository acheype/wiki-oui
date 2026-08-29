import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFUSALS,
} from "@/modules/permissions/rules";

// The guards' own test (ADR 0025). Everything else in this suite is pure, so
// the checks that stand between a person and a write had nothing holding them:
// the rules were proved, their being *called* was not. Deleting an `await
// assertStructuring(…)` line reddened nothing until here.
//
// Prisma and the person are the only things stubbed. What is asserted is what
// a missing check would change — the refusal comes back, and the write never
// reaches the database.
//
// Spans modules/pages/content.ts, modules/pages/access/page-rights.ts and
// modules/pages/revisions.ts on purpose: this is a test of
// modules/pages/access/guards.ts's own guards (assertStructuring,
// assertAddress, assertCanWrite), exercised through every public function
// that calls them — not a test of any one of those three files' own business
// logic.

const { db, person } = vi.hoisted(() => ({
  db: {
    page: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    pageAcl: { deleteMany: vi.fn(), createMany: vi.fn() },
    revision: { create: vi.fn() },
    form: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
    // The address sweep retcons references in raw SQL (ADR 0016); it has its
    // own test, and here it only has to not stand in the way.
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
  person: { current: { username: null as string | null, groupSlugs: [] as string[] } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// The session, not the verdicts: modules/permissions/person.ts runs for real
// here, so what the guards ask it is the rule itself and not a second spelling
// of it in this file.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/accounts/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        person.current.username
          ? { user: { username: person.current.username, name: person.current.username } }
          : null,
    },
  },
}));
vi.mock("@/modules/permissions/groups-directory", () => ({
  currentGroupSlugs: async () => person.current.groupSlugs,
  existingPrincipals: async () => ({ usernames: new Set(), groupSlugs: new Set() }),
  grantTarget: async () => null,
  listDirectory: async () => ({ people: [], groups: [] }),
}));

const { deletePageBySlug, renamePageSlug, writePageContent } = await import(
  "@/modules/pages/content"
);
const { setPageRights, transferPageOwnership } = await import("@/modules/pages/access/page-rights");
const { writeRestoredRevision } = await import("@/modules/pages/revisions");

/** A page Marie owns, closed to everyone else in both senses. */
const MARIES_PAGE = {
  id: "page-1",
  slug: "compte-rendu",
  ownerUsername: "marie-durand",
  readScope: "restricted",
  writeScope: "restricted",
  acls: [],
  owner: { name: "Marie Durand", username: "marie-durand" },
  formId: null,
  tags: [],
  current: null,
};

function signedInAs(username: string | null, groupSlugs: string[] = []) {
  person.current = { username, groupSlugs };
}

beforeEach(() => {
  vi.clearAllMocks();
  signedInAs("jean-martin"); // never the owner, never an administrator
  db.page.findUnique.mockResolvedValue(MARIES_PAGE);
  db.page.findUniqueOrThrow.mockResolvedValue(MARIES_PAGE);
  db.page.findMany.mockResolvedValue([MARIES_PAGE]);
  db.form.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(0);
  // Runs the callback so that a missing check would really reach the writes.
  db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) =>
    typeof run === "function" ? run(db) : undefined
  );
});

/** Every write a guard stands in front of. */
const guarded: [string, string, () => Promise<unknown>][] = [
  ["deleting a page", REFUSALS.delete, () => deletePageBySlug("compte-rendu")],
  [
    "handing a page over",
    REFUSALS.transfer,
    () => transferPageOwnership("compte-rendu", "jean-martin"),
  ],
  [
    "posing the rights",
    REFUSALS.rights,
    () => setPageRights("compte-rendu", { scope: "everyone" }, { scope: "everyone" }),
  ],
  [
    "changing the address",
    REFUSALS.address,
    () => renamePageSlug("page-1", { oldSlug: "compte-rendu", newSlug: "cr" }, new Map()),
  ],
  [
    "writing the content",
    REFUSALS.write,
    () => writePageContent({ slug: "compte-rendu", content: "# Salut", tags: [] }),
  ],
  [
    "restoring a revision",
    REFUSALS.write,
    () =>
      writeRestoredRevision({
        pageId: "page-1",
        content: "# Ancien",
        data: undefined,
        restoredFromId: "rev-1",
        descriptor: null,
      }),
  ],
];

describe("the guards refuse what the bar would not offer", () => {
  for (const [what, refusal, call] of guarded) {
    it(`refuses ${what} to someone the page does not answer to`, async () => {
      await expect(call()).rejects.toThrow(refusal);
    });
  }

  // The refusal alone is not the point: a check that threw *after* writing
  // would pass the test above and still have destroyed something.
  it("writes nothing at all when it refuses", async () => {
    for (const [, , call] of guarded) {
      await call().catch(() => null);
    }
    expect(db.page.delete).not.toHaveBeenCalled();
    expect(db.page.update).not.toHaveBeenCalled();
    expect(db.page.updateMany).not.toHaveBeenCalled();
    expect(db.page.create).not.toHaveBeenCalled();
    expect(db.pageAcl.deleteMany).not.toHaveBeenCalled();
    expect(db.revision.create).not.toHaveBeenCalled();
  });
});

describe("the same writes, to whoever they answer to", () => {
  it("lets the owner delete their page, and lets nobody else", async () => {
    signedInAs("marie-durand");
    await deletePageBySlug("compte-rendu");
    expect(db.page.delete).toHaveBeenCalledWith({ where: { id: "page-1" } });
  });

  it("lets an administrator change an address, where the owner cannot", async () => {
    signedInAs("marie-durand");
    const rename = { oldSlug: "compte-rendu", newSlug: "cr" };
    await expect(renamePageSlug("page-1", rename, new Map())).rejects.toThrow(
      REFUSALS.address
    );

    signedInAs("wiki-admin", ["admins"]);
    await renamePageSlug("page-1", rename, new Map());
    expect(db.page.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: { slug: "cr" },
    });
  });
});
