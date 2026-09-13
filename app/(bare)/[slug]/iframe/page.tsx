import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBody } from "@/modules/pages/page-body";
import { WikiFrameResizeEmitter } from "@/modules/pages/ui/wiki-frame-emitter";
import { pageTitle } from "@/modules/pages/content";
import { isValidSlug } from "@/lib/slug";

// The /{slug}/iframe handler (ADR 0001): the page's real "show" rendering
// stripped of chrome — no top bar, no footer (the (bare) route group escapes
// the (site) layout), and no PageActions (no "Modifier/Supprimer" in a mere
// preview). The composition itself is <PageBody>; this route wraps it in the
// iframe transport — the measurable [data-wiki-frame] box and the resize +
// title emitter.
//
// Since the modal and every in-place render went inline (ADR 0022), only two
// callers remain: the <Iframe> component (WikiFrame reads the box height
// same-origin) and cross-instance federation (WikiFrameResizeEmitter posts the
// height — and the title — by postMessage to another WikiOui).
//
// ?title=hidden drops the page's own leading title from the body, for a
// cross-origin container that shows it in its own bar (a WikiLink/Button modal
// pointing at this page on another WikiOui): the container reads the title
// from the emitter's postMessage, never the walled-off document. The author
// opts in by writing the query themselves — as they write the /iframe suffix —
// so a bare <Iframe> embed keeps its title visible (it has no title bar).
//
// No padding here: a caller that needs breathing room adds it on its side, so
// a bare <Iframe> embed reads flush against the surrounding page's own text.
export const dynamic = "force-dynamic";

// The document <title> is the frame's accessible name (WCAG H64), and what the
// emitter posts to a cross-origin container. Same rule as everywhere: the
// title the page opens with (a fiche's stored title, ADR 0020; an MDX page's
// leading heading), else the slug — pageTitle, then the slug fallback a name
// must always have.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug);
  return { title: (await pageTitle(slug)) ?? slug };
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

  return (
    <div data-wiki-frame>
      <PageBody slug={slug} hideTitle={hidden} />
      <WikiFrameResizeEmitter />
    </div>
  );
}
