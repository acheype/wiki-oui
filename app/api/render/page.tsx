import { Prose } from "@/components/page/prose";
import { renderMdx } from "@/lib/mdx";

// ComponentBuilder preview (docs/component-builder.md): the modal's iframe
// loads GET /api/render?source=… — a chrome-free page (outside the (site)
// route group) rendered by the exact page pipeline, compile errors included.
// A page rather than a route.ts: serializing client components to HTML by
// hand is impossible in the react-server graph, only the real RSC rendering
// can produce a faithful, hydrated preview.

export const dynamic = "force-dynamic";

export default async function RenderPreview({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  return (
    <div className="p-3">
      <Prose>{await renderMdx(source ?? "")}</Prose>
    </div>
  );
}
