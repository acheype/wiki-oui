import { describe, expect, it } from "vitest";
import { descriptorDefaults, type ComponentDescriptor } from "../descriptor";
import {
  applyManagedWrapperCommand,
  createManagedWrapperEditor,
  managedWrapperResult,
} from "./managed-wrapper";
import { wrapperShapeOf } from "./wrapper";

const descriptor: ComponentDescriptor = {
  label: "Onglets",
  properties: {},
  children: {
    component: "Tab",
    label: "Onglet",
    anchorField: "heading",
    initialSelection: "first",
    initialContent: "Contenu initial",
    properties: {
      heading: {
        label: "Titre",
        type: "text",
        required: true,
        initialValue: "Onglet",
      },
    },
  },
};

const shape = wrapperShapeOf({
  name: "Tabs",
  descriptor,
  defaults: descriptorDefaults(descriptor),
});

describe("managed wrapper editing", () => {
  it("keeps the selected child through rename and reorder", () => {
    let editor = createManagedWrapperEditor(descriptor.children!, {
      defaultChild: "contact",
      children: [
        { values: { heading: "Présentation" }, content: "A", unknownAttributes: [] },
        { values: { heading: "Contact" }, content: "B", unknownAttributes: [] },
      ],
      interstitial: ["before", "between", "after"],
    });
    const selected = editor.rows[1].id;

    editor = applyManagedWrapperCommand(editor, {
      type: "change",
      id: selected,
      field: "heading",
      value: "Été Contact",
    });
    editor = applyManagedWrapperCommand(editor, {
      type: "move",
      from: 1,
      to: 0,
    });

    const result = managedWrapperResult(shape, editor, {
      values: {},
      unknownAttributes: ['data-parent="keep"'],
      globalMissing: false,
    });
    expect(result.blocked).toBe(false);
    expect(result.source).not.toContain(" default=");
    expect(result.source.indexOf("Été Contact")).toBeLessThan(
      result.source.indexOf("Présentation")
    );
    expect(result.source).toContain('data-parent="keep"');
    expect(result.source).toContain("before");
    expect(result.source).toContain("between");
    expect(result.source).toContain("after");
  });

  it("emits a renamed selected anchor while it remains non-first", () => {
    let editor = createManagedWrapperEditor(descriptor.children!, {
      defaultChild: "contact",
      children: [
        { values: { heading: "Présentation" }, content: "A", unknownAttributes: [] },
        { values: { heading: "Contact" }, content: "B", unknownAttributes: [] },
      ],
    });
    editor = applyManagedWrapperCommand(editor, {
      type: "change",
      id: editor.rows[1].id,
      field: "heading",
      value: "Été Contact",
    });

    expect(
      managedWrapperResult(shape, editor, {
        values: {},
        unknownAttributes: [],
        globalMissing: false,
      }).source
    ).toContain('default="ete-contact"');
  });

  it("blocks anchors that collide after slugification", () => {
    let editor = createManagedWrapperEditor(descriptor.children!);
    editor = applyManagedWrapperCommand(editor, {
      type: "change",
      id: editor.rows[0].id,
      field: "heading",
      value: "Été",
    });
    editor = applyManagedWrapperCommand(editor, {
      type: "change",
      id: editor.rows[1].id,
      field: "heading",
      value: "ete",
    });

    const result = managedWrapperResult(shape, editor, {
      values: {},
      unknownAttributes: [],
      globalMissing: false,
    });
    expect(result.blocked).toBe(true);
    expect(result.collidingIds).toEqual(
      new Set(editor.rows.map((row) => row.id))
    );
  });

  it("owns the complete creation of an appended child", () => {
    let editor = createManagedWrapperEditor(descriptor.children!);
    editor = applyManagedWrapperCommand(editor, { type: "remove", id: editor.rows[1].id });
    editor = applyManagedWrapperCommand(editor, { type: "append" });

    expect(editor.rows[1]).toMatchObject({
      values: { heading: "Onglet 2" },
      content: "Contenu initial",
      unknownAttributes: [],
    });
  });

  it("falls back to the declared omission policy after deleting the selection", () => {
    const none = { ...descriptor.children!, initialSelection: "none" as const };
    let editor = createManagedWrapperEditor(none, {
      defaultChild: "contact",
      children: [
        { values: { heading: "Présentation" }, content: "A", unknownAttributes: [] },
        { values: { heading: "Contact" }, content: "B", unknownAttributes: [] },
      ],
      interstitial: ["before", "between", "after"],
    });
    editor = applyManagedWrapperCommand(editor, {
      type: "remove",
      id: editor.rows[1].id,
    });

    const noneShape = wrapperShapeOf({
      name: "Accordion",
      descriptor: { ...descriptor, children: none },
      defaults: {},
    });
    const result = managedWrapperResult(noneShape, editor, {
      values: {},
      unknownAttributes: [],
      globalMissing: false,
    });
    expect(result.source).not.toContain(" default=");
    expect(result.source).toContain("before");
    expect(result.source).toContain("betweenafter");
  });
});
