import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBody } from "@/modules/pages/page-body";
import { WikiFrameResizeEmitter } from "@/modules/pages/ui/wiki-frame-emitter";
import { readEntryData } from "@/modules/forms/form-descriptor";
import { firstHeadingText } from "@/modules/authoring/mdx";
import { isEntryPage } from "@/modules/pages/entry-page";
import { getPageWithCurrent } from "@/modules/pages/content";
import { isRefused } from "@/modules/pages/rights";
import { isValidSlug } from "@/lib/slug";

// The /{slug}/iframe handler (ADR 0001): the page's real "show" rendering
// stripped of chrome — no top bar, no footer (the (bare) route group escapes
// the (site) layout), and no PageActions (no "Modifier/Supprimer" in a mere
// preview). The composition itself is <PageBody>; this route wraps it in the
// iframe transport — the measurable [data-wiki-frame] box and the resize
// emitter.
//
// Since the modal and every in-place render went inline (ADR 0022), only two
// callers remain: the <Iframe> component (WikiFrame reads the box height
// same-origin) and cross-instance federation (WikiFrameResizeEmitter posts it
// by postMessage to another WikiOui). Both want the whole page, title
// included, so nothing is hidden here.
//
// No padding here: a caller that needs breathing room adds it on its side, so
// a bare <Iframe> embed reads flush against the surrounding page's own text.
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
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = decodeURIComponent((await params).slug);
  if (!isValidSlug(slug)) notFound();

  return (
    <div data-wiki-frame>
      <PageBody slug={slug} />
      <WikiFrameResizeEmitter />
    </div>
  );
}
