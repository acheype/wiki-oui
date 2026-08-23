import { describe, expect, it } from "vitest";
import {
  type ComponentDescriptor,
  type DescriptorField,
  type LiteralValue,
  descriptorDefaults,
  findComponentTag,
  type ParsedTag,
  generateMarkdownLink,
  generateTag,
  isEmpty,
  parseLiteral,
  propKindFits,
  sameValue,
  serializeLiteral,
  tagToBuilderState,
  validateDescriptor,
  visibleFields,
} from "./descriptor";

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
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).not.toThrow();
  });

  // The loader edge (ADR 0015): raw parsed YAML goes in, the typed
  // descriptor comes out — no cast.
  it("returns the typed descriptor parsed from raw unknown data", () => {
    const raw: unknown = JSON.parse(JSON.stringify(buttonDescriptor()));
    expect(validateDescriptor("modules/pages/wiki-components/button.yaml", raw)).toEqual(buttonDescriptor());
  });

  it("rejects a descriptor without label or properties", () => {
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", { properties: {} })).toThrow(
      'modules/pages/wiki-components/button.yaml: a descriptor needs at least "label" and "properties"'
    );
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", { label: "Bouton" })).toThrow(
      'modules/pages/wiki-components/button.yaml: a descriptor needs at least "label" and "properties"'
    );
  });

  it("rejects a field without a label, pointing at its line", () => {
    const raw = {
      label: "Bouton",
      properties: { text: { type: "text" } },
    };
    const lineOf = (path: (string | number)[]) =>
      path.join(".") === "properties.text" ? 6 : undefined;
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", raw, lineOf)).toThrow(
      /^modules\/pages\/wiki-components\/button\.yaml:6: /
    );
  });

  it("rejects a list field whose default is not one of its options", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.default = "brand";
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).toThrow(
      'modules/pages/wiki-components/button.yaml: list field "color" needs a default among its options (default, primary), got "brand"'
    );
  });

  it("rejects a list field without a default (strict policy)", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.default = undefined;
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).toThrow(
      'modules/pages/wiki-components/button.yaml: list field "color" needs a default among its options (default, primary), got undefined'
    );
  });

  it("rejects an unknown field type", () => {
    const descriptor = buttonDescriptor();
    // @ts-expect-error -- a YAML typo lands here untyped
    descriptor.properties.text.type = "chekbox";
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).toThrow(
      'modules/pages/wiki-components/button.yaml: field "text" has unknown type "chekbox"'
    );
  });

  it("rejects an unknown emits target", () => {
    const descriptor = buttonDescriptor();
    // @ts-expect-error -- a YAML typo lands here untyped
    descriptor.emits = "markdown";
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).toThrow(
      'modules/pages/wiki-components/button.yaml: unknown emits target "markdown" (the only alternative is markdown-link)'
    );
  });

  it("rejects an invalid showif regex at load time", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.showif = { text: "/(/" };
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).toThrow(
      'modules/pages/wiki-components/button.yaml: showif of "color" holds an invalid regex for "text": /(/'
    );
  });

  it("rejects a showif pointing at an unknown field", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.showif = { size: "notNull" };
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).toThrow(
      'modules/pages/wiki-components/button.yaml: showif of "color" points at unknown field "size"'
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
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).toThrow(
      'modules/pages/wiki-components/button.yaml: file-list field "text" has unknown family "images" (image, pdf, other)'
    );
  });

  it("accepts a divider without a default: it emits no prop", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.appearance = { label: "Apparence", type: "divider" };
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor)).not.toThrow();
  });

  it("points the message at the offending line when a lookup is given", () => {
    const descriptor = buttonDescriptor();
    // @ts-expect-error -- a YAML typo lands here untyped
    descriptor.properties.color.type = "lst";
    // Stub the lookup the loader builds from the parsed YAML: the `type:` key
    // of `color` sits on line 20.
    const lineOf = (path: (string | number)[]) =>
      path.join(".") === "properties.color.type" ? 20 : undefined;
    expect(() => validateDescriptor("modules/pages/wiki-components/button.yaml", descriptor, lineOf)).toThrow(
      'modules/pages/wiki-components/button.yaml:20: field "color" has unknown type "lst"'
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

  // hideIfNoAccess's own showif (wiki-link.yaml, button.yaml,
  // docs/permissions.md § Liens et boutons vers l'inaccessible): a negative
  // lookahead reusing the same regex engine as externalModalWarning, so it
  // hides the moment an author types "https://" — no separate condition kind.
  it("hides behind a negative-lookahead regex on an external URL", () => {
    const descriptor = withShowif({ ratio: "/^(?!https?:\\/\\/)/" });
    expect(visibleFields(descriptor, {}, { ratio: "ma-page" })).toContain("height");
    expect(
      visibleFields(descriptor, {}, { ratio: "https://exemple.org" })
    ).not.toContain("height");
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

// The parser has one entry point, findComponentTag — the cursor-anchored
// pencil is its only caller. These cases feed it a lone tag and take what it
// found there, so they exercise the code the editor actually runs.
function tagAt(source: string): ParsedTag | null {
  return findComponentTag(source, 0)?.tag ?? null;
}

describe("tagAt + tagToBuilderState (mapping inverse)", () => {
  it("reads values back, absent props showing their defaults", () => {
    const tag = tagAt('<Button text="Mon bouton" newWindow />');
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
    const tag = tagAt('<Button text="Go" className="text-right" />');
    const state = tagToBuilderState(
      fullButtonDescriptor(),
      fullButtonDefaults,
      tag!
    );
    expect(state?.unknownAttributes).toEqual(['className="text-right"']);
  });

  it("returns null on a malformed tag", () => {
    expect(tagAt('<Button text="Mon bouton>')).toBeNull();
    expect(tagAt("<button />")).toBeNull();
  });

  // A known prop holding an expression stays editable: it is precisely the
  // value the author came to fix, and the sandbox drops it anyway (ADR 0002).
  it("falls a known prop back to its default when it holds an expression", () => {
    const tag = tagAt('<Button text={someVariable} color="success" />');
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
    const tag = tagAt('<Button link="/a" text={someVariable} />');
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
    const tag = tagAt("<Button text=\"Go\" data-x={someVariable} />");
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
    const tag = tagAt(source)!;
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
        tagAt(source)!
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

  it("annotates hideIfNoAccess only when checked", () => {
    expect(
      generateMarkdownLink(defaults, {
        text: "Notre équipe",
        link: "equipe",
        hideIfNoAccess: true,
      })
    ).toBe("[Notre équipe](equipe){{ hideIfNoAccess: true }}");
  });

  it("combines both annotations when target and hideIfNoAccess both differ", () => {
    expect(
      generateMarkdownLink(defaults, {
        text: "Notre équipe",
        link: "equipe",
        target: "modal",
        hideIfNoAccess: true,
      })
    ).toBe(
      "[Notre équipe](equipe){{ target: 'modal', hideIfNoAccess: true }}"
    );
  });
});

/* ------------------------------------------------------------------ *
 * v0.4 — structured props and the extended field types (ADR 0018/0019)
 * ------------------------------------------------------------------ */

// An EntriesView-shaped descriptor exercising the six new types and the
// `prop:` alias (two entryDisplay declarations kept apart by showif).
function entriesDescriptor(): ComponentDescriptor {
  return {
    label: "Fiches",
    properties: {
      form: {
        label: "Formulaire",
        type: "form-list",
        multiple: true,
        required: true,
      },
      view: {
        label: "Vue",
        type: "view-picker",
        default: "list",
        options: { list: "Liste", grid: "Grille", map: "Carte" },
        icons: { list: "lucide:list", map: "lucide:map" },
      },
      display: {
        label: "Lors du clic, afficher la fiche",
        type: "list",
        prop: "entryDisplay",
        default: "popup",
        options: { popup: "En popup", "new-tab": "Nouvel onglet" },
        showif: { view: "/^(list|grid)$/" },
      },
      mapDisplay: {
        label: "Lors du clic, afficher la fiche",
        type: "list",
        prop: "entryDisplay",
        default: "sidebar",
        options: { popup: "En popup", sidebar: "En panneau latéral" },
        showif: { view: "map" },
      },
      filters: {
        label: "Filtres disponibles",
        type: "field-rows",
        withIcon: true,
        fieldTypes: ["list", "radio", "multiChoice"],
        pseudoFields: ["$form"],
      },
      colorField: {
        label: "Champ pour la couleur",
        type: "form-field",
        fieldTypes: ["list", "radio", "multiChoice"],
      },
      colors: {
        label: "Couleurs",
        type: "color-mapping",
        fieldFrom: "colorField",
        showif: { colorField: "notNull" },
      },
      initialArea: {
        label: "Vue initiale fixe",
        type: "map-view",
        showif: { view: "map" },
      },
    },
  };
}

const entriesDefaults = descriptorDefaults(entriesDescriptor());

describe("parseLiteral", () => {
  it("parses the canonical structured forms", () => {
    expect(parseLiteral('["a", "b"]')).toEqual({ value: ["a", "b"] });
    expect(
      parseLiteral('[{ field: "type", title: "Type de structure" }, { field: "commune" }]')
    ).toEqual({
      value: [
        { field: "type", title: "Type de structure" },
        { field: "commune" },
      ],
    });
    expect(parseLiteral('{ lat: -21.3, lng: 165.5, zoom: 8 }')).toEqual({
      value: { lat: -21.3, lng: 165.5, zoom: 8 },
    });
  });

  it("parses scalars, quoted keys, escapes and trailing commas", () => {
    expect(parseLiteral("true")).toEqual({ value: true });
    expect(parseLiteral("-3.5")).toEqual({ value: -3.5 });
    expect(parseLiteral('{ "clé accentuée": "a\\"b", n: null, }')).toEqual({
      value: { "clé accentuée": 'a"b', n: null },
    });
    expect(parseLiteral("`texte`")).toEqual({ value: "texte" });
  });

  it("refuses anything that is not a pure literal", () => {
    expect(parseLiteral("maVariable")).toBeNull();
    expect(parseLiteral("[maVariable]")).toBeNull();
    expect(parseLiteral('{ field: compute() }')).toBeNull();
    expect(parseLiteral("`a${b}`")).toBeNull();
    expect(parseLiteral('["a"] // reste')).toBeNull();
    expect(parseLiteral('[..."abc"]')).toBeNull();
    expect(parseLiteral('trueish')).toBeNull();
  });
});

describe("serializeLiteral", () => {
  it("writes the form a JS author would write, and reads it back", () => {
    const value: LiteralValue = [
      { field: "type", title: "Type de structure", icon: "lucide:users" },
      { field: "commune" },
    ];
    const written = serializeLiteral(value);
    expect(written).toBe(
      '[{ field: "type", title: "Type de structure", icon: "lucide:users" }, { field: "commune" }]'
    );
    expect(parseLiteral(written)).toEqual({ value });
  });

  it("quotes keys that are not identifiers", () => {
    expect(serializeLiteral({ "a-b": "x" })).toBe('{ "a-b": "x" }');
  });
});

describe("generateTag — structured props (ADR 0019)", () => {
  it("emits structured values as literal expressions, omitting empties", () => {
    expect(
      generateTag("EntriesView", entriesDescriptor(), entriesDefaults, {
        form: ["associations", "evenements"],
        view: "grid",
        filters: [{ field: "type", title: "Type" }],
        colorField: undefined,
      })
    ).toBe(
      '<EntriesView form={["associations", "evenements"]} view="grid" filters={[{ field: "type", title: "Type" }]} />'
    );
  });

  it("keeps a single form as a plain string prop", () => {
    expect(
      generateTag("EntriesView", entriesDescriptor(), entriesDefaults, {
        form: "associations",
      })
    ).toBe('<EntriesView form="associations" />');
  });

  it("omits a structured value equal to its default by deep equality", () => {
    const descriptor = entriesDescriptor();
    const defaults = { ...entriesDefaults, filters: [{ field: "type" }] };
    expect(
      generateTag("EntriesView", descriptor, defaults, {
        form: "a",
        filters: [{ field: "type" }],
      })
    ).toBe('<EntriesView form="a" />');
  });
});

describe("prop alias — one prop, several fields (docs/entries-view.md)", () => {
  it("emits the visible carrier only, honouring its own default", () => {
    // On the map view, sidebar is the default: nothing written.
    expect(
      generateTag("EntriesView", entriesDescriptor(), entriesDefaults, {
        form: "a",
        view: "map",
        mapDisplay: "sidebar",
        display: "popup",
      })
    ).toBe('<EntriesView form="a" view="map" />');
    // Away from the default, the alias writes under its prop name.
    expect(
      generateTag("EntriesView", entriesDescriptor(), entriesDefaults, {
        form: "a",
        view: "map",
        mapDisplay: "popup",
      })
    ).toBe('<EntriesView form="a" view="map" entryDisplay="popup" />');
  });

  it("routes the attribute to the visible carrier on re-edit", () => {
    const tag = findComponentTag(
      '<EntriesView form="a" view="map" entryDisplay="popup" />',
      0
    )!.tag;
    const state = tagToBuilderState(entriesDescriptor(), entriesDefaults, tag);
    expect(state.values.mapDisplay).toBe("popup");
    expect(state.values.display).toBe("popup"); // untouched default
  });

  it("round-trips a tag carrying an aliased prop unchanged", () => {
    const source = '<EntriesView form="a" view="map" entryDisplay="popup" />';
    const tag = findComponentTag(source, 0)!.tag;
    const state = tagToBuilderState(entriesDescriptor(), entriesDefaults, tag);
    expect(
      generateTag(
        "EntriesView",
        entriesDescriptor(),
        entriesDefaults,
        state.values,
        state.unknownAttributes
      )
    ).toBe(source);
  });
});

describe("tagToBuilderState — refined expression rule (ADR 0019)", () => {
  const readState = (source: string) =>
    tagToBuilderState(
      entriesDescriptor(),
      entriesDefaults,
      findComponentTag(source, 0)!.tag
    );

  it("re-edits a structured literal on a structured field", () => {
    const state = readState(
      '<EntriesView form={["a", "b"]} filters={[{ field: "type" }]} />'
    );
    expect(state.values.form).toEqual(["a", "b"]);
    expect(state.values.filters).toEqual([{ field: "type" }]);
  });

  it("still drops a non-literal expression on a structured field", () => {
    const state = readState("<EntriesView form={maVariable} />");
    expect(state.values.form).toBeUndefined();
  });

  it("drops a structured literal on a scalar field", () => {
    const state = readState('<EntriesView view={["list"]} form="a" />');
    expect(state.values.view).toBe("list"); // back to the default
  });

  it("drops a literal whose shape the structured kind cannot hold", () => {
    const state = readState(
      '<EntriesView form="a" filters={[{ title: "Sans field" }]} />'
    );
    expect(state.values.filters).toBeUndefined();
  });

  it("round-trips structured props to a stable fixpoint", () => {
    const source =
      '<EntriesView form={["a", "b"]} view="grid" filters={[{ field: "type", title: "Type", icon: "lucide:users" }]} />';
    const state = readState(source);
    expect(
      generateTag(
        "EntriesView",
        entriesDescriptor(),
        entriesDefaults,
        state.values,
        state.unknownAttributes
      )
    ).toBe(source);
  });
});

describe("validateDescriptor — the six new types (ADR 0018)", () => {
  it("accepts the EntriesView-shaped descriptor", () => {
    expect(() =>
      validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", entriesDescriptor())
    ).not.toThrow();
  });

  it("rejects a view-picker without a default among its options", () => {
    const descriptor = entriesDescriptor();
    descriptor.properties.view.default = "carousel";
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).toThrow(
      /view-picker field "view" needs a default among its options/
    );
  });

  it("rejects a view-picker icon aimed at an unknown option", () => {
    const descriptor = entriesDescriptor();
    descriptor.properties.view.icons = { carousel: "lucide:images" };
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).toThrow(
      /declares an icon for unknown option "carousel"/
    );
  });

  it("rejects a form-field reading its forms from an unknown sibling", () => {
    const descriptor = entriesDescriptor();
    descriptor.properties.colorField.formFrom = "nowhere";
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).toThrow(
      /reads its forms from unknown sibling "nowhere"/
    );
  });

  it("requires the default `form` sibling when formFrom is omitted", () => {
    const descriptor = entriesDescriptor();
    delete descriptor.properties.form;
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).toThrow(
      /reads its forms from unknown sibling "form"/
    );
  });

  it("rejects a mapping without fieldFrom, or aimed at a non form-field", () => {
    const missing = entriesDescriptor();
    delete missing.properties.colors.fieldFrom;
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", missing)).toThrow(
      /needs "fieldFrom" pointing at a sibling form-field, got nothing/
    );
    const wrong = entriesDescriptor();
    wrong.properties.colors.fieldFrom = "view";
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", wrong)).toThrow(
      /points "fieldFrom" at "view", which is not a form-field/
    );
  });

  it("rejects aliased fields not kept apart by showif", () => {
    const descriptor = entriesDescriptor();
    delete descriptor.properties.display.showif;
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).toThrow(
      /all emit prop "entryDisplay", so each needs a showif/
    );
  });
});

describe("propKindFits / isEmpty / sameValue on structured values", () => {
  it("judges each kind by its shape", () => {
    expect(propKindFits("strings", "a")).toBe(true);
    expect(propKindFits("strings", ["a", "b"])).toBe(true);
    expect(propKindFits("strings", [1])).toBe(false);
    expect(propKindFits("rows", [{ field: "type", title: "T" }])).toBe(true);
    expect(propKindFits("rows", [{ title: "T" }])).toBe(false);
    expect(propKindFits("mapping", { oui: "#16a34a" })).toBe(true);
    expect(propKindFits("mapping", ["#16a34a"])).toBe(false);
    expect(propKindFits("area", { lat: 1, lng: 2, zoom: 8 })).toBe(true);
    expect(propKindFits("area", { lat: 1, lng: 2 })).toBe(false);
  });

  it("counts bare structured values as empty", () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
    expect(isEmpty([{ field: "type" }])).toBe(false);
  });

  it("compares structured values by content", () => {
    expect(sameValue([{ field: "a" }], [{ field: "a" }])).toBe(true);
    expect(sameValue([{ field: "a" }], [{ field: "b" }])).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

describe("prefill — choice-driven sibling seeding (docs/entries-view.md)", () => {
  it("accepts a prefill aimed at known options and fields", () => {
    const descriptor = entriesDescriptor();
    descriptor.properties.view.prefill = { grid: { colorField: "type" } };
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).not.toThrow();
  });

  it("rejects a prefill for an unknown option", () => {
    const descriptor = entriesDescriptor();
    descriptor.properties.view.prefill = { carousel: { colorField: "type" } };
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).toThrow(
      /declares a prefill for unknown option "carousel"/
    );
  });

  it("rejects a prefill targeting an unknown field", () => {
    const descriptor = entriesDescriptor();
    descriptor.properties.view.prefill = { grid: { nowhere: "x" } };
    expect(() => validateDescriptor("modules/authoring/wiki-components/entries-view.yaml", descriptor)).toThrow(
      /prefill of "view" targets unknown field "nowhere"/
    );
  });
});
