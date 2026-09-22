import { describe, expect, it } from "vitest";
import {
  type ComponentDescriptor,
  descriptorDefaults,
} from "../descriptor";
import {
  type FreeContentDraft,
  type FreeContentShape,
  type WrapperDraft,
  type WrapperShape,
  findFreeContentWrapperAtCursor,
  findWrapperAtCursor,
  generateFreeContentWrapper,
  generateWrapper,
  moveManagedChild,
  removeManagedChild,
  wrapperShapeOf,
} from "./wrapper";

// A Tabs-like wrapper descriptor (ADR 0031), enough to drive the round-trip.
function tabsDescriptor(): ComponentDescriptor {
  return {
    label: "Onglets",
    properties: {
      display: {
        label: "Apparence",
        type: "list",
        default: "segmented",
        options: { segmented: "Segments", underline: "Soulignement", folder: "Dossiers" },
      },
      orientation: {
        label: "Orientation",
        type: "list",
        default: "horizontal",
        options: { horizontal: "H", vertical: "V" },
      },
      fullWidth: { label: "Pleine largeur", type: "checkbox", default: false },
    },
    children: {
      component: "Tab",
      label: "Onglet",
      anchorField: "title",
      properties: {
        title: { label: "Titre", type: "text", required: true },
        icon: { label: "Icône", type: "icon" },
      },
    },
  };
}

function tabsShape(): WrapperShape {
  const descriptor = tabsDescriptor();
  return wrapperShapeOf({
    name: "Tabs",
    descriptor,
    defaults: descriptorDefaults(descriptor),
  });
}

function collapsibleShape(): FreeContentShape {
  return {
    name: "Collapsible",
    descriptor: {
      label: "Bloc dépliable",
      initialContent: "Contenu du bloc dépliable à modifier",
      properties: {
        title: { label: "Titre", type: "text", required: true },
        defaultOpen: {
          label: "Déplié par défaut",
          type: "checkbox",
          default: false,
        },
      },
    },
    defaults: { title: undefined, defaultOpen: false },
  };
}

describe("free-content wrapper round-trip", () => {
  const shape = collapsibleShape();

  it("generates and reads raw MDX content with unknown attributes", () => {
    const draft: FreeContentDraft = {
      values: { title: "À savoir", defaultOpen: true },
      unknownAttributes: ['className="mt-4"'],
      content: "\nLigne 1\n\n<Button text=\"Continuer\" />\n",
    };
    const source = generateFreeContentWrapper(shape, draft);

    expect(source).toBe(
      '<Collapsible title="À savoir" defaultOpen className="mt-4">\nLigne 1\n\n<Button text="Continuer" />\n</Collapsible>'
    );
    const found = findFreeContentWrapperAtCursor(
      [shape],
      source,
      source.indexOf("Ligne 1")
    );
    expect(found?.draft).toEqual(draft);
    expect(generateFreeContentWrapper(shape, found!.draft)).toBe(source);
  });

  it("selects the innermost same-name wrapper without replacing its parent", () => {
    const source = `<Collapsible title="Parent">
Avant
<Collapsible title="Enfant">
Dedans
</Collapsible>
Après
</Collapsible>`;
    const found = findFreeContentWrapperAtCursor(
      [shape],
      source,
      source.indexOf("Dedans")
    );

    expect(found?.draft.values.title).toBe("Enfant");
    expect(found?.draft.content).toBe("\nDedans\n");
    const replacement = generateFreeContentWrapper(shape, {
      ...found!.draft,
      values: { title: "Enfant modifié" },
    });
    const updated = source.slice(0, found!.from) + replacement + source.slice(found!.to);
    expect(updated).toContain('<Collapsible title="Parent">');
    expect(updated).toContain('<Collapsible title="Enfant modifié">');
    expect(updated).toContain("Avant");
    expect(updated).toContain("Après");
  });
});

function draft(overrides: Partial<WrapperDraft> = {}): WrapperDraft {
  return {
    values: {},
    unknownAttributes: [],
    children: [
      { values: { title: "Présentation" }, content: "Contenu un", unknownAttributes: [] },
      { values: { title: "Contact" }, content: "Contenu deux", unknownAttributes: [] },
    ],
    ...overrides,
  };
}

describe("generateWrapper", () => {
  it("omits default props, one indented child block per entry", () => {
    expect(generateWrapper(tabsShape(), draft())).toBe(
      `<Tabs>
  <Tab title="Présentation">
Contenu un
  </Tab>
  <Tab title="Contact">
Contenu deux
  </Tab>
</Tabs>`
    );
  });

  it("writes the wrapper props and the default child slug", () => {
    const tag = generateWrapper(
      tabsShape(),
      draft({ values: { display: "underline" }, defaultChild: "contact" })
    );
    expect(tag).toContain(`<Tabs display="underline" default="contact">`);
  });

  it("writes a child's icon prop", () => {
    const tag = generateWrapper(
      tabsShape(),
      draft({
        children: [
          { values: { title: "Info", icon: "lucide:info" }, content: "x", unknownAttributes: [] },
        ],
      })
    );
    expect(tag).toContain(`<Tab title="Info" icon="lucide:info">`);
  });
});

describe("findWrapperAtCursor round-trip", () => {
  const shape = tabsShape();
  const inside = (text: string) => text.indexOf("Contenu deux");

  it("reads an existing wrapper back into its draft", () => {
    const text = generateWrapper(shape, draft({ values: { display: "underline" }, defaultChild: "contact" }));
    const found = findWrapperAtCursor([shape], text, inside(text));
    expect(found).not.toBeNull();
    expect(found!.from).toBe(0);
    expect(found!.to).toBe(text.length);
    expect(found!.draft.values.display).toBe("underline");
    expect(found!.draft.defaultChild).toBe("contact");
    expect(found!.draft.children.map((c) => c.values.title)).toEqual([
      "Présentation",
      "Contact",
    ]);
    expect(found!.draft.children.map((c) => c.content)).toEqual([
      "Contenu un",
      "Contenu deux",
    ]);
  });

  it("is idempotent: re-editing without change reproduces the source", () => {
    const text = generateWrapper(shape, draft({ values: { display: "folder", fullWidth: true }, defaultChild: "contact" }));
    const found = findWrapperAtCursor([shape], text, inside(text));
    expect(generateWrapper(shape, found!.draft)).toBe(text);
  });

  it("preserves multi-line child content, nested wrappers included", () => {
    const content = "Ligne 1\n\n<Tabs>\n  <Tab title=\"X\">\ny\n  </Tab>\n</Tabs>";
    const text = generateWrapper(
      shape,
      draft({
        children: [{ values: { title: "Extérieur" }, content, unknownAttributes: [] }],
      })
    );
    const found = findWrapperAtCursor([shape], text, text.indexOf("Ligne 1"));
    // The innermost enclosing wrapper wins, but the cursor here sits in the
    // outer child's own text, so the outer <Tabs> is returned with its content
    // — the nested one — untouched.
    expect(found!.draft.children).toHaveLength(1);
    expect(found!.draft.children[0].content).toBe(content);
  });

  it("keeps an unknown wrapper attribute verbatim", () => {
    const text = `<Tabs className="mt-4">
  <Tab title="Un">
a
  </Tab>
</Tabs>`;
    const found = findWrapperAtCursor([shape], text, text.indexOf("a\n"));
    expect(found!.draft.unknownAttributes).toEqual([`className="mt-4"`]);
    expect(generateWrapper(shape, found!.draft)).toBe(text);
  });

  it("returns null when the cursor is outside any wrapper", () => {
    const text = `du texte\n${generateWrapper(shape, draft())}\nplus de texte`;
    expect(findWrapperAtCursor([shape], text, 0)).toBeNull();
    expect(findWrapperAtCursor([shape], text, text.length - 1)).toBeNull();
  });

  it("reorders and deletes children without touching their content", () => {
    const text = generateWrapper(shape, draft());
    const found = findWrapperAtCursor([shape], text, inside(text));
    const [a, b] = found!.draft.children;
    const reordered = generateWrapper(shape, { ...found!.draft, children: [b, a] });
    expect(reordered.indexOf("Contenu deux")).toBeLessThan(reordered.indexOf("Contenu un"));
    const deleted = generateWrapper(shape, { ...found!.draft, children: [b] });
    expect(deleted).not.toContain("Présentation");
    expect(deleted).toContain("Contenu deux");
  });

  it("keeps direct content in its sequence slots while children move", () => {
    const text = `<Tabs>avant
  <Tab title="Présentation">
Contenu un
  </Tab>entre<Button text="Garder" />
  <Tab title="Contact" data-extra="oui">
Contenu deux
  </Tab>après
</Tabs>`;
    const found = findWrapperAtCursor([shape], text, text.indexOf("Contenu deux"));
    const moved = moveManagedChild(found!.draft, 1, 0);
    const generated = generateWrapper(shape, moved);

    expect(generated).toBe(`<Tabs>avant
  <Tab title="Contact" data-extra="oui">
Contenu deux
  </Tab>entre<Button text="Garder" />
  <Tab title="Présentation">
Contenu un
  </Tab>après
</Tabs>`);
  });

  it("does not manage expected child tags nested inside direct content", () => {
    const text = `<Tabs>
  <div>
    <Tab title="Nested">
Nested content
    </Tab>
  </div>
  <Tab title="Direct">
Direct content
  </Tab>
</Tabs>`;
    const found = findWrapperAtCursor(
      [shape],
      text,
      text.indexOf("Direct content")
    );

    expect(found!.draft.children.map((child) => child.values.title)).toEqual([
      "Direct",
    ]);
    expect(found!.draft.interstitial?.join("")).toContain(
      '<Tab title="Nested">'
    );
    expect(generateWrapper(shape, found!.draft)).toBe(text);
  });

  it("keeps expected child tags inside a fragment as direct content", () => {
    const text = `<Tabs>
  <>
    <Tab title="Nested">Nested content</Tab>
  </>
  <Tab title="Direct">
Direct content
  </Tab>
</Tabs>`;
    const found = findWrapperAtCursor(
      [shape],
      text,
      text.indexOf("Direct content")
    );

    expect(found!.draft.children.map((child) => child.values.title)).toEqual([
      "Direct",
    ]);
    expect(generateWrapper(shape, found!.draft)).toBe(text);
  });

  it("removes a child without removing either surrounding fragment", () => {
    const text = `<Tabs>avant
  <Tab title="Présentation">
Contenu un
  </Tab>entre
  <Tab title="Contact">
Contenu deux
  </Tab>après
</Tabs>`;
    const found = findWrapperAtCursor([shape], text, text.indexOf("Contenu deux"));
    const generated = generateWrapper(shape, removeManagedChild(found!.draft, 0));

    expect(generated).toBe(`<Tabs>avant
  entre
  <Tab title="Contact">
Contenu deux
  </Tab>après
</Tabs>`);
  });
});
