import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBody } from "@/modules/pages/page-body";
import { WikiFrameResizeEmitter } from "@/modules/pages/ui/wiki-frame-emitter";
import { readEntryData } from "@/modules/forms/form-descriptor";
import { firstHeadingText } from "@/modules/authoring/mdx";
import { isEntryPage } from "@/modules/pages/entry-page";
import { getPageWithCurrent, pageTitle } from "@/modules/pages/content";
import { isRefused } from "@/modules/pages/rights";
import { isValidSlug } from "@/lib/slug";

// The /{slug}/iframe handler (ADR 0001): the page's real "show" rendering
// stripped of chrome — no top bar, no footer (the (bare) route group escapes
// the (site) layout), and no PageActions (no "Modifier/Supprimer" in a mere
// preview). The composition itself is <PageBody>; this route wraps it in the
// iframe transport — the measurable [data-wiki-frame] box and the resize
// emitter — and carries the title mechanism.
//
// `?title=hidden` drops the page's own title for a container that names it
// itself (an unfolded Liste row, a modal's title bar). What was taken off
// then rides on the box as data-wiki-title, so that container can show it —
// a page with no title of its own carries nothing, and the container names
// itself. The [data-wiki-frame] box is the measurable height: WikiFrame sizes
// to it same-origin; WikiFrameResizeEmitter posts it to a cross-origin
// parent.
//
// No padding here: a caller that needs breathing room around the frame (the
// unfolded Liste row, the Carte panel) adds it on its side, so the default —
// a bare <Iframe> embed, a modal already padded by DialogContent — reads
// flush, without an offset against the surrounding page's own text.
export const dynamic = "force-dynamic";

// The document <title> is the frame's accessible name (WCAG H64): WikiFrame
// reads it same-origin and puts it on the <iframe>. A fiche uses its stored
// title (ADR 0020); an MDX page uses its first heading, else the slug.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  const page = await getPageWithCurrent(slug);
  if (!page || isRefused(page)) return {};
  if (isEntryPage(page)) {
    const title = readEntryData(page.current?.data).title;
    return { title: typeof title === "string" && title.trim() ? title : slug };
  }
  return { title: firstHeadingText(page.current?.content ?? "") ?? slug };
}

export default async function IframePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ title?: string }>;
}) {
  const slug = decodeURIComponent((await params).slug);
  if (!isValidSlug(slug)) notFound();
  const hidden = (await searchParams).title === "hidden";

  // The title lifted off a hidden render rides on the box, so the container
  // can name what <PageBody hideTitle> dropped. pageTitle reads through
  // cache(), sharing <PageBody>'s own query.
  return (
    <div
      data-wiki-frame
      data-wiki-title={hidden ? ((await pageTitle(slug)) ?? undefined) : undefined}
    >
      <PageBody slug={slug} hideTitle={hidden} />
      <WikiFrameResizeEmitter />
    </div>
  );
}
