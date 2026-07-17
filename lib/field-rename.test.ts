import { describe, expect, it } from "vitest";
import {
  fieldRenameMapping,
  renameDataKeys,
  renameFieldBindings,
  renameFieldReferences,
} from "./field-rename";
import type { FormField } from "./form-descriptor";

const mapping = new Map([["ancien", "nouveau"]]);
const swap = new Map([
  ["a", "b"],
  ["b", "a"],
]);

describe("fieldRenameMapping", () => {
  it("drops identity pairs", () => {
    expect(
      fieldRenameMapping([
        { from: "a", to: "a" },
        { from: "b", to: "c" },
      ])
    ).toEqual(new Map([["b", "c"]]));
  });
});

describe("renameDataKeys", () => {
  it("renames mapped keys and keeps the others", () => {
    expect(
      renameDataKeys({ ancien: "valeur", autre: 3 }, mapping)
    ).toEqual({ nouveau: "valeur", autre: 3 });
  });

  it("keeps a crossed swap correct in one pass", () => {
    expect(renameDataKeys({ a: 1, b: 2, c: 3 }, swap)).toEqual({
      b: 1,
      a: 2,
      c: 3,
    });
  });

  it("returns null when no key matches", () => {
    expect(renameDataKeys({ autre: "x" }, mapping)).toBeNull();
    expect(renameDataKeys({}, mapping)).toBeNull();
  });
});

describe("renameFieldReferences", () => {
  it("rewrites {champ} references, and only them", () => {
    expect(
      renameFieldReferences("{ancien} et ancien et {autre}", mapping)
    ).toBe("{nouveau} et ancien et {autre}");
  });

  it("keeps a crossed swap correct in one pass", () => {
    expect(renameFieldReferences("{a} {b}", swap)).toBe("{b} {a}");
  });

  it("ignores brace contents that are not field-name shaped", () => {
    expect(renameFieldReferences("{Ancien} {ancien }", mapping)).toBeNull();
  });

  it("returns null when nothing references a renamed name", () => {
    expect(renameFieldReferences("texte sans reference", mapping)).toBeNull();
  });
});

describe("renameFieldBindings", () => {
  it("renames the field's own name", () => {
    const field: FormField = { type: "text", label: "Ancien", name: "ancien" };
    expect(renameFieldBindings(field, mapping)).toEqual({
      ...field,
      name: "nouveau",
    });
  });

  it("preserves extra bookkeeping props (canvas fields)", () => {
    const field = {
      type: "text",
      label: "Ancien",
      name: "ancien",
      _id: "field-1",
    } as FormField;
    expect(renameFieldBindings(field, mapping)).toEqual({
      ...field,
      name: "nouveau",
    });
  });

  it("rewrites geolocation address bindings", () => {
    const field: FormField = {
      type: "geolocation",
      label: "Position",
      name: "position",
      streetField: "ancien",
      townField: "ville",
    };
    expect(renameFieldBindings(field, mapping)).toEqual({
      ...field,
      streetField: "nouveau",
    });
  });

  it("rewrites the automatic-title template but never the title name", () => {
    const field: FormField = {
      type: "title",
      label: "Titre",
      name: "title",
      automatic: true,
      template: "{ancien} — {autre}",
    };
    expect(renameFieldBindings(field, new Map([["title", "x"], ...mapping]))).toEqual(
      { ...field, template: "{nouveau} — {autre}" }
    );
  });

  it("returns null when the field is untouched", () => {
    const field: FormField = { type: "text", label: "Autre", name: "autre" };
    expect(renameFieldBindings(field, mapping)).toBeNull();
  });
});
