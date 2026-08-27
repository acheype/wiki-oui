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
  groupDisplayNames: async () => new Map(),
  groupNamesBySlug: async () => new Map(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// The gate the action reads its form through: it makes the field cut itself,
// so stubbing it is stubbing both moments at once.
const { readableFormBySlug } = vi.hoisted(() => ({ readableFormBySlug: vi.fn() }));
vi.mock("@/modules/forms/forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/forms/forms")>()),
  readableFormBySlug,
}));

const { listEntrySnapshots } = vi.hoisted(() => ({ listEntrySnapshots: vi.fn() }));
vi.mock("@/modules/pages/entries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/pages/entries")>()),
  listEntrySnapshots,
}));

const { listUsedFieldValues } = await import("@/modules/forms/actions");

const TAGS_FIELD = { type: "tags", name: "mots-cles", label: "Mots-clés" };

/** The form as the gate hands it over: read, and already cut to what is seen. */
function seenForm(readable: { fields: unknown[] } | null) {
  readableFormBySlug.mockResolvedValue({
    id: "form-1",
    seen: readable && { readable },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seenForm({ fields: [] });
  listEntrySnapshots.mockResolvedValue([]);
});

describe("listUsedFieldValues", () => {
  it("answers nothing for a form that does not exist", async () => {
    readableFormBySlug.mockResolvedValue(null);
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("answers nothing when the descriptor cannot be read at all", async () => {
    seenForm(null);
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("answers nothing for a field this person may not read", async () => {
    seenForm({ fields: [] });
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("answers nothing for a field that is readable but not a tags field", async () => {
    seenForm({ fields: [{ type: "text", name: "mots-cles", label: "Mots-clés" }] });
    expect(await listUsedFieldValues("associations", "mots-cles")).toEqual([]);
    expect(listEntrySnapshots).not.toHaveBeenCalled();
  });

  it("ranks the values already carried by the field's readable entries", async () => {
    seenForm({ fields: [TAGS_FIELD] });
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
