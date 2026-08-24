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
  const found: WikiComponentFile[] = [];
  for (const [module, source] of MODULES) {
    for (const file of await source.list()) {
      if (file.endsWith(extension)) {
        found.push({ module, base: file.slice(0, -extension.length) });
      }
    }
  }
  return found.sort((a, b) => a.base.localeCompare(b.base));
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
