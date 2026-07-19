import { notFound } from "next/navigation";
import { EntryContent } from "@/components/forms/entry-content";
import { prisma } from "@/lib/prisma";

// Chrome-free entry render (docs/entries-view.md): the EntriesView popup's
// iframe loads GET /api/render/entry/[slug] — the entry's real "show"
// rendering (template or default view), same regime as /api/render.
export const dynamic = "force-dynamic";

export default async function RenderEntry({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = decodeURIComponent((await params).slug);
  const page = await prisma.page.findUnique({
    where: { slug },
    include: { current: true },
  });
  if (!page?.formId) notFound();
  return (
    <div className="p-4">
      <article>
        <EntryContent formId={page.formId} rawData={page.current?.data} />
      </article>
    </div>
  );
}
