import { pascalCase } from "../descriptor";
import {
  WIKI_COMPONENT_MODULES,
  type WikiComponentModule,
  type WikiComponentSource,
} from "./sources";

export type { WikiComponentModule } from "./sources";

/** A wiki component on disk: the module that owns it and its kebab file base. */
export interface WikiComponentFile {
  module: WikiComponentModule;
  base: string;
}

/**
 * Where a wiki component sits, spelled the way every message spells it. The
 * literal paths inside sources.ts cannot go through here — build-time tracing
 * only understands them written out at the fs call site — but nothing a
 * human reads has that excuse.
 */
export function wikiComponentPath(
  module: WikiComponentModule,
  base: string,
  extension: ".tsx" | ".yaml"
): string {
  return `modules/${module}/wiki-components/${base}${extension}`;
}

/**
 * The tag name two modules both claim, worded once. A tag resolves to exactly
 * one component (ADR 0002), and both guards say so identically: the prebuild
 * gate (scripts/verify-descriptors.ts) catches it before a build ships, the
 * registry build (mdx.tsx) before a page renders in dev, where no cache hides
 * it. Null when every name is claimed once.
 */
export function tagCollisionMessage(files: WikiComponentFile[]): string | null {
  const claims = new Map<string, WikiComponentModule>();
  for (const { module, base } of files) {
    const name = pascalCase(base);
    const owner = claims.get(name);
    if (owner && owner !== module) {
      return `<${name}> is claimed by two modules: ${owner} and ${module} — rename one of the files`;
    }
    claims.set(name, module);
  }
  return null;
}

const MODULES = Object.entries(WIKI_COMPONENT_MODULES) as [
  WikiComponentModule,
  WikiComponentSource,
][];

/**
 * Every wiki component of every module (ADR 0002). Sorted so the registry,
 * the editor menu and the collision report never depend on readdir order.
 */
export async function listWikiComponentFiles(
  extension: ".tsx" | ".yaml"
): Promise<WikiComponentFile[]> {
  const perModule = await Promise.all(
    MODULES.map(async ([module, source]) => {
      const files = await source.list();
      const found: WikiComponentFile[] = [];
      for (const file of files) {
        if (file.endsWith(extension)) {
          found.push({ module, base: file.slice(0, -extension.length) });
        }
      }
      return found;
    }),
  );
  return perModule.flat().sort((a, b) => a.base.localeCompare(b.base));
}

/** Reads `modules/<module>/wiki-components/<file>`. */
export function readWikiComponentFile(
  module: WikiComponentModule,
  file: string
): Promise<string> {
  return WIKI_COMPONENT_MODULES[module].read(file);
}

/** Imports the component module behind `<module>/wiki-components/<base>.tsx`. */
export function loadWikiComponentModule(
  module: WikiComponentModule,
  base: string
): Promise<Record<string, unknown>> {
  return WIKI_COMPONENT_MODULES[module].load(base);
}
