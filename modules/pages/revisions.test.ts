import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, person, revalidate } = vi.hoisted(() => ({
  db: {
    revision: { findUnique: vi.fn(), create: vi.fn() },
    page: { update: vi.fn() },
    $transaction: vi.fn(),
  },
  person: { username: "jean", groupSlugs: [] as string[] },
  revalidate: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/accounts/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { username: person.username } }) } },
}));
vi.mock("@/modules/permissions/groups-directory", () => ({
  currentGroupSlugs: async () => person.groupSlugs,
}));

const { restoreRevision } = await import("./content-actions");
const { REFUSALS } = await import("@/modules/permissions/rules");
const RESTRICTED = { scope: "restricted", groupSlugs: ["bureau"] };
const descriptor = {
  fields: [
    { type: "title", name: "title", label: "Titre", automatic: true, template: "{nom}" },
    { type: "text", name: "nom", label: "Nom", writeAcl: RESTRICTED },
    { type: "text", name: "note", label: "Note" },
  ],
};
function archive() {
  return {
    id: "rev-old", pageId: "page-1", content: null as string | null,
    data: { title: "Ancien titre", nom: "", note: "ancienne" } as Record<string, unknown> | null,
    page: {
      id: "page-1", slug: "marie", formId: "form-1" as string | null,
      form: { schema: descriptor } as { schema: unknown } | null,
      ownerUsername: "jean", readScope: "everyone", writeScope: "restricted",
      owner: { name: "Jean" }, acls: [],
      current: { data: { title: "Marie", nom: "Marie", note: "actuelle" } },
    },
  };
}
const written = () => db.revision.create.mock.calls.at(-1)?.[0].data;
beforeEach(() => {
  vi.clearAllMocks();
  person.username = "jean";
  person.groupSlugs = [];
  db.$transaction.mockImplementation(async (run) => run(db));
  db.revision.findUnique.mockResolvedValue(archive());
  db.revision.create.mockResolvedValue({ id: "rev-new" });
});

describe("restoration through its public action", () => {
  it("reports the title computed from the authorized merge, not the archive", async () => {
    expect(await restoreRevision("rev-old")).toEqual({ slug: "marie", titleKept: false });
    expect(written()).toMatchObject({
      data: { title: "Marie", nom: "Marie", note: "ancienne" },
      restoredFromId: "rev-old", authorUsername: "jean",
    });
    expect(revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("keeps the archived title and reports it when the final calculation is empty", async () => {
    person.groupSlugs = ["bureau"];
    expect(await restoreRevision("rev-old")).toEqual({ slug: "marie", titleKept: true });
    expect(written().data).toEqual({ title: "Ancien titre", nom: "", note: "ancienne" });
  });
  it("does not keep an intermediate title computed before a protected field is merged", async () => {
    const source = archive();
    source.data = { title: "Titre archivé", nom: "Ancienne Marie" };
    source.page.current.data.nom = "";
    db.revision.findUnique.mockResolvedValue(source);
    expect(await restoreRevision("rev-old")).toEqual({ slug: "marie", titleKept: true });
    expect(written().data.title).toBe("Titre archivé");
  });
  it("appends a plain MDX revision with its origin", async () => {
    const source = archive();
    source.data = null;
    source.content = "# Ancien contenu";
    source.page.form = null;
    source.page.formId = null;
    db.revision.findUnique.mockResolvedValue(source);
    expect(await restoreRevision("rev-old")).toEqual({ slug: "marie", titleKept: false });
    expect(written()).toMatchObject({ content: "# Ancien contenu", restoredFromId: "rev-old" });
    expect(written().data).toBeUndefined();
    expect(db.page.update).toHaveBeenCalledWith({ where: { id: "page-1" }, data: { currentRevisionId: "rev-new" } });
  });
  it.each(["read", "write"])("refuses restoration without %s access", async (access) => {
    const source = archive();
    source.page.ownerUsername = "marie";
    if (access === "read") source.page.readScope = "restricted";
    db.revision.findUnique.mockResolvedValue(source);
    expect(await restoreRevision("rev-old")).toEqual({ error: access === "read" ? REFUSALS.access : REFUSALS.write });
    expect(db.revision.create).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("reports a missing revision without writing or revalidating", async () => {
    db.revision.findUnique.mockResolvedValue(null);
    expect(await restoreRevision("missing")).toEqual({ error: "Révision introuvable." });
    expect(db.revision.create).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
});
