import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/** The two disk reads and the one import the registry needs from a module. */
export interface WikiComponentSource {
  /** Bare file names in this module's wiki-components/, e.g. "button.yaml". */
  list: () => Promise<string[]>;
  /** Text of one of those files. */
  read: (file: string) => Promise<string>;
  /** The component module behind one kebab file base, e.g. "button". */
  load: (base: string) => Promise<Record<string, unknown>>;
}

/**
 * Every module that owns wiki components (ADR 0002, ADR 0029), and the three
 * ways the registry reaches into it. Sole source of truth: scan.ts lists and
 * reads through these entries, mdx.tsx imports through them. Adding a module
 * is adding one entry, the day its wiki-components/ holds a first file.
 *
 * The folder is spelled out inside every call rather than passed in, because
 * two build-time analyses only understand it written that way:
 *
 * - Next's output file tracing unions the possible values of an fs call's
 *   path argument *per call site*. One shared `readdir(dir)` reached with six
 *   different folders traces as "everything below their common ancestor" —
 *   modules/ itself, 189 source files copied into .next/standalone instead of
 *   the 26 that wiki-components/ actually holds.
 * - A dynamic import() resolves only when its variable is a single file name
 *   (Vite: "variables only represent file names one level deep") and the
 *   target folder already exists on disk (Turbopack: "Can't resolve …").
 */
export const WIKI_COMPONENT_MODULES = {
  accounts: {
    list: () => readdir(path.join(process.cwd(), "modules/accounts/wiki-components")),
    read: (file) => readFile(path.join(process.cwd(), "modules/accounts/wiki-components", file), "utf8"),
    load: (base) => import(`../../accounts/wiki-components/${base}.tsx`),
  },
  "entries-view": {
    list: () => readdir(path.join(process.cwd(), "modules/entries-view/wiki-components")),
    read: (file) => readFile(path.join(process.cwd(), "modules/entries-view/wiki-components", file), "utf8"),
    load: (base) => import(`../../entries-view/wiki-components/${base}.tsx`),
  },
  files: {
    list: () => readdir(path.join(process.cwd(), "modules/files/wiki-components")),
    read: (file) => readFile(path.join(process.cwd(), "modules/files/wiki-components", file), "utf8"),
    load: (base) => import(`../../files/wiki-components/${base}.tsx`),
  },
  forms: {
    list: () => readdir(path.join(process.cwd(), "modules/forms/wiki-components")),
    read: (file) => readFile(path.join(process.cwd(), "modules/forms/wiki-components", file), "utf8"),
    load: (base) => import(`../../forms/wiki-components/${base}.tsx`),
  },
  pages: {
    list: () => readdir(path.join(process.cwd(), "modules/pages/wiki-components")),
    read: (file) => readFile(path.join(process.cwd(), "modules/pages/wiki-components", file), "utf8"),
    load: (base) => import(`../../pages/wiki-components/${base}.tsx`),
  },
  permissions: {
    list: () => readdir(path.join(process.cwd(), "modules/permissions/wiki-components")),
    read: (file) => readFile(path.join(process.cwd(), "modules/permissions/wiki-components", file), "utf8"),
    load: (base) => import(`../../permissions/wiki-components/${base}.tsx`),
  },
} satisfies Record<string, WikiComponentSource>;

/** The name of a module listed above. */
export type WikiComponentModule = keyof typeof WIKI_COMPONENT_MODULES;
