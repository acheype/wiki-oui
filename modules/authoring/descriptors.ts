import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  type ComponentDescriptor,
  type PropDefaults,
  descriptorDefaults,
  pascalCase,
  validateDescriptor,
} from "./descriptor";
import { readDescriptorSource } from "./descriptor-source";

// Server-side loader of the ComponentBuilder descriptors: every .yaml file
// in wiki-components/ describes the builder of its co-located .tsx component
// (docs/component-builder.md). Same regime as the registry (mdx.tsx):
// presence in the folder is the whitelist, loading fails fast and loud.
// System pages have no descriptor and never get one, so this never looks
// in wiki-components/system-pages/ — the plain .yaml filter already
// excludes it.

export interface ComponentBuilderSpec {
  /** Kebab file base, e.g. "file-link"; the authoritative on-disk identity. */
  base: string;
  /** Component tag name, e.g. "Button" (PascalCase of the file base). */
  name: string;
  descriptor: ComponentDescriptor;
  /** Omission-rule defaults, derived from the descriptor (ADR 0013). */
  defaults: PropDefaults;
}

const WIKI_COMPONENTS_DIR = path.join(process.cwd(), "modules/authoring/wiki-components");

let cache: Promise<ComponentBuilderSpec[]> | undefined;
let devStamp: string | undefined;

export function loadComponentBuilders(): Promise<ComponentBuilderSpec[]> {
  if (process.env.NODE_ENV === "development") return loadWithFileInvalidation();
  return (cache ??= buildSpecs());
}

// Dev memoization: rebuilding — and above all re-running the ts-morph
// verification — on every editor load costs seconds per request, yet editing
// a descriptor must still be picked up without a restart (ADR 0013). Keyed on
// a stamp of wiki-components/, so a change to a constant imported from outside
// that folder (resolveLiteral crossing files) goes undetected until the dev
// server restarts. A rejected promise stays cached on purpose: same sources,
// same error on the overlay, and fixing the file invalidates the stamp.
async function loadWithFileInvalidation(): Promise<ComponentBuilderSpec[]> {
  const stamp = await componentsDirStamp();
  if (!cache || stamp !== devStamp) {
    devStamp = stamp;
    cache = buildSpecs();
  }
  return cache;
}

async function componentsDirStamp(): Promise<string> {
  const files = await readdir(WIKI_COMPONENTS_DIR);
  const stamps = await Promise.all(
    files
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".tsx"))
      .sort()
      .map(async (file) => {
        const { mtimeMs, size } = await stat(path.join(WIKI_COMPONENTS_DIR, file));
        return `${file}:${mtimeMs}:${size}`;
      })
  );
  return stamps.join("\n");
}

async function buildSpecs(): Promise<ComponentBuilderSpec[]> {
  const files = await readdir(WIKI_COMPONENTS_DIR);
  const specs = await Promise.all(
    files
      .filter((file) => file.endsWith(".yaml"))
      .sort()
      .map((file) => buildSpec(file.slice(0, -".yaml".length)))
  );
  // Signature check on editor load, in dev only (ADR 0013): a YAML ↔ component
  // drift throws here, surfacing on the Next error overlay. The dynamic import
  // keeps ts-morph out of the production bundle (this branch is compiled away).
  if (process.env.NODE_ENV === "development") {
    const { verifyDescriptorSignatures } = await import("./verify");
    await verifyDescriptorSignatures(specs);
  }
  return specs;
}

async function buildSpec(base: string): Promise<ComponentBuilderSpec> {
  const { raw, lineOf } = await readDescriptorSource(base);
  // Meta-schema parse (ADR 0015): raw unknown in, typed descriptor out.
  const descriptor = validateDescriptor(base, raw, lineOf);
  return {
    base,
    name: pascalCase(base),
    descriptor,
    defaults: descriptorDefaults(descriptor),
  };
}
