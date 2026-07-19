import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import type { ComponentDescriptor } from "./component-descriptor";
import { loadComponentBuilders } from "./component-descriptors";
import {
  type ComponentSignature,
  checkSignature,
  extractSignature,
  verifyDescriptorSignatures,
} from "./verify-descriptors";

// A coherent button-like signature to mutate per case.
function buttonSignature(): ComponentSignature {
  return {
    file: "components/wiki/button.tsx",
    props: {
      text: { tsOptional: true, type: { kind: "string" } },
      link: { tsOptional: true, type: { kind: "string" } },
      color: {
        tsOptional: true,
        type: { kind: "union", values: ["default", "primary"] },
        destructuringDefault: { literal: "primary" },
      },
      newWindow: {
        tsOptional: true,
        type: { kind: "boolean" },
        destructuringDefault: { literal: false },
      },
    },
  };
}

function buttonDescriptor(): ComponentDescriptor {
  return {
    label: "Bouton",
    properties: {
      text: { label: "Texte", type: "text", value: "Mon bouton" },
      link: { label: "Lien", type: "page-list", required: true },
      color: {
        label: "Couleur",
        type: "list",
        default: "primary",
        options: { default: "Défaut", primary: "Primaire" },
      },
      newWindow: { label: "Nouvelle fenêtre", type: "checkbox", default: false },
    },
  };
}

describe("checkSignature", () => {
  it("passes a descriptor that matches its component", () => {
    const result = checkSignature("Button", buttonDescriptor(), buttonSignature());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("flags a field that is not a prop of the component", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.colour = { label: "Couleur", type: "text" };
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'components/wiki/button.yaml: field "colour" is not a prop of <Button> (components/wiki/button.tsx)'
    );
  });

  it("flags a runtime-required prop missing required: true (value does not satisfy it)", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.link.required = false;
    const signature = buttonSignature();
    signature.props.link.tsOptional = false; // required in TS, no default
    const { errors } = checkSignature("Button", descriptor, signature);
    expect(errors).toContain(
      'components/wiki/button.yaml: field "link" must set "required: true" — prop "link" is required at runtime in <Button> (components/wiki/button.tsx)'
    );
  });

  it("flags a field type that does not match the prop type", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.newWindow.type = "text";
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'components/wiki/button.yaml: field "newWindow" (type text) does not match prop "newWindow": boolean in <Button> (components/wiki/button.tsx)'
    );
  });

  it("flags a scalar field facing an enum prop (should be a list)", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.type = "text";
    delete descriptor.properties.color.options;
    delete descriptor.properties.color.default;
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'components/wiki/button.yaml: field "color" (type text) faces the enum prop "default" | "primary" of <Button>; use type: list (components/wiki/button.tsx)'
    );
  });

  it("flags a list option outside the prop union", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.options = { default: "Défaut", brand: "Marque" };
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      "components/wiki/button.yaml: list field \"color\" option \"brand\" is outside <Button>'s prop union (default, primary) (components/wiki/button.tsx)"
    );
  });

  it("flags a list default outside the prop union", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.default = "brand";
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      "components/wiki/button.yaml: list field \"color\" default \"brand\" is outside <Button>'s prop union (default, primary) (components/wiki/button.tsx)"
    );
  });

  it("flags a default that drifts from the component destructuring default", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.newWindow.default = true;
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      "components/wiki/button.yaml: field \"newWindow\" default true differs from <Button>'s default false (components/wiki/button.tsx)"
    );
  });

  it("flags a YAML default when the component prop has no destructuring default", () => {
    const descriptor = buttonDescriptor();
    const signature = buttonSignature();
    delete signature.props.newWindow.destructuringDefault;
    const { errors } = checkSignature("Button", descriptor, signature);
    expect(errors).toContain(
      "components/wiki/button.yaml: field \"newWindow\" default false differs from <Button>'s default undefined (components/wiki/button.tsx)"
    );
  });

  it("flags a value whose type does not fit the prop", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.text.value = 42;
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'components/wiki/button.yaml: field "text" value 42 does not fit prop "text": string in <Button> (components/wiki/button.tsx)'
    );
  });

  it("warns, without failing, on a runtime-computed default", () => {
    const descriptor = buttonDescriptor();
    const signature = buttonSignature();
    signature.props.color.destructuringDefault = { unverifiable: true };
    const { errors, warnings } = checkSignature("Button", descriptor, signature);
    expect(errors).toEqual([]);
    expect(warnings).toContain(
      "components/wiki/button.yaml: field \"color\" default is computed at runtime in <Button> and cannot be verified (components/wiki/button.tsx)"
    );
  });

  it("points at the offending line on both sides when positions are known", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.newWindow.default = true; // drift
    const signature = buttonSignature();
    signature.props.newWindow.defaultLine = 81; // component-side line
    const lineOf = (path: (string | number)[]) =>
      path.join(".") === "properties.newWindow.default" ? 44 : undefined;
    const { errors } = checkSignature("Button", descriptor, signature, lineOf);
    expect(errors).toContain(
      "components/wiki/button.yaml:44: field \"newWindow\" default true differs from <Button>'s default false (components/wiki/button.tsx:81)"
    );
  });

  it("skips divider fields entirely", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.effects = { label: "Effets", type: "divider" };
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toEqual([]);
  });
});

describe("extractSignature", () => {
  function signatureOf(source: string, name: string, extra?: string) {
    const project = new Project({ useInMemoryFileSystem: true });
    if (extra) project.createSourceFile("defaults.ts", extra);
    const file = project.createSourceFile("component.tsx", source);
    return extractSignature(file, name, "component.tsx");
  }

  it("reads names, optionality, types, inline literal defaults and their lines", () => {
    const signature = signatureOf(
      `type ButtonProps = {
         text?: string;
         link: string;
         color?: "default" | "primary";
         count?: number;
         newWindow?: boolean;
       };
       export function Button({
         text,
         link,
         color = "primary",
         count = 3,
         newWindow = false,
       }: ButtonProps) { return null; }`,
      "Button"
    );
    expect(signature.file).toBe("component.tsx");
    expect(signature.props.text).toMatchObject({ tsOptional: true, type: { kind: "string" } });
    expect(signature.props.link.tsOptional).toBe(false);
    expect(signature.props.color).toMatchObject({
      tsOptional: true,
      type: { kind: "union", values: ["default", "primary"] },
      destructuringDefault: { literal: "primary" },
    });
    expect(signature.props.count.destructuringDefault).toEqual({ literal: 3 });
    expect(signature.props.newWindow.destructuringDefault).toEqual({ literal: false });
    // Positions come through for messages: the prop declaration and its default.
    expect(typeof signature.props.color.line).toBe("number");
    expect(typeof signature.props.color.defaultLine).toBe("number");
  });

  it("traces a default through an imported constant", () => {
    const signature = signatureOf(
      `import { defaults } from "./defaults";
       type P = { color?: string };
       export function Widget({ color = defaults.color }: P) { return null; }`,
      "Widget",
      `export const defaults = { color: "primary" };`
    );
    expect(signature.props.color.destructuringDefault).toEqual({ literal: "primary" });
  });

  it("marks a runtime-computed default as unverifiable", () => {
    const signature = signatureOf(
      `type P = { color?: string };
       function compute() { return "x"; }
       export function Widget({ color = compute() }: P) { return null; }`,
      "Widget"
    );
    expect(signature.props.color.destructuringDefault).toEqual({ unverifiable: true });
  });
});

// Runs the whole pass against the shipped components: parses the real .tsx via
// ts-morph loading the project, so a drift in the repo would surface here too.
describe("verifyDescriptorSignatures (shipped components)", () => {
  it("passes on the shipped descriptors", async () => {
    const specs = await loadComponentBuilders();
    await expect(verifyDescriptorSignatures(specs)).resolves.toBeUndefined();
  });

  it("throws, with both file locations, when a shipped descriptor drifts", async () => {
    const specs = await loadComponentBuilders();
    const button = specs.find((spec) => spec.name === "Button")!;
    const original = button.descriptor.properties.color.default;
    button.descriptor.properties.color.default = "success";
    try {
      await expect(verifyDescriptorSignatures(specs)).rejects.toThrow(
        /components\/wiki\/button\.yaml:\d+: field "color" default "success" differs from <Button>'s default "primary" \(components\/wiki\/button\.tsx:\d+\)/
      );
    } finally {
      button.descriptor.properties.color.default = original;
    }
  });
});

/* ------------------------------------------------------------------ *
 * v0.4 — structured field types against TS shapes (ADR 0018/0019)
 * ------------------------------------------------------------------ */

describe("checkSignature — structured types", () => {
  function entriesSignature(): ComponentSignature {
    return {
      file: "components/wiki/entries-view.tsx",
      props: {
        form: { tsOptional: false, type: { kind: "string-or-strings" } },
        view: {
          tsOptional: true,
          type: { kind: "union", values: ["list", "grid", "map"] },
          destructuringDefault: { literal: "list" },
        },
        filters: {
          tsOptional: true,
          type: { kind: "object-array", keys: ["field", "title", "icon"] },
        },
        colorField: { tsOptional: true, type: { kind: "string" } },
        colors: { tsOptional: true, type: { kind: "record" } },
        initialArea: {
          tsOptional: true,
          type: { kind: "object", keys: ["lat", "lng", "zoom"] },
        },
        searchFields: { tsOptional: true, type: { kind: "string-array" } },
      },
    };
  }

  function entriesViewDescriptor(): ComponentDescriptor {
    return {
      label: "Fiches",
      properties: {
        form: { label: "Formulaire", type: "form-list", multiple: true, required: true },
        view: {
          label: "Vue",
          type: "view-picker",
          default: "list",
          options: { list: "Liste", grid: "Grille", map: "Carte" },
        },
        filters: { label: "Filtres", type: "field-rows", withIcon: true },
        colorField: { label: "Champ couleur", type: "form-field" },
        colors: { label: "Couleurs", type: "color-mapping", fieldFrom: "colorField" },
        initialArea: { label: "Vue initiale", type: "map-view" },
        searchFields: { label: "Champs cherchés", type: "form-field", multiple: true },
      },
    };
  }

  it("passes when every structured field faces its TS shape", () => {
    const result = checkSignature(
      "EntriesView",
      entriesViewDescriptor(),
      entriesSignature()
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("flags a multiple selector facing a plain string prop", () => {
    const signature = entriesSignature();
    signature.props.form = { tsOptional: false, type: { kind: "string" } };
    const { errors } = checkSignature(
      "EntriesView",
      entriesViewDescriptor(),
      signature
    );
    expect(errors.some((error) => error.includes('field "form"') && error.includes("string | string[]"))).toBe(true);
  });

  it("flags field-rows facing an object array without a field key", () => {
    const signature = entriesSignature();
    signature.props.filters = {
      tsOptional: true,
      type: { kind: "object-array", keys: ["title"] },
    };
    const { errors } = checkSignature(
      "EntriesView",
      entriesViewDescriptor(),
      signature
    );
    expect(errors.some((error) => error.includes('"field" key'))).toBe(true);
  });

  it("flags a mapping facing anything but a record, and a view-picker outside the union", () => {
    const signature = entriesSignature();
    signature.props.colors = { tsOptional: true, type: { kind: "string" } };
    const descriptor = entriesViewDescriptor();
    descriptor.properties.view.options = { ...descriptor.properties.view.options, carousel: "Carrousel" };
    const { errors } = checkSignature("EntriesView", descriptor, signature);
    expect(errors.some((error) => error.includes("Record<string, string>"))).toBe(true);
    expect(errors.some((error) => error.includes('option "carousel" is outside'))).toBe(true);
  });

  it("checks the alias' prop name, not the field key", () => {
    const signature = entriesSignature();
    signature.props.entryDisplay = {
      tsOptional: true,
      type: { kind: "union", values: ["popup", "sidebar"] },
      destructuringDefault: { unverifiable: true },
    };
    const descriptor = entriesViewDescriptor();
    descriptor.properties.mapDisplay = {
      label: "Lors du clic",
      type: "list",
      prop: "entryDisplay",
      default: "sidebar",
      options: { popup: "En popup", sidebar: "Panneau" },
      showif: { view: "map" },
    };
    const { errors } = checkSignature("EntriesView", descriptor, signature);
    expect(errors).toEqual([]);
  });
});

describe("extractSignature — structured shapes", () => {
  function signatureOf(source: string, name: string) {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile("component.tsx", source);
    return extractSignature(file, name, "component.tsx");
  }

  it("reads arrays, records, unions of string|string[] and object shapes", () => {
    const signature = signatureOf(
      `interface EntryFilter { field: string; title?: string; icon?: string }
       type Props = {
         form: string | string[];
         filters?: EntryFilter[];
         searchFields?: string[];
         colors?: Record<string, string>;
         initialArea?: { lat: number; lng: number; zoom: number };
       };
       export function EntriesView({ form }: Props) { return null; }`,
      "EntriesView"
    );
    expect(signature.props.form.type).toEqual({ kind: "string-or-strings" });
    expect(signature.props.filters.type).toEqual({
      kind: "object-array",
      keys: ["field", "title", "icon"],
    });
    expect(signature.props.searchFields.type).toEqual({ kind: "string-array" });
    expect(signature.props.colors.type).toEqual({ kind: "record" });
    expect(signature.props.initialArea.type).toEqual({
      kind: "object",
      keys: ["lat", "lng", "zoom"],
    });
  });
});
