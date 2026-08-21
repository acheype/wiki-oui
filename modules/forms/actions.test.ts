import { beforeEach, describe, expect, it, vi } from "vitest";

// listUsedFieldValues (issue #15) is a Server Action — a public entry point
// callable with any (formSlug, fieldName) pair, not only from the widget that
// means to. What is asserted here is the guard at its heart: a field this
// person may not read, or a field that isn't a « Mots-clés » field, must
// answer [] before any entry is ever read — a filter applied only in the
// widget would be a UI mask, not a right.

const { db, person } = vi.hoisted(() => ({
  db: {
    form: { findMany: vi.fn(), update: vi.fn() },
    page: { findMany: vi.fn() },
  },
  person: { current: { username: null as string | null, groupSlugs: [] as string[] } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/modules/permissions/person", () => ({
  currentPerson: async () => person.current,
  currentUsername: async () => person.current.username,
  currentIdentity: async () => null,
  assertAdmin: async () => {},
}));
vi.mock("@/modules/permissions/groups-queries", () => ({
  existingPrincipals: async () => ({ usernames: new Set(), groupSlugs: new Set() }),
  grantTarget: async () => null,
  listDirectory: async () => ({ people: [], groups: [] }),
  groupDisplayNames: async () => new Map(),
  groupNamesBySlug: async () => new Map(),
  currentGroupSlugs: async () => [],
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { getFormBySlug } = vi.hoisted(() => ({ getFormBySlug: vi.fn() }));
vi.mock("@/modules/forms/forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/forms/forms")>()),
  getFormBySlug,
}));

const { readableForm } = vi.hoisted(() => ({ readableForm: vi.fn() }));
vi.mock("@/modules/permissions/readable-form", () => ({ readableForm }));

const { listEntrySnapshots } = vi.hoisted(() => ({ listEntrySnapshots: vi.fn() }));
vi.mock("@/modules/pages/entries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/pages/entries")>()),
  listEntrySnapshots,
}));

const { listUsedFieldValues } = await import("@/modules/forms/actions");

const TAGS_FIELD = { type: "tags", name: "mots-cles", label: "Mots-clés" };

beforeEach(() => {
  vi.clearAllMocks();
  getFormBySlug.mockResolvedValue({ id: "form-1", schema: {} });
  listEntrySnapshots.mockResolvedValue([]);
});

describe("listUsedFieldValues", () => {
  it("answers nothing for a form that does not exist", async () => {
    getFormBySlug.mockResolvedValue(null);
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("answers nothing when the descriptor cannot be read at all", async () => {
    readableForm.mockResolvedValue(null);
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("answers nothing for a field this person may not read", async () => {
    readableForm.mockResolvedValue({ readable: { fields: [] } });
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("answers nothing for a field that is readable but not a tags field", async () => {
    readableForm.mockResolvedValue({
      readable: { fields: [{ type: "text", name: "mots-cles", label: "Mots-clés" }] },
    });
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("ranks the values already carried by the field's readable entries", async () => {
    readableForm.mockResolvedValue({ readable: { fields: [TAGS_FIELD] } });
    listEntrySnapshots.mockResolvedValue([
      { "mots-cles": ["rh", " rh ", "paie"] },
      { "mots-cles": ["rh"] },
      {},
    ]);
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([
      "rh",
      "paie",
    ]);
    expect(listEntrySnapshots).toHaveBeenCalledWith("associations");
  });
});
