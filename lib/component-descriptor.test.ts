import { describe, expect, it } from "vitest";
import {
  type ComponentDescriptor,
  type DescriptorField,
  findComponentTag,
  generateMarkdownLink,
  generateTag,
  parseTag,
  tagToBuilderState,
  validateDescriptor,
  visibleFields,
} from "./component-descriptor";

// Minimal valid descriptor to derive test cases from. Defaults live in the
// descriptor itself now (ADR 0013): the list field carries its own `default`.
function buttonDescriptor(): ComponentDescriptor {
  return {
    label: "Bouton",
    properties: {
      text: { label: "Texte du bouton", type: "text" },
      color: {
        label: "Couleur",
        type: "list",
        default: "primary",
        options: { default: "Défaut", primary: "Primaire" },
      },
    },
  };
}

describe("validateDescriptor", () => {
  it("accepts an extra field with no default: structural validation ignores props", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.colour = { label: "Couleur", type: "text" };
    expect(() => validateDescriptor("button", descriptor)).not.toThrow();
  });

  // The loader edge (ADR 0015): raw parsed YAML goes in, the typed
  // descriptor comes out — no cast.
  it("returns the typed descriptor parsed from raw unknown data", () => {
    const raw: unknown = JSON.parse(JSON.stringify(buttonDescriptor()));
    expect(validateDescriptor("button", raw)).toEqual(buttonDescriptor());
  });

  it("rejects a descriptor without label or properties", () => {
    expect(() => validateDescriptor("button", { properties: {} })).toThrow(
      'components/wiki/button.yaml: a descriptor needs at least "label" and "properties"'
    );
    expect(() => validateDescriptor("button", { label: "Bouton" })).toThrow(
      'components/wiki/button.yaml: a descriptor needs at least "label" and "properties"'
    );
  });

  it("rejects a field without a label, pointing at its line", () => {
    const raw = {
      label: "Bouton",
      properties: { text: { type: "text" } },
    };
    const lineOf = (path: (string | number)[]) =>
      path.join(".") === "properties.text" ? 6 : undefined;
    expect(() => validateDescriptor("button", raw, lineOf)).toThrow(
      /^components\/wiki\/button\.yaml:6: /
    );
  });

  it("rejects a list field whose default is not one of its options", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.default = "brand";
    expect(() => validateDescriptor("button", descriptor)).toThrow(
      'components/wiki/button.yaml: list field "color" needs a default among its options (default, primary), got "brand"'
    );
  });

  it("rejects a list field without a default (strict policy)", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.default = undefined;
    expect(() => validateDescriptor("button", descriptor)).toThrow(
      'components/wiki/button.yaml: list field "color" needs a default among its options (default, primary), got undefined'
    );
  });

  it("rejects an unknown field type", () => {
    const descriptor = buttonDescriptor();
    // @ts-expect-error -- a YAML typo lands here untyped
    descriptor.properties.text.type = "chekbox";
    expect(() => validateDescriptor("button", descriptor)).toThrow(
      'components/wiki/button.yaml: field "text" has unknown type "chekbox"'
    );
  });

  it("rejects an unknown emits target", () => {
    const descriptor = buttonDescriptor();
    // @ts-expect-error -- a YAML typo lands here untyped
    descriptor.emits = "markdown";
    expect(() => validateDescriptor("button", descriptor)).toThrow(
      'components/wiki/button.yaml: unknown emits target "markdown" (the only alternative is markdown-link)'
    );
  });

  it("rejects an invalid showif regex at load time", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.showif = { text: "/(/" };
    expect(() => validateDescriptor("button", descriptor)).toThrow(
      'components/wiki/button.yaml: showif of "color" holds an invalid regex for "text": /(/'
    );
  });

  it("rejects a showif pointing at an unknown field", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.showif = { size: "notNull" };
    expect(() => validateDescriptor("button", descriptor)).toThrow(
      'components/wiki/button.yaml: showif of "color" points at unknown field "size"'
    );
  });

  it("rejects an invalid family on a file-list field", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.text = {
      label: "Fichier",
      type: "file-list",
      // @ts-expect-error -- a YAML typo lands here untyped
      family: "images",
    };
    expect(() => validateDescriptor("button", descriptor)).toThrow(
      'components/wiki/button.yaml: file-list field "text" has unknown family "images" (image, pdf, other)'
    );
  });

  it("accepts a divider without a default: it emits no prop", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.appearance = { label: "Apparence", type: "divider" };
    expect(() => validateDescriptor("button", descriptor)).not.toThrow();
  });

  it("points the message at the offending line when a lookup is given", () => {
    const descriptor = buttonDescriptor();
    // @ts-expect-error -- a YAML typo lands here untyped
    descriptor.properties.color.type = "lst";
    // Stub the lookup the loader builds from the parsed YAML: the `type:` key
    // of `color` sits on line 20.
    const lineOf = (path: (string | number)[]) =>
      path.join(".") === "properties.color.type" ? 20 : undefined;
    expect(() => validateDescriptor("button", descriptor, lineOf)).toThrow(
      'components/wiki/button.yaml:20: field "color" has unknown type "lst"'
    );
  });
});

// Descriptor with a single showif-carrying field, for visibility tests.
function withShowif(showif: DescriptorField["showif"]): ComponentDescriptor {
  return {
    label: "Image",
    properties: {
      ratio: { label: "Ratio", type: "text" },
      height: { label: "Hauteur", type: "number", showif },
    },
  };
}

describe("visibleFields", () => {
  it("shows a field without showif", () => {
    expect(visibleFields(withShowif(undefined), {}, {})).toContain("height");
  });

  it("matches a bare value by strict equality on the stringified value", () => {
    const descriptor = withShowif({ ratio: "portrait" });
    expect(visibleFields(descriptor, {}, { ratio: "portrait" })).toContain("height");
    expect(visibleFields(descriptor, {}, { ratio: "paysage" })).not.toContain("height");
  });

  it("matches a boolean condition against the checkbox state", () => {
    const descriptor = withShowif({ ratio: true });
    descriptor.properties.ratio.type = "checkbox";
    expect(visibleFields(descriptor, {}, { ratio: true })).toContain("height");
    expect(visibleFields(descriptor, {}, { ratio: false })).not.toContain("height");
    expect(visibleFields(descriptor, {}, {})).not.toContain("height");
  });

  it("treats notNull as \"field holds something\"", () => {
    const descriptor = withShowif({ ratio: "notNull" });
    expect(visibleFields(descriptor, {}, { ratio: "16/9" })).toContain("height");
    expect(visibleFields(descriptor, {}, { ratio: "" })).not.toContain("height");
    expect(visibleFields(descriptor, {}, {})).not.toContain("height");
  });

  it("treats a null condition as \"field is empty\"", () => {
    const descriptor = withShowif({ ratio: null });
    expect(visibleFields(descriptor, {}, {})).toContain("height");
    expect(visibleFields(descriptor, {}, { ratio: "16/9" })).not.toContain("height");
  });

  it("matches a /…/ condition as a regex search", () => {
    const descriptor = withShowif({ ratio: "/\\.(png|jpg)$/" });
    expect(visibleFields(descriptor, {}, { ratio: "photo.png" })).toContain("height");
    expect(visibleFields(descriptor, {}, { ratio: "doc.pdf" })).not.toContain("height");
  });

  it("ANDs several showif entries", () => {
    const descriptor: ComponentDescriptor = {
      label: "Image",
      properties: {
        ratio: { label: "Ratio", type: "text" },
        legend: { label: "Légende", type: "text" },
        height: {
          label: "Hauteur",
          type: "number",
          showif: { ratio: "portrait", legend: "notNull" },
        },
      },
    };
    expect(
      visibleFields(descriptor, {}, { ratio: "portrait", legend: "Vue du ciel" })
    ).toContain("height");
    expect(
      visibleFields(descriptor, {}, { ratio: "portrait" })
    ).not.toContain("height");
  });

  it("reads an absent value as its exported default (insert = re-edit)", () => {
    const descriptor = withShowif({ ratio: "none" });
    // ratio missing from values, but its default is "none": height shows,
    // exactly as it would when re-editing the identical generated tag.
    expect(visibleFields(descriptor, { ratio: "none" }, {})).toContain("height");
    expect(
      visibleFields(descriptor, { ratio: "none" }, { ratio: "portrait" })
    ).not.toContain("height");
  });

  it("cascades hiding: a hidden field counts as empty for its dependents", () => {
    const descriptor: ComponentDescriptor = {
      label: "Image",
      properties: {
        modal: { label: "Modale", type: "checkbox" },
        caption: { label: "Légende", type: "text", showif: { modal: true } },
        captionColor: {
          label: "Couleur de légende",
          type: "text",
          showif: { caption: "notNull" },
        },
      },
    };
    // caption holds a stale value but is hidden (modal unchecked): its
    // dependents must see it as empty.
    const values = { modal: false, caption: "Vue du ciel" };
    expect(visibleFields(descriptor, {}, values)).not.toContain("caption");
    expect(visibleFields(descriptor, {}, values)).not.toContain("captionColor");
  });
});

// Richer descriptor exercising generation/parsing (subset of the real button).
function fullButtonDescriptor(): ComponentDescriptor {
  return {
    label: "Bouton",
    properties: {
      text: { label: "Texte du bouton", type: "text" },
      link: { label: "Lien", type: "page-list" },
      color: {
        label: "Couleur",
        type: "list",
        options: { default: "Défaut", primary: "Primaire", success: "Succès" },
      },
      newWindow: { label: "Nouvelle fenêtre", type: "checkbox" },
    },
  };
}

const fullButtonDefaults = {
  text: undefined,
  link: undefined,
  color: "primary",
  newWindow: false,
};

describe("generateTag", () => {
  it("omits every prop equal to its default", () => {
    expect(
      generateTag("Button", fullButtonDescriptor(), fullButtonDefaults, {
        text: "Mon bouton",
        link: "ma-page",
        color: "primary",
        newWindow: false,
      })
    ).toBe('<Button text="Mon bouton" link="ma-page" />');
  });

  it("writes strings quoted, true as a bare attribute", () => {
    expect(
      generateTag("Button", fullButtonDescriptor(), fullButtonDefaults, {
        text: "Mon bouton",
        color: "success",
        newWindow: true,
      })
    ).toBe('<Button text="Mon bouton" color="success" newWindow />');
  });

  it("never emits a hidden field, even holding a stale value", () => {
    const descriptor = fullButtonDescriptor();
    descriptor.properties.link.showif = { newWindow: true };
    expect(
      generateTag("Button", descriptor, fullButtonDefaults, {
        text: "Mon bouton",
        link: "ma-page",
        newWindow: false,
      })
    ).toBe('<Button text="Mon bouton" />');
  });

  it("always writes a field pre-filled by a YAML value, even unchanged", () => {
    const descriptor = fullButtonDescriptor();
    descriptor.properties.color.value = "primary";
    expect(
      generateTag("Button", descriptor, fullButtonDefaults, {
        text: "Mon bouton",
        color: "primary",
      })
    ).toBe('<Button text="Mon bouton" color="primary" />');
  });

  it("writes an explicit {false} when the default is true", () => {
    expect(
      generateTag(
        "Pdf",
        {
          label: "PDF",
          properties: {
            toolbar: { label: "Barre d'outils", type: "checkbox" },
          },
        },
        { toolbar: true },
        { toolbar: false }
      )
    ).toBe("<Pdf toolbar={false} />");
  });
});

describe("parseTag + tagToBuilderState (mapping inverse)", () => {
  it("reads values back, absent props showing their defaults", () => {
    const tag = parseTag('<Button text="Mon bouton" newWindow />');
    expect(tag?.name).toBe("Button");
    const state = tagToBuilderState(
      fullButtonDescriptor(),
      fullButtonDefaults,
      tag!
    );
    expect(state).toEqual({
      values: {
        text: "Mon bouton",
        link: undefined,
        color: "primary",
        newWindow: true,
      },
      unknownAttributes: [],
    });
  });

  it("keeps a hand-written unknown prop verbatim", () => {
    const tag = parseTag('<Button text="Go" className="text-right" />');
    const state = tagToBuilderState(
      fullButtonDescriptor(),
      fullButtonDefaults,
      tag!
    );
    expect(state?.unknownAttributes).toEqual(['className="text-right"']);
  });

  it("returns null on a malformed tag", () => {
    expect(parseTag('<Button text="Mon bouton>')).toBeNull();
    expect(parseTag("<button />")).toBeNull();
  });

  // A known prop holding an expression stays editable: it is precisely the
  // value the author came to fix, and the sandbox drops it anyway (ADR 0002).
  it("falls a known prop back to its default when it holds an expression", () => {
    const tag = parseTag('<Button text={someVariable} color="success" />');
    const state = tagToBuilderState(
      fullButtonDescriptor(),
      fullButtonDefaults,
      tag!
    );
    expect(state.values.text).toBe(fullButtonDefaults.text);
    // The rest of the tag is still read normally.
    expect(state.values.color).toBe("success");
  });

  it("drops the expression on regeneration rather than duplicating the prop", () => {
    const tag = parseTag('<Button link="/a" text={someVariable} />');
    const state = tagToBuilderState(
      fullButtonDescriptor(),
      fullButtonDefaults,
      tag!
    );
    const regenerated = generateTag(
      "Button",
      fullButtonDescriptor(),
      fullButtonDefaults,
      { ...state.values, text: "Corrigé" },
      state.unknownAttributes
    );
    expect(regenerated).toContain('text="Corrigé"');
    expect(regenerated).not.toContain("someVariable");
  });

  it("still carries an unknown prop's expression verbatim", () => {
    // Not ours to rewrite: it is valid JSX the descriptor says nothing about.
    const tag = parseTag("<Button text=\"Go\" data-x={someVariable} />");
    const state = tagToBuilderState(
      fullButtonDescriptor(),
      fullButtonDefaults,
      tag!
    );
    expect(state.unknownAttributes).toEqual(["data-x={someVariable}"]);
  });
});

describe("idempotence", () => {
  it("re-validating a builder-generated tag without change regenerates it identically", () => {
    const source =
      '<Button text="Mon bouton" color="success" newWindow className="text-right" />';
    const tag = parseTag(source)!;
    const state = tagToBuilderState(
      fullButtonDescriptor(),
      fullButtonDefaults,
      tag
    )!;
    expect(
      generateTag(
        "Button",
        fullButtonDescriptor(),
        fullButtonDefaults,
        state.values,
        state.unknownAttributes
      )
    ).toBe(source);
  });

  it("normalizes a hand-written tag to a stable fixpoint in one pass", () => {
    const roundTrip = (source: string) => {
      const state = tagToBuilderState(
        fullButtonDescriptor(),
        fullButtonDefaults,
        parseTag(source)!
      )!;
      return generateTag(
        "Button",
        fullButtonDescriptor(),
        fullButtonDefaults,
        state.values,
        state.unknownAttributes
      );
    };
    const handWritten =
      "<Button   newWindow={true} color='success'  text=\"Go\" />";
    const normalized = roundTrip(handWritten);
    expect(normalized).toBe('<Button text="Go" color="success" newWindow />');
    expect(roundTrip(normalized)).toBe(normalized);
  });
});

describe("findComponentTag", () => {
  const doc = 'Avant <Button text="Go" /> entre <Pdf file="doc.pdf" /> après';

  it("finds the tag enclosing the cursor", () => {
    const offsetInPdf = doc.indexOf("doc.pdf");
    const found = findComponentTag(doc, offsetInPdf);
    expect(found?.tag.name).toBe("Pdf");
    expect(doc.slice(found!.from, found!.to)).toBe('<Pdf file="doc.pdf" />');
  });

  it("returns null between tags or inside a malformed tag", () => {
    expect(findComponentTag(doc, doc.indexOf("entre"))).toBeNull();
    const malformed = 'Texte <Button text="Go >< fin';
    expect(findComponentTag(malformed, malformed.indexOf("Go"))).toBeNull();
  });
});

// wiki-link's serialization target (docs/component-builder.md, `emits`).
describe("generateMarkdownLink", () => {
  const defaults = { text: undefined, link: undefined, target: "self" };

  it("omits the annotation when the target is the default", () => {
    expect(
      generateMarkdownLink(defaults, {
        text: "Notre équipe",
        link: "equipe",
        target: "self",
      })
    ).toBe("[Notre équipe](equipe)");
  });

  it("annotates a non-default target", () => {
    expect(
      generateMarkdownLink(defaults, {
        text: "Docs",
        link: "https://exemple.org",
        target: "_blank",
      })
    ).toBe("[Docs](https://exemple.org){{ target: '_blank' }}");
  });

  it("falls back on the link when the text is empty", () => {
    expect(generateMarkdownLink(defaults, { link: "equipe" })).toBe(
      "[equipe](equipe)"
    );
  });
});
