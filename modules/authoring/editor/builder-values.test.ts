import { describe, expect, it } from "vitest";
import {
  descriptorDefaults,
  type ComponentDescriptor,
} from "../descriptor";
import { changeBuilderValue } from "./builder-values";

const descriptor: ComponentDescriptor = {
  label: "Bloc dépliable",
  properties: {
    display: {
      label: "Apparence",
      type: "list",
      default: "outline",
      options: {
        outline: "Contour",
        "outline-tinted": "Contour teinté",
        highlight: "Surbrillance",
      },
    },
    outlineColor: {
      label: "Couleur",
      type: "list",
      prop: "color",
      default: "none",
      showif: { display: "outline" },
      options: { none: "Aucune", primary: "Primaire" },
    },
    highlightColor: {
      label: "Couleur",
      type: "list",
      prop: "color",
      default: "default",
      showif: { display: "/^(outline-tinted|highlight)$/" },
      options: { default: "Défaut", primary: "Primaire" },
    },
  },
};

const defaults = descriptorDefaults(descriptor);

describe("changeBuilderValue", () => {
  it("carries a shared prop value to the field revealed by a choice", () => {
    expect(
      changeBuilderValue(
        descriptor,
        defaults,
        { display: "outline", outlineColor: "primary" },
        "display",
        "highlight"
      )
    ).toMatchObject({ display: "highlight", highlightColor: "primary" });
  });

  it("keeps the target default when it does not accept the previous value", () => {
    expect(
      changeBuilderValue(
        descriptor,
        defaults,
        { display: "outline", outlineColor: "none" },
        "display",
        "highlight"
      ).highlightColor
    ).toBeUndefined();
  });

  it("preserves choice-driven pre-fills while changing values", () => {
    const withPrefill: ComponentDescriptor = {
      label: "Vue",
      properties: {
        view: {
          label: "Vue",
          type: "list",
          default: "list",
          options: { list: "Liste", calendar: "Agenda" },
          prefill: { calendar: { period: "future" } },
        },
        period: {
          label: "Période",
          type: "list",
          default: "all",
          options: { all: "Toutes", future: "À venir" },
        },
      },
    };
    const withPrefillDefaults = descriptorDefaults(withPrefill);

    expect(
      changeBuilderValue(
        withPrefill,
        withPrefillDefaults,
        {},
        "view",
        "calendar"
      )
    ).toEqual({ view: "calendar", period: "future" });
  });
});
