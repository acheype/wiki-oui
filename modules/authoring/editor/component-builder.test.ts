import { describe, expect, it } from "vitest";
import type { ComponentBuilderSpec } from "../descriptors";
import { descriptorDefaults, type ComponentDescriptor } from "../descriptor";
import { insertionState } from "./component-builder";
import { nextManagedChildValues } from "./managed-wrapper";

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
        initialContent: "Contenu du bloc dépliable à modifier",
        properties: {
          title: {
            label: "Titre",
            type: "text",
            initialValue: "Titre de mon bloc dépliable",
          },
        },
      })
    );

    expect(initial.values).toEqual({ title: "Titre de mon bloc dépliable" });
    expect(initial.content).toBe("\nContenu du bloc dépliable à modifier\n");
    expect(initial.wrapper).toBeUndefined();
  });

  it("numbers the two initial managed children", () => {
    const initial = insertionState(
      spec("Tabs", {
        label: "Onglets",
        properties: {},
        children: {
          component: "Tab",
          label: "Onglet",
          anchorField: "title",
          initialContent: "Contenu de l'onglet à modifier",
          properties: {
            title: {
              label: "Titre",
              type: "text",
              initialValue: "Titre de mon onglet",
            },
            icon: {
              label: "Icône",
              type: "icon",
              initialValue: "lucide:info",
            },
          },
        },
      })
    );

    expect(initial.wrapper?.children.map((child) => child.values)).toEqual([
      { title: "Titre de mon onglet 1", icon: "lucide:info" },
      { title: "Titre de mon onglet 2", icon: "lucide:info" },
    ]);
    expect(initial.wrapper?.children.map((child) => child.content)).toEqual([
      "Contenu de l'onglet à modifier",
      "Contenu de l'onglet à modifier",
    ]);
  });

  it("numbers the declared anchor field and leaves other pre-fills unchanged", () => {
    const descriptor: ComponentDescriptor = {
      label: "Onglets",
      properties: {},
      children: {
        component: "Tab",
        label: "Onglet",
        anchorField: "name",
        properties: {
          name: {
            label: "Nom",
            type: "text",
            initialValue: "Section",
            required: true,
          },
          icon: { label: "Icône", type: "icon", initialValue: "lucide:info" },
        },
      },
    };

    expect(
      nextManagedChildValues(descriptor.children!, [
        { values: { name: "Section 1" }, content: "", unknownAttributes: [] },
        { values: { name: "Section 3" }, content: "", unknownAttributes: [] },
      ])
    ).toEqual({ name: "Section 2", icon: "lucide:info" });
  });
});
