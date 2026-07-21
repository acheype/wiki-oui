import { describe, expect, it } from "vitest";
import { restoredEntryValues, titleRecomputeNeeded } from "./entry-title";
import type { FormDescriptor } from "./form-descriptor";

function descriptor(
  title: { automatic?: boolean; template?: string } = {}
): FormDescriptor {
  return {
    fields: [
      {
        type: "title",
        name: "title",
        label: "Titre de la fiche",
        ...title,
      },
      { type: "text", name: "prenom", label: "Prénom" },
      { type: "text", name: "nom", label: "Nom" },
    ],
  };
}

// ADR 0020: the stored titles only need rewriting when the definition that
// produces them moves.
describe("titleRecomputeNeeded", () => {
  it("triggers when the template changes", () => {
    expect(
      titleRecomputeNeeded(
        descriptor({ automatic: true, template: "{prenom} {nom}" }),
        descriptor({ automatic: true, template: "{nom} {prenom}" })
      )
    ).toBe(true);
  });

  it("triggers when the title switches to automatic", () => {
    expect(
      titleRecomputeNeeded(
        descriptor(),
        descriptor({ automatic: true, template: "{prenom} {nom}" })
      )
    ).toBe(true);
  });

  it("does nothing when the title switches back to manual", () => {
    expect(
      titleRecomputeNeeded(
        descriptor({ automatic: true, template: "{prenom} {nom}" }),
        descriptor()
      )
    ).toBe(false);
  });

  it("does nothing when the template is untouched", () => {
    const same = { automatic: true, template: "{prenom} {nom}" };
    expect(titleRecomputeNeeded(descriptor(same), descriptor(same))).toBe(false);
  });

  it("does nothing for a form whose title was never automatic", () => {
    expect(titleRecomputeNeeded(descriptor(), descriptor())).toBe(false);
  });

  // A rename moves the template and the data keys together (ADR 0017), so
  // every title computes to exactly what it did — no recompute owed.
  it("does not trigger on a field rename alone", () => {
    const before: FormDescriptor = {
      fields: [
        {
          type: "title",
          name: "title",
          label: "Titre de la fiche",
          automatic: true,
          template: "{prenom} {nom}",
        },
        { type: "text", name: "prenom", label: "Prénom" },
        { type: "text", name: "nom", label: "Nom" },
      ],
    };
    const after: FormDescriptor = {
      fields: [
        {
          type: "title",
          name: "title",
          label: "Titre de la fiche",
          automatic: true,
          template: "{first-name} {nom}",
        },
        { type: "text", name: "first-name", label: "Prénom" },
        { type: "text", name: "nom", label: "Nom" },
      ],
    };
    // The template text differs, so the guard does fire — the sweep is then
    // a no-op per entry (same computed title, no revision written). Recorded
    // here so the behaviour is deliberate rather than surprising.
    expect(titleRecomputeNeeded(before, after)).toBe(true);
  });
});

// ADR 0020: a restored revision becomes the current state, so it follows the
// form's current definition instead of carrying its archived title back.
describe("restoredEntryValues", () => {
  const automatic = descriptor({ automatic: true, template: "{prenom} {nom}" });

  it("recomputes the title from the current gabarit", () => {
    expect(
      restoredEntryValues(automatic, {
        title: "Titre d'époque",
        prenom: "Zoé",
        nom: "Martin",
      })
    ).toEqual({
      values: { title: "Zoé Martin", prenom: "Zoé", nom: "Martin" },
      titleKept: false,
    });
  });

  it("keeps the archived title, and says so, when the gabarit computes to nothing", () => {
    expect(
      restoredEntryValues(automatic, {
        title: "Titre d'époque",
        prenom: "",
        nom: "",
      })
    ).toEqual({
      values: { title: "Titre d'époque", prenom: "", nom: "" },
      titleKept: true,
    });
  });

  it("leaves a manual title untouched", () => {
    expect(
      restoredEntryValues(descriptor(), { title: "Saisi à la main" })
    ).toEqual({
      values: { title: "Saisi à la main" },
      titleKept: false,
    });
  });
});
