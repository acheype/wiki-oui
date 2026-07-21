import { describe, expect, it } from "vitest";
import { titleRecomputeNeeded } from "./entry-title";
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
