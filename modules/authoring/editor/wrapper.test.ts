import { describe, expect, it } from "vitest";
import {
  type ComponentDescriptor,
  descriptorDefaults,
} from "../descriptor";
import {
  type WrapperDraft,
  type WrapperShape,
  findWrapperAtCursor,
  generateWrapper,
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
});
