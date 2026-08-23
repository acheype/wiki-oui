import { compileMDX } from "next-mdx-remote/rsc";
import { mdxAnnotations } from "mdx-annotations";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { EXIT, visit } from "unist-util-visit";
import type { MDXComponents } from "mdx/types";
import { pascalCase } from "@/modules/authoring/descriptor";
import {
  allowListedHostElementsOnly,
  normalizePastedHtmlAttributes,
} from "@/modules/authoring/host-elements";
import { allowLiteralPropsOnly } from "@/modules/authoring/literal-props";
import { listWikiComponentFiles } from "./registry/scan";
import { WikiLink } from "@/modules/pages/wiki-components/wiki-link";

// Renders wiki MDX inside the sandbox (ADR 0002). next-mdx-remote appends its
// own plugins AFTER ours, so mdx-annotations consumes its {{ … }} expressions
// before neutralization kicks in.
//
// Three allowlists, one per thing an author writes: which tags may render
// (the registry for components, allowListedHostElementsOnly for HTML), and
// which prop values survive (allowLiteralPropsOnly).
//
// blockJS is off on purpose: its filter drops every attribute expression
// whatever it holds, so `<Image width={400} />` silently lost its width — JSX
// props could only ever be strings. allowLiteralPropsOnly replaces it with an
// allowlist of static literals, which is both faithful to JSX (a component
// gets a real number) and stricter than a denylist of dangerous globals.
// blockDangerousJS stays on as a second, free layer — it only knows globals
// (eval, process…), so it never saw the tags or prop names the other two gate.
export async function renderMdx(source: string): Promise<React.ReactNode> {
  try {
    const registry = await loadWikiComponents();
    const { content } = await compileMDX({
      source,
      components: {
        ...unknownComponentsMuted(source),
        ...registry,
        a: WikiLink,
      },
      options: {
        blockJS: false,
        blockDangerousJS: true,
        mdxOptions: {
          remarkPlugins: [
            mdxAnnotations.remark,
            remarkGfm,
            allowListedHostElementsOnly(),
            normalizePastedHtmlAttributes(),
            allowLiteralPropsOnly(),
          ],
          rehypePlugins: [mdxAnnotations.rehype],
          recmaPlugins: [mdxAnnotations.recma],
        },
      },
    });
    return content;
  } catch (error) {
    // Pass a plain string: handing the Error object itself to a component
    // crashes React dev's debug-info serialization (frame.join TypeError).
    return (
      <MdxCompileError
        message={error instanceof Error ? error.message : String(error)}
      />
    );
  }
}

// Component registry (ADR 0002, ADR 0029): every .tsx file found under each
// module's wiki-components/ (registry/scan.ts) is callable from page
// content — presence in one of those folders IS the whitelist. Each file
// must export a component named as the PascalCase of its file name
// (button.tsx → Button). A co-located descriptor (button.yaml) only affects
// the editor's component menu, never what may render — system pages have
// none and still render.
let registryCache: Promise<MDXComponents> | undefined;

function loadWikiComponents(): Promise<MDXComponents> {
  // No cache in dev so adding a component doesn't require a restart.
  if (process.env.NODE_ENV === "development") return buildRegistry();
  return (registryCache ??= buildRegistry());
}

/**
 * The tag names the registry answers to. Reads the directories without
 * importing the modules — the save-time report only needs to know what
 * exists, and must not drag every wiki component into its graph.
 */
export async function listWikiComponentNames(): Promise<string[]> {
  const files = await listWikiComponentFiles(".tsx");
  return files.map(({ base }) => pascalCase(base));
}

async function buildRegistry(): Promise<MDXComponents> {
  const registry: MDXComponents = {};
  for (const { module, base } of await listWikiComponentFiles(".tsx")) {
    const name = pascalCase(base);
    const mod = await loadWikiComponentModule(module, base);
    if (typeof mod[name] !== "function") {
      throw new Error(
        `modules/${module}/wiki-components/${base}.tsx must export a component named ${name}`,
      );
    }
    if (registry[name]) {
      throw new Error(`<${name}> is claimed by two modules — rename one of the files`);
    }
    registry[name] = mod[name] as React.ComponentType;
  }
  return registry;
}

// One import() expression per module, each with a single, one-level-deep
// variable (`base`, a bare file name — no "/" inside it): Vite's dynamic-
// import-vars analysis only resolves that exact shape, throwing "Unknown
// variable dynamic import" at runtime on anything else (two variables, or a
// variable holding a nested path) even though Vitest's warning stays silent
// about it. Worse, webpack (Next build) needs the target folder to exist at
// all — `Can't resolve '../permissions/wiki-components/'` — so a module is
// only listed here once its wiki-components/ folder is real — authoring's
// emptied out at the end of issue #19 (its wiki components all moved to the
// module of their concept) and stays out of this map until it holds one again.
const MODULE_LOADERS: Record<string, (base: string) => Promise<Record<string, unknown>>> = {
  accounts: (base) => import(`../accounts/wiki-components/${base}.tsx`),
  "entries-view": (base) => import(`../entries-view/wiki-components/${base}.tsx`),
  files: (base) => import(`../files/wiki-components/${base}.tsx`),
  forms: (base) => import(`../forms/wiki-components/${base}.tsx`),
  pages: (base) => import(`../pages/wiki-components/${base}.tsx`),
  permissions: (base) => import(`../permissions/wiki-components/${base}.tsx`),
};

function loadWikiComponentModule(
  module: string,
  base: string
): Promise<Record<string, unknown>> {
  const loader = MODULE_LOADERS[module];
  if (!loader) {
    throw new Error(
      `modules/${module}/wiki-components/${base}.tsx: no registry loader for module "${module}"`
    );
  }
  return loader(base);
}

// The compiled MDX throws at render time on any component missing from the
// registry. Mapping every capitalized tag found in the source to a no-op
// beforehand turns "unknown component" into "renders nothing" (ADR 0002).
// Over-matching (e.g. inside code fences) is harmless: unused keys are ignored.
function unknownComponentsMuted(source: string) {
  const components: Record<string, React.ComponentType> = {};
  for (const [, name] of source.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    components[name] = UnknownComponent;
  }
  return components;
}

function UnknownComponent() {
  return null;
}

// True when the source renders to nothing visible (only comments/whitespace),
// so layout slots like page-header can collapse instead of leaving a gap.
export function isBlankMdx(source: string): boolean {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim() === "";
}

// The plain text of the first heading in MDX source, or null when there is
// none (or the source does not parse). An MDX page has no stored title, so
// this names it — for the embedded frame's accessible name (WCAG H64), see
// app/(bare)/[slug]/iframe. Parsing to mdast (like lib/page-lint,
// lib/slug-rename) means a `#` inside a code fence or a `{{ }}` annotation is
// never mistaken for a heading.
export function firstHeadingText(source: string): string | null {
  let tree: unknown;
  try {
    tree = unified().use(remarkParse).use(remarkMdx).parse(source);
  } catch {
    return null;
  }
  let found: string | null = null;
  visit(tree as Parameters<typeof visit>[0], "heading", (node) => {
    const text = headingText(node).trim();
    if (text) {
      found = text;
      return EXIT;
    }
  });
  return found;
}

function headingText(node: unknown): string {
  const typed = node as { value?: unknown; children?: unknown[] };
  if (typeof typed.value === "string") return typed.value;
  if (Array.isArray(typed.children)) return typed.children.map(headingText).join("");
  return "";
}

function MdxCompileError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
      <p className="mb-2 font-medium text-destructive">
        Le contenu MDX de cette page ne compile pas.
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
        {message}
      </pre>
    </div>
  );
}
