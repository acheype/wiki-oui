import { beforeEach, describe, expect, it, vi } from "vitest";

// The five screens that show a form read it through one door now. What holds
// here is that the door resolves the person itself: passing one is what a
// caller can forget, and a forgotten person reads as a visitor — the one
// mistake that fails open.

const { person } = vi.hoisted(() => ({
  person: { current: { username: null as string | null, groupSlugs: [] as string[] } },
}));

vi.mock("@/modules/permissions/person", () => ({
  currentPerson: async () => person.current,
}));

const { readableForm } = await import("@/modules/permissions/readable-form");

const BUREAU = { scope: "restricted", groupSlugs: ["bureau"] } as const;

/** A payroll form: a name anyone reads, a salary @Bureau's alone. */
const payroll = {
  fields: [
    { type: "title", name: "title", label: "Titre" },
    { type: "text", name: "nom", label: "Nom" },
    {
      type: "text",
      name: "salaire",
      label: "Salaire",
      readAcl: BUREAU,
      writeAcl: BUREAU,
    },
  ],
};

const SNAPSHOT = { title: "Paie", nom: "Marie", salaire: 42000 };

beforeEach(() => {
  person.current = { username: null, groupSlugs: [] };
});

describe("a form as the person may see it", () => {
  it("cuts the fields, their names and their values at once", async () => {
    const seen = await readableForm(payroll);
    expect(seen?.readable.fields.map((field) => field.name)).toEqual([
      "title",
      "nom",
    ]);
    expect([...(seen?.readableNames ?? [])]).toEqual(["title", "nom"]);
    expect(seen?.readableValues(SNAPSHOT)).toEqual({
      title: "Paie",
      nom: "Marie",
    });
  });

  // The gabarit renders against the whole descriptor over the cut values, so
  // a `{salaire}` it names comes out empty rather than left on the page.
  it("keeps the whole descriptor beside the cut one", async () => {
    const seen = await readableForm(payroll);
    expect(seen?.whole.fields).toHaveLength(3);
  });

  it("opens to whoever the rule names", async () => {
    person.current = { username: "jean-martin", groupSlugs: ["bureau"] };
    const seen = await readableForm(payroll);
    expect(seen?.readableNames.has("salaire")).toBe(true);
    expect(seen?.readableValues(SNAPSHOT)).toEqual(SNAPSHOT);
  });

  it("names the fields shown greyed", async () => {
    person.current = { username: "marie-durand", groupSlugs: [] };
    const open = {
      fields: [
        { type: "title", name: "title", label: "Titre" },
        { type: "text", name: "note", label: "Note", writeAcl: BUREAU },
      ],
    };
    const seen = await readableForm(open);
    expect(seen?.readOnly.map((field) => field.label)).toEqual(["Note"]);
  });

  // What to do about a form this engine can no longer read is the caller's:
  // the fiche renders nothing, the history falls back on the raw snapshot,
  // the builder throws so the mistake is loud.
  it("answers null on a descriptor it cannot parse", async () => {
    expect(await readableForm({ fields: [{ type: "moutarde" }] })).toBeNull();
  });
});
