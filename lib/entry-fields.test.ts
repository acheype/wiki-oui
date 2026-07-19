import { describe, expect, it } from "vitest";
import {
  AUTO_PALETTE,
  autoColorMapping,
  fieldChoiceOptions,
  resolveColorMapping,
  unionEntryFields,
} from "./entry-fields";
import type { FormDescriptor } from "./form-descriptor";

const associations: FormDescriptor = {
  fields: [
    { type: "title", name: "title", label: "Nom" },
    {
      type: "list",
      name: "type",
      label: "Type d'acteur",
      options: { asso: "Association", collectif: "Collectif" },
    },
    { type: "text", name: "commune", label: "Commune" },
    { type: "image", name: "logo", label: "Logo" },
    { type: "customContent", name: "aide", label: "Aide", entryContent: "…" },
  ],
};

const evenements: FormDescriptor = {
  fields: [
    { type: "title", name: "title", label: "Titre" },
    { type: "date", name: "date-debut", label: "Date de début" },
    {
      type: "list",
      name: "type",
      label: "Type d'événement",
      options: { concert: "Concert" },
    },
  ],
};

describe("unionEntryFields", () => {
  it("unions by name, first carrier winning label and options", () => {
    const choices = unionEntryFields([
      { name: "Associations", descriptor: associations },
      { name: "Événements", descriptor: evenements },
    ]);
    expect(choices.map((choice) => choice.name)).toEqual([
      "title",
      "type",
      "commune",
      "logo",
      "date-debut",
    ]);
    const type = choices.find((choice) => choice.name === "type")!;
    expect(type.label).toBe("Type d'acteur");
    expect(type.options).toEqual({ asso: "Association", collectif: "Collectif" });
    expect(type.partialTo).toBeUndefined(); // carried by both forms
  });

  it("marks a field missing from some forms with its carriers", () => {
    const choices = unionEntryFields([
      { name: "Associations", descriptor: associations },
      { name: "Événements", descriptor: evenements },
    ]);
    expect(choices.find((choice) => choice.name === "commune")?.partialTo).toEqual([
      "Associations",
    ]);
    expect(choices.find((choice) => choice.name === "date-debut")?.partialTo).toEqual([
      "Événements",
    ]);
  });

  it("never offers customContent (it carries no value)", () => {
    const choices = unionEntryFields([
      { name: "Associations", descriptor: associations },
    ]);
    expect(choices.some((choice) => choice.name === "aide")).toBe(false);
  });
});

describe("fieldChoiceOptions", () => {
  const choices = unionEntryFields([
    { name: "Associations", descriptor: associations },
    { name: "Événements", descriptor: evenements },
  ]);

  it("restricts to the declared field types", () => {
    const options = fieldChoiceOptions(
      choices,
      { fieldTypes: ["list", "radio", "multiChoice"] },
      true
    );
    expect(options.map((option) => option.name)).toEqual(["type"]);
  });

  it("appends the declared pseudo-fields, $form only across several forms", () => {
    const restrict = {
      fieldTypes: ["date" as const],
      pseudoFields: ["$form" as const, "$createdAt" as const],
    };
    expect(
      fieldChoiceOptions(choices, restrict, true).map((option) => option.name)
    ).toEqual(["date-debut", "$form", "$createdAt"]);
    expect(
      fieldChoiceOptions(choices, restrict, false).map((option) => option.name)
    ).toEqual(["date-debut", "$createdAt"]);
  });
});

describe("automatic color palette", () => {
  it("attributes colors stably in option order", () => {
    expect(autoColorMapping(["a", "b"])).toEqual({
      a: AUTO_PALETTE[0],
      b: AUTO_PALETTE[1],
    });
  });

  it("cycles beyond the palette length", () => {
    const values = Array.from({ length: AUTO_PALETTE.length + 1 }, (_, i) => `v${i}`);
    const mapping = autoColorMapping(values);
    expect(mapping[`v${AUTO_PALETTE.length}`]).toBe(AUTO_PALETTE[0]);
  });

  it("lets author overrides sit on top of the automatic colors", () => {
    expect(resolveColorMapping(["a", "b"], { b: "#000000" })).toEqual({
      a: AUTO_PALETTE[0],
      b: "#000000",
    });
  });
});
