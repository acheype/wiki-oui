import { compileMDX } from "next-mdx-remote/rsc";
import { mdxAnnotations } from "mdx-annotations";
import remarkGfm from "remark-gfm";
import { mdxComponents } from "@/components/mdx/registry";

// Renders wiki MDX inside the sandbox (ADR 0002). next-mdx-remote strips
// import/export and JS expressions by default (blockJS) — and it appends its
// stripping plugins AFTER ours, so mdx-annotations consumes its {{ … }}
// expressions before neutralization kicks in.
export async function renderMdx(source: string): Promise<React.ReactNode> {
  try {
    const { content } = await compileMDX({
      source,
      components: withUnknownComponentsMuted(source),
      options: {
        mdxOptions: {
          remarkPlugins: [mdxAnnotations.remark, remarkGfm],
          rehypePlugins: [mdxAnnotations.rehype],
          recmaPlugins: [mdxAnnotations.recma],
        },
      },
    });
    return content;
  } catch (error) {
    return <MdxCompileError error={error} />;
  }
}

// The compiled MDX throws at render time on any component missing from the
// registry. Mapping every capitalized tag found in the source to a no-op
// beforehand turns "unknown component" into "renders nothing" (ADR 0002).
// Over-matching (e.g. inside code fences) is harmless: unused keys are ignored.
function withUnknownComponentsMuted(source: string) {
  const components: Record<string, React.ComponentType> = {};
  for (const [, name] of source.matchAll(/<([A-Z][A-Za-z0-9]*)/g)) {
    components[name] = UnknownComponent;
  }
  return { ...components, ...mdxComponents };
}

function UnknownComponent() {
  return null;
}

// True when the source renders to nothing visible (only comments/whitespace),
// so layout slots like page-header can collapse instead of leaving a gap.
export function isBlankMdx(source: string): boolean {
  return source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").trim() === "";
}

function MdxCompileError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
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
