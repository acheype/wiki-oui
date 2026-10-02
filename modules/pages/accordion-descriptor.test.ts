import { describe, expect, it } from "vitest";
import { loadComponentBuilders } from "@/modules/authoring/descriptors";

describe("Accordion ComponentBuilder descriptor", () => {
  it("describes its global presentation and contextual Collapsible fields", async () => {
    const specs = await loadComponentBuilders();
    const accordion = specs.find((spec) => spec.name === "Accordion");

    expect(accordion?.descriptor).toMatchObject({
      label: "Accordéon",
      description:
        "Regrouper plusieurs blocs dépliables dont un seul peut être ouvert à la fois",
      properties: {
        toggleIcon: { default: "chevron" },
        display: { default: "separators" },
        spacing: { default: "joined" },
        headingLevel: { default: "none", advanced: true },
      },
      children: {
        component: "Collapsible",
        label: "Bloc",
        collectionLabel: "Blocs dépliables",
        selection: { prop: "default", initial: "none" },
        anchorField: "title",
        initialContent: "Contenu du bloc dépliable à modifier",
        singleChildWarning:
          "Cet accordéon ne contient qu'un bloc. Utilisez plutôt un bloc dépliable seul.",
        properties: {
          title: {
            initialValue: "Titre de mon bloc",
            required: true,
          },
          icon: { type: "icon" },
        },
      },
    });
    expect(accordion?.descriptor.properties.display.options).toMatchObject({
      separators: "Séparateurs",
      "separators-highlight": "Séparateurs et surbrillance",
    });
    expect(accordion?.descriptor.properties.accentColor.showif).toEqual({
      display:
        "/^(separators-highlight|outline-tinted|outline-highlight|highlight)$/",
    });
    expect(accordion?.descriptor.properties.outlineColor.options).toEqual({
      none: "Aucune",
      primary: "Primaire",
      secondary: "Secondaire",
      success: "Succès",
      info: "Information",
      warning: "Avertissement",
      destructive: "Destructif",
    });
    expect(accordion?.descriptor.properties.accentColor.options).toEqual({
      primary: "Primaire",
      secondary: "Secondaire",
      success: "Succès",
      info: "Information",
      warning: "Avertissement",
      destructive: "Destructif",
    });
  });
});
