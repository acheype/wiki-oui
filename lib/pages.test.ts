import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormDescriptor } from "@/lib/form-descriptor";
import {
  ADDRESS_REFUSED,
  DELETE_REFUSED,
  RIGHTS_REFUSED,
  TRANSFER_REFUSED,
  WRITE_REFUSED,
} from "@/lib/permissions";

// The door's own test (ADR 0025). Everything else in this suite is pure, so
// the checks that stand between an actor and a write had nothing holding them:
// the rules were proved, their being *called* was not. Deleting an `await
// assertStructuring(…)` line reddened nothing until here.
//
// Prisma and the actor are the only things stubbed. What is asserted is what
// a missing check would change — the refusal comes back, and the write never
// reaches the database.

const { db, actor } = vi.hoisted(() => ({
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
  actor: { current: { username: null as string | null, groupSlugs: [] as string[] } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/permissions-db", () => ({
  currentActor: async () => actor.current,
  currentUsername: async () => actor.current.username,
  assertAdmin: async () => {},
}));
vi.mock("@/lib/groups-db", () => ({
  existingPrincipals: async () => ({ usernames: new Set(), groupSlugs: new Set() }),
  grantTarget: async () => null,
  listDirectory: async () => ({ people: [], groups: [] }),
}));

const {
  deletePageById,
  renamePageSlug,
  setPageRights,
  transferPageOwnership,
  writeEntryRevision,
  writePageContent,
  writeRestoredRevision,
} = await import("@/lib/pages");

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
  actor.current = { username, groupSlugs };
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

/** Every write of the door that a check stands in front of. */
const guarded: [string, string, () => Promise<unknown>][] = [
  ["deleting a page", DELETE_REFUSED, () => deletePageById("page-1")],
  [
    "handing a page over",
    TRANSFER_REFUSED,
    () => transferPageOwnership("compte-rendu", "jean-martin"),
  ],
  [
    "posing the rights",
    RIGHTS_REFUSED,
    () => setPageRights("compte-rendu", { scope: "everyone" }, { scope: "everyone" }),
  ],
  [
    "changing the address",
    ADDRESS_REFUSED,
    () => renamePageSlug("page-1", { oldSlug: "compte-rendu", newSlug: "cr" }, new Map()),
  ],
  [
    "writing the content",
    WRITE_REFUSED,
    () => writePageContent({ slug: "compte-rendu", content: "# Salut", tags: [] }),
  ],
  [
    "restoring a revision",
    WRITE_REFUSED,
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

describe("the door refuses what the bar would not offer", () => {
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

// The merge is the door's, not its caller's (docs/permissions.md § Champ): a
// revision holds a complete snapshot, so a save that replaced it would let
// whoever cannot see a salary destroy it just by saving the fiche.
describe("what a save may move, field by field", () => {
  const BUREAU = { scope: "restricted", groupSlugs: ["bureau"] } as const;
  const PAYROLL: FormDescriptor = {
    fields: [
      { type: "title", name: "title", label: "Titre" },
      { type: "text", name: "nom", label: "Nom" },
      { type: "text", name: "salaire", label: "Salaire", readAcl: BUREAU, writeAcl: BUREAU },
      { type: "tags", name: "mots-cles", label: "Mots-clés", writeAcl: BUREAU },
    ],
  };
  /** A fiche Jean may write, holding a salary that is not his to move. */
  const JEANS_ENTRY = {
    ...MARIES_PAGE,
    ownerUsername: "jean-martin",
    owner: { name: "Jean Martin", username: "jean-martin" },
    tags: ["paie"],
    current: { data: { title: "Paie", nom: "Marie", salaire: 42000 } },
  };
  const save = (data: Record<string, unknown>, tags: string[] = ["paie"]) =>
    writeEntryRevision({ pageId: "page-1", data, tags, descriptor: PAYROLL });
  const written = () =>
    db.revision.create.mock.calls.at(-1)?.[0].data.data as unknown;

  beforeEach(() => {
    db.page.findUniqueOrThrow.mockResolvedValue(JEANS_ENTRY);
    db.revision.create.mockResolvedValue({ id: "rev-2" });
  });

  it("lays what the actor may write over the revision it starts from", async () => {
    await save({ title: "Paie", nom: "Marie Durand", salaire: 0 });
    expect(written()).toEqual({
      title: "Paie",
      nom: "Marie Durand",
      salaire: 42000,
    });
  });

  // Ignored, not refused: a difference of rights must never be what makes a
  // save fail — and a save with nothing left to record records nothing.
  it("mints no revision when all that moved was refused", async () => {
    await save({ title: "Paie", nom: "Marie", salaire: 0 });
    expect(db.revision.create).not.toHaveBeenCalled();
  });

  it("lets the rule's own group move it", async () => {
    signedInAs("jean-martin", ["bureau"]);
    await save({ title: "Paie", nom: "Marie", salaire: 45000 });
    expect(written()).toEqual({ title: "Paie", nom: "Marie", salaire: 45000 });
  });

  // Tags live on the Page and not in the snapshot (ADR 0007), so the merge
  // cannot reach them: their field's own rule is applied beside it.
  it("keeps the tags of whoever may not move them", async () => {
    await save({ title: "Paie", nom: "Marie Durand" }, []);
    expect(db.page.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: { tags: ["paie"] },
    });
  });

  it("moves them for whoever may", async () => {
    signedInAs("jean-martin", ["bureau"]);
    await save({ title: "Paie", nom: "Marie Durand" }, []);
    expect(db.page.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: { tags: [] },
    });
  });

  // A restore is a write like any other, and a silent one: the restorer never
  // saw on screen what they would be putting back.
  it("merges a restored snapshot too", async () => {
    await writeRestoredRevision({
      pageId: "page-1",
      content: null,
      data: { title: "Paie", nom: "Marie", salaire: 1 },
      restoredFromId: "rev-1",
      descriptor: PAYROLL,
    });
    expect(written()).toEqual({ title: "Paie", nom: "Marie", salaire: 42000 });
  });
});

describe("the same writes, to whoever they answer to", () => {
  it("lets the owner delete their page, and lets nobody else", async () => {
    signedInAs("marie-durand");
    await deletePageById("page-1");
    expect(db.page.delete).toHaveBeenCalledWith({ where: { id: "page-1" } });
  });

  it("lets an administrator change an address, where the owner cannot", async () => {
    signedInAs("marie-durand");
    const rename = { oldSlug: "compte-rendu", newSlug: "cr" };
    await expect(renamePageSlug("page-1", rename, new Map())).rejects.toThrow(
      ADDRESS_REFUSED
    );

    signedInAs("wiki-admin", ["admins"]);
    await renamePageSlug("page-1", rename, new Map());
    expect(db.page.update).toHaveBeenCalledWith({
      where: { id: "page-1" },
      data: { slug: "cr" },
    });
  });
});
