import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { descriptorDefaults, type ComponentDescriptor } from "../descriptor";
import type { ComponentBuilderSpec } from "../descriptors";
import { componentAtCursor } from "./cursor-tools";

function spec(name: string, descriptor: ComponentDescriptor): ComponentBuilderSpec {
  return {
    module: "pages",
    base: name.toLowerCase(),
    name,
    descriptor,
    defaults: descriptorDefaults(descriptor),
  };
}

const collapsible = spec("Collapsible", {
  label: "Bloc dépliable",
  content: "Contenu initial",
  properties: {
    title: { label: "Titre", type: "text", required: true },
  },
});

function editor(source: string, cursor: number): EditorState {
  return EditorState.create({
    doc: source,
    selection: { anchor: cursor },
  });
}

describe("componentAtCursor with free-content wrappers", () => {
  it("reads the innermost wrapper and preserves its exact content", () => {
    const source = `<Collapsible title="Parent">
Avant
<Collapsible title="Enfant" className="fine">
**Dedans**
</Collapsible>
Après
</Collapsible>`;
    const info = componentAtCursor(editor(source, source.indexOf("Dedans")), [
      collapsible,
    ]);

    expect(info?.values.title).toBe("Enfant");
    expect(info?.unknownAttributes).toEqual(['className="fine"']);
    expect(info?.content).toBe("\n**Dedans**\n");
    expect(source.slice(info!.from, info!.to)).toContain('title="Enfant"');
  });
});
