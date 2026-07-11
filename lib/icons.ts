import { icons as lucide } from "@iconify-json/lucide";
import type { IconifyJSON } from "@iconify/types";
import { getIconData, iconToHTML, iconToSVG, replaceIDs } from "@iconify/utils";
import { wikiConfig } from "@/wiki.config";

// Embedded Iconify sets (docs/architecture.md, v0.2): icon data ships as
// installed packages and renders to inline SVG on the server — no network
// call at runtime. Adding a set = pnpm add @iconify-json/{set} + one entry
// here + its name in wiki.config.ts icons.sets.

const INSTALLED_SETS: Record<string, IconifyJSON> = { lucide };

const activeSets: [string, IconifyJSON][] = wikiConfig.icons.sets.map(
  (name) => {
    const set = INSTALLED_SETS[name];
    if (!set) {
      throw new Error(
        `wiki.config.ts icons.sets: "${name}" is not registered in lib/icons.ts (is @iconify-json/${name} installed?)`
      );
    }
    return [name, set];
  }
);

/** Inline SVG markup for an Iconify id (`lucide:settings`), or null. */
export function iconSvg(id: string): string | null {
  const [prefix, name] = id.split(":");
  if (!name) return null;
  const set = activeSets.find(([setName]) => setName === prefix)?.[1];
  if (!set) return null;
  const data = getIconData(set, name);
  if (!data) return null;
  const svg = iconToSVG(data, { height: "1em", width: "1em" });
  return iconToHTML(replaceIDs(svg.body), svg.attributes);
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
  for (const [setName, set] of activeSets) {
    const names = [
      ...Object.keys(set.icons),
      ...Object.keys(set.aliases ?? {}),
    ].sort();
    for (const name of names) {
      if (needle !== "" && !name.includes(needle)) continue;
      const id = `${setName}:${name}`;
      const svg = iconSvg(id);
      if (svg) matches.push({ id, svg });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}
