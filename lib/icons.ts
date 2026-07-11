import { icons as lucide } from "@iconify-json/lucide";
import type { IconifyJSON } from "@iconify/types";
import { getIconData, iconToHTML, iconToSVG, replaceIDs } from "@iconify/utils";
import { wikiConfig } from "@/wiki.config";

// Embedded Iconify sets (docs/architecture.md, v0.2): icon data ships as
// installed packages and renders to inline SVG on the server — no network
// call at runtime. Adding a set = pnpm add @iconify-json/{set} + one entry
// here + its name in wiki.config.ts icons.sets.

const INSTALLED_SETS: Record<string, IconifyJSON> = { lucide };

// Sorted names are precomputed once: the picker searches on every keystroke.
const activeSets: { name: string; set: IconifyJSON; sortedNames: string[] }[] =
  wikiConfig.icons.sets.map((name) => {
    const set = INSTALLED_SETS[name];
    if (!set) {
      throw new Error(
        `wiki.config.ts icons.sets: "${name}" is not registered in lib/icons.ts (is @iconify-json/${name} installed?)`
      );
    }
    const sortedNames = [
      ...Object.keys(set.icons),
      ...Object.keys(set.aliases ?? {}),
    ].sort();
    return { name, set, sortedNames };
  });

function svgFromSet(set: IconifyJSON, name: string): string | null {
  const data = getIconData(set, name);
  if (!data) return null;
  const svg = iconToSVG(data, { height: "1em", width: "1em" });
  return iconToHTML(replaceIDs(svg.body), svg.attributes);
}

/** Inline SVG markup for an Iconify id (`lucide:settings`), or null. */
export function iconSvg(id: string): string | null {
  const [prefix, name] = id.split(":");
  if (!name) return null;
  const set = activeSets.find((entry) => entry.name === prefix)?.set;
  return set ? svgFromSet(set, name) : null;
}

export interface IconMatch {
  /** Iconify id, e.g. `lucide:settings` — what the prop stores. */
  id: string;
  svg: string;
}

// Search across the embedded sets by name and aliases (Iconify vocabulary
// is English — the picker shows a discreet warning about it).
export function searchIcons(query: string, limit = 60): IconMatch[] {
  const needle = query.trim().toLowerCase();
  const matches: IconMatch[] = [];
  for (const { name: setName, set, sortedNames } of activeSets) {
    for (const name of sortedNames) {
      if (needle !== "" && !name.includes(needle)) continue;
      const svg = svgFromSet(set, name);
      if (svg) matches.push({ id: `${setName}:${name}`, svg });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}
