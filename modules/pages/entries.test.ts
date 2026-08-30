import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormDescriptor } from "@/modules/forms/form-descriptor";

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
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
  person: { current: { username: null as string | null, groupSlugs: [] as string[] } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
// The session, not the verdicts: modules/permissions/person.ts runs for real
// here, so what the code under test asks it is the rule itself and not a
// second spelling of it in this file.
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

const { writeEntryRevision } = await import("@/modules/pages/entries");
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
  db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) =>
    typeof run === "function" ? run(db) : undefined
  );
});

// The merge is the guard's, not its caller's (docs/permissions.md § Champ): a
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
  const save = (data: Record<string, unknown>) =>
    writeEntryRevision({ pageId: "page-1", data, descriptor: PAYROLL });
  const written = () =>
    db.revision.create.mock.calls.at(-1)?.[0].data.data as unknown;

  beforeEach(() => {
    db.page.findUniqueOrThrow.mockResolvedValue(JEANS_ENTRY);
    db.revision.create.mockResolvedValue({ id: "rev-2" });
  });

  it("lays what the person may write over the revision it starts from", async () => {
    await save({ title: "Paie", nom: "Marie Durand", salaire: 0 });
    expect(written()).toEqual({
      title: "Paie",
      nom: "Marie Durand",
      salaire: 42000,
    });
  });

  // docs/permissions.md § /{slug}/raw: written in the form's own order —
  // title first — regardless of the order the revision it starts from
  // happens to carry (storage makes no promise there, jsonb included).
  it("writes the revision back in the form's own field order, title first", async () => {
    db.page.findUniqueOrThrow.mockResolvedValue({
      ...JEANS_ENTRY,
      current: { data: { salaire: 42000, nom: "Marie", title: "Paie" } },
    });
    signedInAs("jean-martin", ["bureau"]);
    await save({ title: "Paie modifiée", nom: "Marie", salaire: 42000 });
    expect(Object.keys(written() as object)).toEqual(["title", "nom", "salaire"]);
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

  // A « Mots-clés » field is an ordinary field of the fiche (docs/forms.md):
  // its value rides in the snapshot, so the merge decides on it like on any
  // other — nothing of it reaches Page.tags, which belongs to the page.
  it("holds back the keywords of whoever may not move them", async () => {
    await save({ title: "Paie", nom: "Marie Durand", "mots-cles": ["rh"] });
    expect(written()).toEqual({
      title: "Paie",
      nom: "Marie Durand",
      salaire: 42000,
    });
  });

  it("moves them for whoever may", async () => {
    signedInAs("jean-martin", ["bureau"]);
    await save({ title: "Paie", nom: "Marie", "mots-cles": ["rh"] });
    expect(written()).toEqual({
      title: "Paie",
      nom: "Marie",
      salaire: 42000,
      "mots-cles": ["rh"],
    });
  });

  // The whole reason the title is worked out in the guard, after the merge: a
  // gabarit may name a field this person cannot fill, and what arrives from
  // the browser no longer carries it. Computed from the payload alone, the
  // title would lose the very value the fiche still holds — and a stored
  // title is never worked out again at read (ADR 0020).
  it("works the automatic title out from the merge, not from the payload", async () => {
    const automatic: FormDescriptor = {
      fields: [
        {
          type: "title",
          name: "title",
          label: "Titre",
          automatic: true,
          template: "{nom} — {salaire}",
        },
        { type: "text", name: "nom", label: "Nom" },
        { type: "text", name: "salaire", label: "Salaire", writeAcl: BUREAU },
      ],
    };
    db.page.findUniqueOrThrow.mockResolvedValue({
      ...JEANS_ENTRY,
      current: { data: { title: "Marie — 42000", nom: "Marie", salaire: 42000 } },
    });
    await writeEntryRevision({
      pageId: "page-1",
      data: { nom: "Marie Durand" },
      descriptor: automatic,
    });
    expect(written()).toEqual({
      title: "Marie Durand — 42000",
      nom: "Marie Durand",
      salaire: 42000,
    });
  });

  // An entry carries a non-empty title, always (ADR 0020). The refusal names
  // the fields the author can actually fill, and travels as a thrown error
  // the Server Action turns back into a message under the form.
  it("refuses a save whose title the merge leaves empty", async () => {
    const automatic: FormDescriptor = {
      fields: [
        { type: "title", name: "title", label: "Titre", automatic: true, template: "{nom}" },
        { type: "text", name: "nom", label: "Nom" },
      ],
    };
    db.page.findUniqueOrThrow.mockResolvedValue({
      ...JEANS_ENTRY,
      current: { data: { title: "Marie", nom: "Marie" } },
    });
    await expect(
      writeEntryRevision({ pageId: "page-1", data: { nom: "" }, descriptor: automatic })
    ).rejects.toThrow("Le titre de la fiche est calculé à partir de");
    expect(db.revision.create).not.toHaveBeenCalled();
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

  // The archived title names the archived values; the merge keeps some of
  // today's. Recomputed after it, the title names what the fiche now holds —
  // and a stored title is never worked out again at read (ADR 0020).
  it("names what the merge kept, not what the archive said", async () => {
    const automatic: FormDescriptor = {
      fields: [
        { type: "title", name: "title", label: "Titre", automatic: true, template: "{nom} — {salaire}" },
        { type: "text", name: "nom", label: "Nom" },
        { type: "text", name: "salaire", label: "Salaire", readAcl: BUREAU, writeAcl: BUREAU },
      ],
    };
    await writeRestoredRevision({
      pageId: "page-1",
      content: null,
      data: { title: "Marie — 1", nom: "Marie", salaire: 1 },
      restoredFromId: "rev-1",
      descriptor: automatic,
    });
    expect(written()).toEqual({
      title: "Marie — 42000",
      nom: "Marie",
      salaire: 42000,
    });
  });
});
