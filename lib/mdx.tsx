import { readdir } from "node:fs/promises";
import path from "node:path";
import { compileMDX } from "next-mdx-remote/rsc";
import { mdxAnnotations } from "mdx-annotations";
import remarkGfm from "remark-gfm";
import type { MDXComponents } from "mdx/types";
import { pascalCase } from "@/lib/component-descriptor";
import { allowLiteralPropsOnly } from "@/lib/mdx-literal-props";
import { WikiLink } from "@/components/wiki/wiki-link";

// Renders wiki MDX inside the sandbox (ADR 0002). next-mdx-remote appends its
// own plugins AFTER ours, so mdx-annotations consumes its {{ … }} expressions
// before neutralization kicks in.
//
// blockJS is off on purpose: its filter drops every attribute expression
// whatever it holds, so `<Image width={400} />` silently lost its width — JSX
// props could only ever be strings. allowLiteralPropsOnly replaces it with an
// allowlist of static literals, which is both faithful to JSX (a component
// gets a real number) and stricter than a denylist of dangerous globals.
// blockDangerousJS stays on as a second, free layer.
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

// Component registry (ADR 0002): every .tsx file in components/wiki/ is
// callable from page content — presence in the folder IS the whitelist.
// Each file must export a component named as the PascalCase of its file name
// (button.tsx → Button). A co-located descriptor (button.yaml) only affects
// the editor's component menu (authoring backlog), never what may render.
const WIKI_COMPONENTS_DIR = path.join(process.cwd(), "components/wiki");

let registryCache: Promise<MDXComponents> | undefined;

function loadWikiComponents(): Promise<MDXComponents> {
  // No cache in dev so adding a component doesn't require a restart.
  if (process.env.NODE_ENV === "development") return buildRegistry();
  return (registryCache ??= buildRegistry());
}

async function buildRegistry(): Promise<MDXComponents> {
  const files = await readdir(WIKI_COMPONENTS_DIR);
  const registry: MDXComponents = {};
  for (const file of files) {
    if (!file.endsWith(".tsx")) continue;
    const base = file.slice(0, -".tsx".length);
    const name = pascalCase(base);
    // The extension keeps the bundler's directory scan to .tsx files only.
    const mod = await import(`../components/wiki/${base}.tsx`);
    if (typeof mod[name] !== "function") {
      throw new Error(
        `components/wiki/${file} must export a component named ${name}`,
      );
    }
    registry[name] = mod[name];
  }
  return registry;
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
