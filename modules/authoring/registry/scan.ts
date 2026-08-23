import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/** A wiki component on disk: the module that owns it and its kebab file base. */
export interface WikiComponentFile {
  module: string;
  base: string;
}

// Next's output file tracing (@vercel/nft) unions the possible values of an
// fs call's path argument *per call site*: one shared function whose `dir`
// (or `module`) parameter is invoked with several different values — even
// all-literal ones — gets traced as "whatever is under their common
// ancestor", which for eight modules is "modules/" itself (confirmed
// empirically: 189 files copied into .next/standalone instead of 26,
// dropping back to 26 the moment each module got its own, unshared function
// with the path written inline). So every module below gets its own
// same-shaped function repeated verbatim — the duplication is the fix, not
// an oversight.
async function accountsFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/accounts/wiki-components"), extension);
}
async function authoringFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/authoring/wiki-components"), extension);
}
async function entriesViewFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/entries-view/wiki-components"), extension);
}
async function filesFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/files/wiki-components"), extension);
}
async function formsFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/forms/wiki-components"), extension);
}
async function pagesFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/pages/wiki-components"), extension);
}
async function permissionsFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/permissions/wiki-components"), extension);
}
async function settingsFiles(extension: ".tsx" | ".yaml"): Promise<string[]> {
  return namesIn(path.join(process.cwd(), "modules/settings/wiki-components"), extension);
}

// Not itself an fs call site (no path literal here) — safe to share, unlike
// the readdir() calls above which each need their own inline path.
async function namesIn(dir: string, extension: ".tsx" | ".yaml"): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return []; // no wiki-components/ in this module
  }
  return entries
    .filter((file) => file.endsWith(extension))
    .map((file) => file.slice(0, -extension.length));
}

/**
 * Every wiki component of every module (ADR 0002): a module without a
 * wiki-components/ folder simply contributes none. Sorted so the registry,
 * the editor menu and the collision report never depend on readdir order.
 */
export async function listWikiComponentFiles(
  extension: ".tsx" | ".yaml"
): Promise<WikiComponentFile[]> {
  const found: WikiComponentFile[] = [];
  const push = (module: string, bases: string[]): void => {
    for (const base of bases) found.push({ module, base });
  };
  push("accounts", await accountsFiles(extension));
  push("authoring", await authoringFiles(extension));
  push("entries-view", await entriesViewFiles(extension));
  push("files", await filesFiles(extension));
  push("forms", await formsFiles(extension));
  push("pages", await pagesFiles(extension));
  push("permissions", await permissionsFiles(extension));
  push("settings", await settingsFiles(extension));
  return found.sort((a, b) => a.base.localeCompare(b.base));
}

// Same constraint as above, for the two other places that reach into a
// module's wiki-components/ by name: descriptor-source.ts's readFile and
// descriptors.ts's stat (both extensions, for the dev cache stamp). Each
// module gets its own function again, path written inline, for the same
// reason.
async function readAccounts(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/accounts/wiki-components", relative), "utf8");
}
async function readAuthoring(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/authoring/wiki-components", relative), "utf8");
}
async function readEntriesView(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/entries-view/wiki-components", relative), "utf8");
}
async function readFiles(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/files/wiki-components", relative), "utf8");
}
async function readForms(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/forms/wiki-components", relative), "utf8");
}
async function readPages(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/pages/wiki-components", relative), "utf8");
}
async function readPermissions(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/permissions/wiki-components", relative), "utf8");
}
async function readSettings(relative: string): Promise<string> {
  return readFile(path.join(process.cwd(), "modules/settings/wiki-components", relative), "utf8");
}

/** Reads `<module>/wiki-components/<relative>`. */
export function readWikiComponentFile(module: string, relative: string): Promise<string> {
  switch (module) {
    case "accounts":
      return readAccounts(relative);
    case "authoring":
      return readAuthoring(relative);
    case "entries-view":
      return readEntriesView(relative);
    case "files":
      return readFiles(relative);
    case "forms":
      return readForms(relative);
    case "pages":
      return readPages(relative);
    case "permissions":
      return readPermissions(relative);
    case "settings":
      return readSettings(relative);
    default:
      throw new Error(`modules/${module}/wiki-components/${relative}: no reader for module "${module}"`);
  }
}

type Stats = { mtimeMs: number; size: number };

async function statAccounts(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/accounts/wiki-components", relative));
}
async function statAuthoring(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/authoring/wiki-components", relative));
}
async function statEntriesView(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/entries-view/wiki-components", relative));
}
async function statFiles(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/files/wiki-components", relative));
}
async function statForms(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/forms/wiki-components", relative));
}
async function statPages(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/pages/wiki-components", relative));
}
async function statPermissions(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/permissions/wiki-components", relative));
}
async function statSettings(relative: string): Promise<Stats> {
  return stat(path.join(process.cwd(), "modules/settings/wiki-components", relative));
}

/** Stats `<module>/wiki-components/<base><extension>`. */
export function statWikiComponentFile(
  module: string,
  base: string,
  extension: ".tsx" | ".yaml"
): Promise<Stats> {
  const relative = `${base}${extension}`;
  switch (module) {
    case "accounts":
      return statAccounts(relative);
    case "authoring":
      return statAuthoring(relative);
    case "entries-view":
      return statEntriesView(relative);
    case "files":
      return statFiles(relative);
    case "forms":
      return statForms(relative);
    case "pages":
      return statPages(relative);
    case "permissions":
      return statPermissions(relative);
    case "settings":
      return statSettings(relative);
    default:
      throw new Error(`modules/${module}/wiki-components/${base}${extension}: no stat reader for module "${module}"`);
  }
}
