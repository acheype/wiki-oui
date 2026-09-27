import { describe, expect, it } from "vitest";
import { loadComponentBuilders } from "@/modules/authoring/descriptors";

describe("Button ComponentBuilder descriptor", () => {
  it("offers the shadcn semantic palette", async () => {
    const specs = await loadComponentBuilders();
    const button = specs.find((spec) => spec.name === "Button");

    expect(button?.descriptor.properties.color).toMatchObject({
      default: "primary",
      options: {
        default: "Défaut",
        primary: "Primaire",
        secondary: "Secondaire",
        success: "Succès",
        info: "Information",
        warning: "Avertissement",
        destructive: "Destructif",
        transparent: "Transparent",
      },
    });
  });
});
