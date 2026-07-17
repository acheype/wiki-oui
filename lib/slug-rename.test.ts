import { describe, expect, it } from "vitest";
import type { ComponentBuilderSpec } from "./component-descriptors";
import type { FormDescriptor } from "./form-descriptor";
import {
  formReferenceProps,
  pageReferenceProps,
  rewriteEntryDataSlugs,
  rewriteFormDescriptorSlugs,
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
      { type: "textarea", name: "bio", label: "Bio", allowMdx: true },
      { type: "textarea", name: "note", label: "Note" },
    ],
  } as unknown as FormDescriptor;

  it("rewrites single and multiple form-sourced values", () => {
    expect(
      rewriteEntryDataSlugs(
        descriptor,
        { parrain: "ancien", amis: ["autre", "ancien"], statut: "ancien" },
        rename,
        props
      )
    ).toEqual({ parrain: "nouveau", amis: ["autre", "nouveau"], statut: "ancien" });
  });

  it("rewrites wiki links in allowMdx textareas only", () => {
    expect(
      rewriteEntryDataSlugs(
        descriptor,
        { bio: "Voir [ici](ancien).", note: "Voir [ici](ancien)." },
        rename,
        props
      )
    ).toEqual({ bio: "Voir [ici](nouveau).", note: "Voir [ici](ancien)." });
  });

  it("returns null when no form-sourced value matches", () => {
    expect(
      rewriteEntryDataSlugs(
        descriptor,
        { parrain: "autre", statut: "ancien" },
        rename,
        props
      )
    ).toBeNull();
  });
});

describe("rewriteFormDescriptorSlugs", () => {
  it("rewrites customContent MDX and nothing else", () => {
    const descriptor = {
      fields: [
        { type: "text", name: "nom", label: "Nom" },
        {
          type: "customContent",
          name: "intro",
          label: "Intro",
          entryContent: "[aide](ancien)",
          displayContent: "rien ici",
        },
      ],
    } as unknown as FormDescriptor;
    const rewritten = rewriteFormDescriptorSlugs(descriptor, rename, props);
    expect(rewritten?.fields[1]).toMatchObject({
      entryContent: "[aide](nouveau)",
      displayContent: "rien ici",
    });
    expect(rewritten?.fields[0]).toBe(descriptor.fields[0]);
  });

  it("returns null when no customContent references the slug", () => {
    const descriptor = {
      fields: [{ type: "customContent", name: "intro", label: "Intro" }],
    } as unknown as FormDescriptor;
    expect(rewriteFormDescriptorSlugs(descriptor, rename, props)).toBeNull();
  });
});

// A form rename lives in another namespace: <EntryForm id> moves, markdown
// links (always page targets) and entry-slug option values stay put.
describe("form-kind rewrites", () => {
  const formProps = new Map([["EntryForm", new Set(["id"])]]);
  const formRename = { oldSlug: "ancien", newSlug: "nouveau" };

  it("rewrites a form-list prop, exact matches only", () => {
    expect(
      rewriteSlugReferences('<EntryForm id="ancien" />', formRename, formProps, "form")
    ).toBe('<EntryForm id="nouveau" />');
    expect(
      rewriteSlugReferences('<EntryForm id="ancien-bis" />', formRename, formProps, "form")
    ).toBeNull();
  });

  it("never touches markdown links, which target pages", () => {
    expect(
      rewriteSlugReferences("[x](ancien)", formRename, formProps, "form")
    ).toBeNull();
  });

  it("rewrites sourceFormId in a descriptor, customContent included", () => {
    const descriptor = {
      fields: [
        { type: "list", name: "parrain", label: "Parrain", sourceFormId: "ancien" },
        { type: "radio", name: "avis", label: "Avis", options: { oui: "Oui" } },
        {
          type: "customContent",
          name: "saisie",
          label: "Saisie",
          entryContent: '<EntryForm id="ancien" /> et [page](ancien)',
        },
      ],
    } as unknown as FormDescriptor;
    const rewritten = rewriteFormDescriptorSlugs(
      descriptor,
      formRename,
      formProps,
      "form"
    );
    expect(rewritten?.fields[0]).toMatchObject({ sourceFormId: "nouveau" });
    expect(rewritten?.fields[1]).toBe(descriptor.fields[1]);
    expect(rewritten?.fields[2]).toMatchObject({
      entryContent: '<EntryForm id="nouveau" /> et [page](ancien)',
    });
  });

  it("leaves entry-slug option values alone, rewrites allowMdx", () => {
    const descriptor = {
      fields: [
        { type: "list", name: "parrain", label: "Parrain", sourceFormId: "autre" },
        { type: "textarea", name: "bio", label: "Bio", allowMdx: true },
      ],
    } as unknown as FormDescriptor;
    expect(
      rewriteEntryDataSlugs(
        descriptor,
        { parrain: "ancien", bio: '<EntryForm id="ancien" />' },
        formRename,
        formProps,
        "form"
      )
    ).toEqual({ parrain: "ancien", bio: '<EntryForm id="nouveau" />' });
  });
});

describe("reference-prop collectors", () => {
  const builders = [
    {
      name: "Button",
      descriptor: {
        properties: { text: { type: "text" }, link: { type: "page-list" } },
      },
    },
    {
      name: "EntryForm",
      descriptor: { properties: { id: { type: "form-list" } } },
    },
    { name: "Embed", descriptor: { properties: { url: { type: "text" } } } },
  ] as unknown as ComponentBuilderSpec[];

  it("collects only page-list props", () => {
    const map = pageReferenceProps(builders);
    expect(map.get("Button")).toEqual(new Set(["link"]));
    expect(map.has("EntryForm")).toBe(false);
    expect(map.has("Embed")).toBe(false);
  });

  it("collects only form-list props", () => {
    const map = formReferenceProps(builders);
    expect(map.get("EntryForm")).toEqual(new Set(["id"]));
    expect(map.has("Button")).toBe(false);
  });
});
