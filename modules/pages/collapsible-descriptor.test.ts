import { describe, expect, it } from "vitest";

import { loadComponentBuilders } from "@/modules/authoring/descriptors";

describe("Collapsible ComponentBuilder descriptor", () => {
  it("offers only meaningful colors for each appearance", async () => {
    const specs = await loadComponentBuilders();
    const collapsible = specs.find((spec) => spec.name === "Collapsible");

    expect(collapsible).toBeDefined();

    const outlineColor = collapsible?.descriptor.properties.outlineColor;
    const highlightColor = collapsible?.descriptor.properties.highlightColor;
    const defaultOpen = collapsible?.descriptor.properties.defaultOpen;

    expect(defaultOpen).toMatchObject({
      label: "Affichage initial",
      checkboxLabel: "Déplié par défaut",
      type: "checkbox",
      default: false,
    });

    expect(outlineColor).toMatchObject({
      default: "none",
      options: {
        none: "Aucune",
        primary: "Primaire",
      },
    });
    expect(outlineColor?.options).not.toHaveProperty("default");

    expect(highlightColor).toMatchObject({
      default: "primary",
      options: {
        primary: "Primaire",
      },
    });
    expect(highlightColor?.options).not.toHaveProperty("default");
    expect(highlightColor?.options).not.toHaveProperty("none");
  });
});
