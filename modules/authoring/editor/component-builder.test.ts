import { describe, expect, it } from "vitest";
import type { ComponentBuilderSpec } from "../descriptors";
import { descriptorDefaults, type ComponentDescriptor } from "../descriptor";
import { insertionState } from "./component-builder";

function spec(name: string, descriptor: ComponentDescriptor): ComponentBuilderSpec {
  return {
    module: "pages",
    base: name.toLowerCase(),
    name,
    descriptor,
    defaults: descriptorDefaults(descriptor),
  };
}

describe("insertionState", () => {
  it("seeds a free-content wrapper without exposing content as a prop", () => {
    const initial = insertionState(
      spec("Collapsible", {
        label: "Bloc dépliable",
        content: "Contenu du bloc dépliable à modifier",
        properties: {
          title: {
            label: "Titre",
            type: "text",
            value: "Titre de mon bloc dépliable",
          },
        },
      })
    );

    expect(initial.values).toEqual({ title: "Titre de mon bloc dépliable" });
    expect(initial.content).toBe("\nContenu du bloc dépliable à modifier\n");
    expect(initial.wrapper).toBeUndefined();
  });

  it("applies child pre-fills only to the first initial child", () => {
    const initial = insertionState(
      spec("Tabs", {
        label: "Onglets",
        properties: {},
        children: {
          component: "Tab",
          label: "Onglet",
          properties: {
            title: {
              label: "Titre",
              type: "text",
              value: "Titre de mon onglet",
            },
            icon: { label: "Icône", type: "icon" },
          },
        },
      })
    );

    expect(initial.wrapper?.children.map((child) => child.values)).toEqual([
      { title: "Titre de mon onglet" },
      {},
    ]);
  });
});
