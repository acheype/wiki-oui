import { describe, expect, it } from "vitest";
import type { ComponentBuilderSpec } from "./component-descriptors";
import type { FormDescriptor } from "./form-descriptor";
import {
  pageReferenceProps,
  rewriteEntryDataSlugs,
  rewriteSlugReferences,
} from "./slug-rename";

const rename = { oldSlug: "ancien", newSlug: "nouveau" };
const props = new Map([["Button", new Set(["link"])]]);

function rewrite(source: string): string | null {
  return rewriteSlugReferences(source, rename, props);
}

describe("rewriteSlugReferences", () => {
  it("rewrites a plain wiki link target", () => {
    expect(rewrite("Voir [la page](ancien).")).toBe("Voir [la page](nouveau).");
  });

  it("preserves handler and anchor segments", () => {
    expect(rewrite("[a](ancien/edit) [b](ancien#section) [c](ancien/edit#s)")).toBe(
      "[a](nouveau/edit) [b](nouveau#section) [c](nouveau/edit#s)"
    );
  });

  it("leaves the link text alone when it equals the slug", () => {
    expect(rewrite("[ancien](ancien)")).toBe("[ancien](nouveau)");
  });

  it("rewrites a reference-style definition", () => {
    expect(rewrite("[voir][r]\n\n[r]: ancien")).toBe("[voir][r]\n\n[r]: nouveau");
  });

  it("rewrites a page-list prop, and only that prop", () => {
    expect(rewrite('<Button link="ancien" text="ancien" />')).toBe(
      '<Button link="nouveau" text="ancien" />'
    );
  });

  it("rewrites props on multi-line and non-self-closing elements", () => {
    expect(rewrite('<Button\n  link="ancien"\n  text="x"\n>corps</Button>')).toBe(
      '<Button\n  link="nouveau"\n  text="x"\n>corps</Button>'
    );
  });

  it("returns null when nothing references the slug", () => {
    const untouched = [
      "Le mot ancien en prose, sans lien.",
      "[externe](https://site/ancien)",
      "[autre](ancien-lieu)",
      "[autre](tres-ancien)",
      "```\n[x](ancien)\n```",
      "`[x](ancien)`",
      '<Menu link="ancien" />',
      "![alt](ancien)",
    ];
    for (const source of untouched) {
      expect(rewrite(source)).toBeNull();
    }
  });

  it("returns null on unparseable MDX", () => {
    expect(rewrite("<Button link='ancien'")).toBeNull();
  });

  it("rewrites every occurrence across a document", () => {
    const source = "# Titre\n\n[a](ancien) et [b](ancien/revisions)\n\n<Button link=\"ancien\" />\n";
    expect(rewrite(source)).toBe(
      "# Titre\n\n[a](nouveau) et [b](nouveau/revisions)\n\n<Button link=\"nouveau\" />\n"
    );
  });

  it("touches nothing but the references (byte-for-byte)", () => {
    const source = "Para  avec   espaces\n\n* liste\n* [x](ancien)\n\n> citation [y](ancien 'titre')\n";
    expect(rewrite(source)).toBe(
      "Para  avec   espaces\n\n* liste\n* [x](nouveau)\n\n> citation [y](nouveau 'titre')\n"
    );
  });
});

describe("rewriteEntryDataSlugs", () => {
  const descriptor = {
    fields: [
      { type: "list", name: "parrain", label: "Parrain", sourceFormId: "assos" },
      { type: "multiChoice", name: "amis", label: "Amis", sourceFormId: "assos" },
      { type: "list", name: "statut", label: "Statut", options: { a: "A" } },
    ],
  } as unknown as FormDescriptor;

  it("rewrites single and multiple form-sourced values", () => {
    expect(
      rewriteEntryDataSlugs(
        descriptor,
        { parrain: "ancien", amis: ["autre", "ancien"], statut: "ancien" },
        rename
      )
    ).toEqual({ parrain: "nouveau", amis: ["autre", "nouveau"], statut: "ancien" });
  });

  it("returns null when no form-sourced value matches", () => {
    expect(
      rewriteEntryDataSlugs(descriptor, { parrain: "autre", statut: "ancien" }, rename)
    ).toBeNull();
  });
});

describe("pageReferenceProps", () => {
  it("collects only page-list props", () => {
    const builders = [
      {
        name: "Button",
        descriptor: {
          properties: { text: { type: "text" }, link: { type: "page-list" } },
        },
      },
      { name: "Embed", descriptor: { properties: { url: { type: "text" } } } },
    ] as unknown as ComponentBuilderSpec[];
    const map = pageReferenceProps(builders);
    expect(map.get("Button")).toEqual(new Set(["link"]));
    expect(map.has("Embed")).toBe(false);
  });
});
