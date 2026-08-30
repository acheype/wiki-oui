import { describe, expect, it } from "vitest";
import type { FormDescriptor } from "../form-descriptor";
import { escapeMdxText, renderTemplateSource } from "./render";

describe("escapeMdxText", () => {
  it("neutralizes component and expression openers", () => {
    expect(escapeMdxText("<Button /> and {expr}")).toBe(
      "&lt;Button /> and &#123;expr}"
    );
  });

  it("escapes markdown structural characters", () => {
    expect(escapeMdxText("**bold** _em_ # title")).toBe(
      "\\*\\*bold\\*\\* \\_em\\_ \\# title"
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeMdxText("Alice Dupont (asso)")).toBe("Alice Dupont (asso)");
  });
});

describe("renderTemplateSource", () => {
  const descriptor: FormDescriptor = {
    fields: [
      { type: "title", name: "title", label: "Titre de la fiche" },
      { type: "text", name: "nom", label: "Nom" },
      {
        type: "textarea",
        name: "bio",
        label: "Bio",
        allowMdx: true,
      },
      { type: "textarea", name: "note", label: "Note" },
    ],
  };

  it("substitutes {champ} with escaped plain text by default", () => {
    expect(
      renderTemplateSource("# {title}\n\n{note}", descriptor, {
        title: "L'asso",
        note: "<Button /> **x**",
      })
    ).toBe("# L'asso\n\n&lt;Button /> \\*\\*x\\*\\*");
  });

  it("injects an allowMdx textarea value raw", () => {
    expect(
      renderTemplateSource("{bio}", descriptor, { bio: "**gras**" })
    ).toBe("**gras**");
  });

  it("renders an absent value as empty, silently", () => {
    expect(renderTemplateSource("[{nom}]", descriptor, {})).toBe("[]");
  });

  it("leaves an unknown reference in place (refused at form save)", () => {
    expect(renderTemplateSource("{inconnu}", descriptor, {})).toBe("{inconnu}");
  });
});
