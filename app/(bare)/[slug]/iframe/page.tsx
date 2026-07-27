import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntryContent } from "@/components/forms/entry-content";
import { Prose } from "@/components/page/prose";
import { WikiFrameResizeEmitter } from "@/components/wiki/internal/wiki-frame-emitter";
import { readEntryData } from "@/lib/form-descriptor";
import { firstHeadingText, renderMdx } from "@/lib/mdx";
import { getPageWithCurrent } from "@/lib/pages";
import { isValidSlug } from "@/lib/slug";

// The /{slug}/iframe handler (ADR 0001): the page's real "show" rendering
// stripped of chrome — no top bar, no footer (the (bare) route group escapes
// the (site) layout), and no PageActions (no "Modifier/Supprimer" in a mere
// preview). It is what every in-iframe view loads (docs/entries-view.md,
// docs/component-builder.md), replacing the old /api/render/entry route and
// widening it to any page, entry or plain MDX.
//
// `?title=hidden` drops the entry title for a container that already names it
// (an unfolded Liste row). The [data-wiki-frame] box is the measurable height:
// WikiFrame sizes to it same-origin; WikiFrameResizeEmitter posts it to a
// cross-origin parent.
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
  if (!page) return {};
  if (page.formId) {
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
  const { title } = await searchParams;

  const page = await getPageWithCurrent(slug);
  if (!page) notFound();

  return (
    <div data-wiki-frame>
      <article>
        {page.formId ? (
          <EntryContent
            formId={page.formId}
            rawData={page.current?.data}
            hideTitle={title === "hidden"}
          />
        ) : (
          <Prose>{await renderMdx(page.current?.content ?? "")}</Prose>
        )}
      </article>
      <WikiFrameResizeEmitter />
    </div>
  );
}
