import { describe, expect, it } from "vitest";
import { lintPageSource } from "@/modules/pages/lint";
import { loadComponentBuilders } from "../descriptors";
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
    selection: { prop: "default", initial: "first" },
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
  it.each(["Accordion", "Tabs"])("generates %s selections accepted at page save", async (name) => {
    const builders = await loadComponentBuilders();
    const spec = builders.find((candidate) => candidate.name === name)!;
    let editor = createManagedWrapperEditor(spec.descriptor.children!);
    editor = applyManagedWrapperCommand(editor, { type: "select", id: editor.rows[1].id });
    const result = managedWrapperResult(wrapperShapeOf(spec), editor, {
      values: {}, unknownAttributes: [], globalMissing: false,
    });
    expect(result.blocked).toBe(false);
    expect(result.source).toContain('default="');
    const registry = builders.flatMap((builder) => [
      builder.name, ...(builder.descriptor.children ? [builder.descriptor.children.component] : []),
    ]);
    expect(lintPageSource(result.source, registry, builders, new Set())).toEqual([]);
  });

  it("does not select or emit an initial child without a selection declaration", () => {
    const children = { ...descriptor.children!, selection: undefined };
    const spec = { name: "Blocks", descriptor: { ...descriptor, children }, defaults: {} };
    let editor = createManagedWrapperEditor(children);
    editor = applyManagedWrapperCommand(editor, { type: "select", id: editor.rows[1].id });
    const result = managedWrapperResult(wrapperShapeOf(spec), editor, {
      values: {}, unknownAttributes: [], globalMissing: false,
    });
    expect(result.defaultId).toBeNull();
    expect(result.source).not.toContain(" default=");
  });

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
    const none = { ...descriptor.children!, selection: { prop: "default", initial: "none" as const } };
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
