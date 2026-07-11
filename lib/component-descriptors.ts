import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import {
  type ComponentDescriptor,
  type PropDefaults,
  descriptorDefaults,
  pascalCase,
  validateDescriptor,
} from "./component-descriptor";

// Server-side loader of the ComponentBuilder descriptors: every .yaml file
// in components/wiki/ describes the builder of its co-located .tsx component
// (docs/component-builder.md). Same regime as the registry (lib/mdx.tsx):
// presence in the folder is the whitelist, loading fails fast and loud.

export interface ComponentBuilderSpec {
  /** Component tag name, e.g. "Button" (from the file base name). */
  name: string;
  descriptor: ComponentDescriptor;
  /** Omission-rule defaults, derived from the descriptor (ADR 0013). */
  defaults: PropDefaults;
}

const WIKI_COMPONENTS_DIR = path.join(process.cwd(), "components/wiki");

let cache: Promise<ComponentBuilderSpec[]> | undefined;

export function loadComponentBuilders(): Promise<ComponentBuilderSpec[]> {
  // No cache in dev so editing a descriptor doesn't require a restart.
  if (process.env.NODE_ENV === "development") return buildSpecs();
  return (cache ??= buildSpecs());
}

async function buildSpecs(): Promise<ComponentBuilderSpec[]> {
  const files = await readdir(WIKI_COMPONENTS_DIR);
  return Promise.all(
    files
      .filter((file) => file.endsWith(".yaml"))
      .sort()
      .map((file) => buildSpec(file.slice(0, -".yaml".length)))
  );
}

async function buildSpec(base: string): Promise<ComponentBuilderSpec> {
  const descriptor = parse(
    await readFile(path.join(WIKI_COMPONENTS_DIR, `${base}.yaml`), "utf8")
  ) as ComponentDescriptor;
  if (typeof descriptor?.label !== "string" || !descriptor.properties) {
    throw new Error(
      `components/wiki/${base}.yaml: a descriptor needs at least "label" and "properties"`
    );
  }

  validateDescriptor(base, descriptor);
  return {
    name: pascalCase(base),
    descriptor,
    defaults: descriptorDefaults(descriptor),
  };
}
