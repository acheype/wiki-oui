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
  initialContent: "Contenu initial",
  properties: {
    title: { label: "Titre", type: "text", required: true },
  },
});

const accordion = spec("Accordion", {
  label: "Accordéon",
  properties: {},
  children: {
    component: "Collapsible",
    label: "Bloc",
    anchorField: "title",
    properties: {
      title: { label: "Titre", type: "text", required: true },
    },
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

  it("edits a direct managed child through its parent wrapper", () => {
    const source = `<Accordion>
  <Collapsible title="Direct">
Contenu direct
  </Collapsible>
</Accordion>`;
    const info = componentAtCursor(editor(source, source.indexOf("Contenu direct")), [
      accordion,
      collapsible,
    ]);

    expect(info?.spec.name).toBe("Accordion");
    expect(info?.wrapper?.children[0].values.title).toBe("Direct");

    const fromOpeningTag = componentAtCursor(
      editor(source, source.indexOf('title="Direct"')),
      [accordion, collapsible]
    );
    expect(fromOpeningTag?.spec.name).toBe("Accordion");
  });

  it("keeps the autonomous builder for a nested managed-child component", () => {
    const source = `<Accordion>
  <Collapsible title="Direct">
    <Collapsible title="Imbriqué">
Contenu imbriqué
    </Collapsible>
  </Collapsible>
</Accordion>`;
    const info = componentAtCursor(editor(source, source.indexOf("Contenu imbriqué")), [
      accordion,
      collapsible,
    ]);

    expect(info?.spec.name).toBe("Collapsible");
    expect(info?.values.title).toBe("Imbriqué");
  });

  it("keeps the autonomous builder below an unexpected direct container", () => {
    const source = `<Accordion>
  <div>
    <Collapsible title="Imbriqué">
Contenu imbriqué
    </Collapsible>
  </div>
  <Collapsible title="Direct">
Contenu direct
  </Collapsible>
</Accordion>`;
    const info = componentAtCursor(
      editor(source, source.indexOf("Contenu imbriqué")),
      [accordion, collapsible]
    );

    expect(info?.spec.name).toBe("Collapsible");
    expect(info?.values.title).toBe("Imbriqué");
  });
});
