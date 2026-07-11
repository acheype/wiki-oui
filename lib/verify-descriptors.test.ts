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
      'Button: descriptor field "colour" is not a prop of the component'
    );
  });

  it("flags a runtime-required prop missing required: true (value does not satisfy it)", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.link.required = false;
    const signature = buttonSignature();
    signature.props.link.tsOptional = false; // required in TS, no default
    const { errors } = checkSignature("Button", descriptor, signature);
    expect(errors).toContain(
      'Button: prop "link" is required at runtime but its descriptor field is missing "required: true"'
    );
  });

  it("flags a field type that does not match the prop type", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.newWindow.type = "text";
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'Button: descriptor field "newWindow" (type text) does not match prop type boolean'
    );
  });

  it("flags a scalar field facing an enum prop (should be a list)", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.type = "text";
    delete descriptor.properties.color.options;
    delete descriptor.properties.color.default;
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'Button: descriptor field "color" (type text) faces the enum prop "default" | "primary"; use type: list'
    );
  });

  it("flags a list option outside the prop union", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.options = { default: "Défaut", brand: "Marque" };
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'Button: list field "color" option "brand" is outside the prop union (default, primary)'
    );
  });

  it("flags a list default outside the prop union", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.color.default = "brand";
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'Button: list field "color" default "brand" is outside the prop union (default, primary)'
    );
  });

  it("flags a default that drifts from the component destructuring default", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.newWindow.default = true;
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'Button: descriptor field "newWindow" default true differs from the component default false'
    );
  });

  it("flags a YAML default when the component prop has no destructuring default", () => {
    const descriptor = buttonDescriptor();
    const signature = buttonSignature();
    delete signature.props.newWindow.destructuringDefault;
    const { errors } = checkSignature("Button", descriptor, signature);
    expect(errors).toContain(
      'Button: descriptor field "newWindow" default false differs from the component default undefined'
    );
  });

  it("flags a value whose type does not fit the prop", () => {
    const descriptor = buttonDescriptor();
    descriptor.properties.text.value = 42;
    const { errors } = checkSignature("Button", descriptor, buttonSignature());
    expect(errors).toContain(
      'Button: descriptor field "text" value 42 does not fit prop type string'
    );
  });

  it("warns, without failing, on a runtime-computed default", () => {
    const descriptor = buttonDescriptor();
    const signature = buttonSignature();
    signature.props.color.destructuringDefault = { unverifiable: true };
    const { errors, warnings } = checkSignature("Button", descriptor, signature);
    expect(errors).toEqual([]);
    expect(warnings).toContain(
      'Button: descriptor field "color" default is computed at runtime and cannot be verified against the component'
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
    return extractSignature(file, name);
  }

  it("reads names, optionality, types and inline literal defaults", () => {
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
    expect(signature.props.text).toEqual({ tsOptional: true, type: { kind: "string" } });
    expect(signature.props.link.tsOptional).toBe(false);
    expect(signature.props.color).toEqual({
      tsOptional: true,
      type: { kind: "union", values: ["default", "primary"] },
      destructuringDefault: { literal: "primary" },
    });
    expect(signature.props.count.destructuringDefault).toEqual({ literal: 3 });
    expect(signature.props.newWindow.destructuringDefault).toEqual({ literal: false });
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
    expect(() => verifyDescriptorSignatures(specs)).not.toThrow();
  });

  it("throws when a shipped descriptor drifts from its component", async () => {
    const specs = await loadComponentBuilders();
    const button = specs.find((spec) => spec.name === "Button")!;
    const original = button.descriptor.properties.color.default;
    button.descriptor.properties.color.default = "success";
    try {
      expect(() => verifyDescriptorSignatures(specs)).toThrow(
        /differs from the component default/
      );
    } finally {
      button.descriptor.properties.color.default = original;
    }
  });
});
