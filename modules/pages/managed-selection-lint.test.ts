import { describe, expect, it } from "vitest";
import { loadComponentBuilders } from "@/modules/authoring/descriptors";
import { lintPageSource } from "./lint";

async function lint(source: string) {
  const builders = await loadComponentBuilders();
  const registry = builders.flatMap((spec) => [
    spec.name,
    ...(spec.descriptor.children ? [spec.descriptor.children.component] : []),
  ]);
  return lintPageSource(source, registry, builders, new Set());
}

describe.each([
  { parent: "Accordion", child: "Collapsible" },
  { parent: "Tabs", child: "Tab" },
])("$parent child selection at page save", ({ parent, child }) => {
  const source = (attribute: string) => `<${parent} ${attribute}>
  <${child} title="Premier">Premier contenu</${child}>
  <${child} title="Second">Second contenu</${child}>
</${parent}>`;

  it.each(['default="second"', 'default={"second"}', 'default=""', ""])(
    "accepts the initial selection with %s",
    async (attribute) => {
      expect(await lint(source(attribute))).toEqual([]);
    }
  );

  it("still reports unknown attributes", async () => {
    expect(await lint(source('default="second" unknown="value"'))).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("n'a pas de propriété «\u00a0unknown\u00a0»"),
      }),
    ]);
  });

  it("rejects an evaluated selection expression", async () => {
    expect(await lint(source("default={selection}"))).toEqual([
      expect.objectContaining({ message: expect.stringContaining("expression à évaluer") }),
    ]);
  });

  it("rejects a boolean selection", async () => {
    expect(await lint(source("default={true}"))).toEqual([
      expect.objectContaining({ message: expect.stringContaining("attend du texte") }),
    ]);
  });
});

it("does not accept default on a standalone Collapsible", async () => {
  expect(await lint('<Collapsible title="Bloc" default="bloc">Contenu</Collapsible>'))
    .toEqual([
      expect.objectContaining({
        message: expect.stringContaining("n'a pas de propriété «\u00a0default\u00a0»"),
      }),
    ]);
});

it("recognizes only the selection prop declared by the descriptor", async () => {
  const builders = await loadComponentBuilders();
  const accordion = builders.find((spec) => spec.name === "Accordion")!;
  const panels = {
    ...accordion,
    name: "Panels",
    descriptor: {
      ...accordion.descriptor,
      children: {
        ...accordion.descriptor.children!,
        selection: { prop: "active", initial: "none" as const },
      },
    },
  };
  const source = (attribute: string) => `<Panels ${attribute}>
  <Collapsible title="Premier">A</Collapsible>
  <Collapsible title="Second">B</Collapsible>
</Panels>`;
  const check = (attribute: string, spec = panels) =>
    lintPageSource(source(attribute), ["Panels", "Collapsible"], [...builders, spec], new Set());
  expect(check('active="second"')).toEqual([]);
  expect(check('default="second"')).toEqual([
    expect.objectContaining({ message: expect.stringContaining("n'a pas de propriété") }),
  ]);
  const withoutSelection = {
    ...panels,
    descriptor: {
      ...panels.descriptor,
      children: { ...panels.descriptor.children, selection: undefined },
    },
  };
  expect(lintPageSource(source('default="second"'), ["Panels", "Collapsible"],
    [...builders, withoutSelection], new Set()))
    .toEqual([expect.objectContaining({ message: expect.stringContaining("n'a pas de propriété") })]);
});
