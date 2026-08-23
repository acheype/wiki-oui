import {
  type ComponentDescriptor,
  type PropDefaults,
  descriptorDefaults,
  pascalCase,
  validateDescriptor,
} from "./descriptor";
import { readDescriptorSource } from "./descriptor-source";
import { listWikiComponentFiles, statWikiComponentFile } from "./registry/scan";

// Server-side loader of the ComponentBuilder descriptors: every .yaml file
// in a module's wiki-components/ describes the builder of its co-located
// .tsx component (docs/component-builder.md). Same regime as the registry
// (mdx.tsx): presence in one of those folders is the whitelist, loading
// fails fast and loud. System pages have no descriptor and never get one,
// so this never picks up modules/authoring/wiki-components/system-pages/ —
// the plain .yaml filter already excludes it.

export interface ComponentBuilderSpec {
  /** The module owning the component (ADR 0029). */
  module: string;
  /** Kebab file base, e.g. "file-link"; the authoritative on-disk identity. */
  base: string;
  /** Component tag name, e.g. "Button" (PascalCase of the file base). */
  name: string;
  descriptor: ComponentDescriptor;
  /** Omission-rule defaults, derived from the descriptor (ADR 0013). */
  defaults: PropDefaults;
}

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

// Stamps every module's wiki-components/ (not just one), so editing a
// descriptor or component in any module invalidates the dev cache — a
// single-folder stamp would silently miss the others.
async function componentsDirStamp(): Promise<string> {
  const yamlFiles = await listWikiComponentFiles(".yaml");
  const tsxFiles = await listWikiComponentFiles(".tsx");
  const entries = [
    ...yamlFiles.map((file) => ({ ...file, extension: ".yaml" as const })),
    ...tsxFiles.map((file) => ({ ...file, extension: ".tsx" as const })),
  ].sort((a, b) =>
    `${a.module}/${a.base}${a.extension}`.localeCompare(`${b.module}/${b.base}${b.extension}`)
  );
  const stamps = await Promise.all(
    entries.map(async ({ module, base, extension }) => {
      const { mtimeMs, size } = await statWikiComponentFile(module, base, extension);
      return `${module}/${base}${extension}:${mtimeMs}:${size}`;
    })
  );
  return stamps.join("\n");
}

async function buildSpecs(): Promise<ComponentBuilderSpec[]> {
  const files = await listWikiComponentFiles(".yaml");
  const specs = await Promise.all(
    files.map(({ module, base }) => buildSpec(module, base))
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

async function buildSpec(module: string, base: string): Promise<ComponentBuilderSpec> {
  const { raw, lineOf } = await readDescriptorSource(module, base);
  // Meta-schema parse (ADR 0015): raw unknown in, typed descriptor out.
  const descriptor = validateDescriptor(`modules/${module}/wiki-components/${base}.yaml`, raw, lineOf);
  return {
    module,
    base,
    name: pascalCase(base),
    descriptor,
    defaults: descriptorDefaults(descriptor),
  };
}
