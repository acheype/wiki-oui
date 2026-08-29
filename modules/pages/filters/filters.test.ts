import { describe, expect, it } from "vitest";
import type { ManagedPage } from "@/modules/pages/access/admin-rights";
import { EVERYTHING, coherent, pagesMatching } from "./filters";

function managed(slug: string, form?: { slug: string; name: string }): ManagedPage {
  return {
    slug,
    owner: null,
    formId: form ? form.slug : null,
    form: form ?? null,
    ownerUsername: null,
    readScope: "everyone",
    writeScope: "restricted",
    acls: [],
  };
}

const AGENDA = { slug: "agenda", name: "Agenda" };
const PAGES: ManagedPage[] = [
  managed("accueil"),
  managed("contact"),
  managed("concert-du-14", AGENDA),
  managed("association-x", { slug: "associations", name: "Associations" }),
];

describe("coherent", () => {
  it("reads naming a formulaire as asking for its fiches, in one click", () => {
    expect(coherent(EVERYTHING, { formSlug: "agenda" })).toEqual({
      needle: "",
      kind: "entries",
      formSlug: "agenda",
    });
  });

  it("drops the formulaire when the type steps back to what has none", () => {
    const onAgenda = coherent(EVERYTHING, { formSlug: "agenda" });
    expect(coherent(onAgenda, { kind: "pages" }).formSlug).toBeNull();
    expect(coherent(onAgenda, { kind: "all" }).formSlug).toBeNull();
  });

  it("keeps the formulaire under Fiches, which is what it already means", () => {
    const onAgenda = coherent(EVERYTHING, { formSlug: "agenda" });
    expect(coherent(onAgenda, { kind: "entries" }).formSlug).toBe("agenda");
    expect(coherent(onAgenda, { needle: "con" }).formSlug).toBe("agenda");
  });
});

describe("pagesMatching", () => {
  it("searches the address, whatever the case", () => {
    expect(
      pagesMatching(PAGES, { ...EVERYTHING, needle: " CON " }).map((p) => p.slug)
    ).toEqual(["contact", "concert-du-14"]);
  });

  it("tells a fiche from a page, and keeps one formulaire's fiches", () => {
    expect(
      pagesMatching(PAGES, { ...EVERYTHING, kind: "pages" }).map((p) => p.slug)
    ).toEqual(["accueil", "contact"]);
    expect(
      pagesMatching(PAGES, coherent(EVERYTHING, { formSlug: "agenda" })).map(
        (p) => p.slug
      )
    ).toEqual(["concert-du-14"]);
  });
});
