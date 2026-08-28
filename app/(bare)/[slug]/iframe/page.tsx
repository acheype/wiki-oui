import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntryContent } from "@/modules/forms/ui/entry-content";
import { AccessRefused } from "@/modules/pages/ui/access-refused";
import { Prose } from "@/components/ui/prose";
import { WikiFrameResizeEmitter } from "@/modules/pages/ui/wiki-frame-emitter";
import { readEntryData } from "@/modules/forms/form-descriptor";
import { firstHeadingText, leadingHeading, renderMdx } from "@/modules/authoring/mdx";
import { isEntryPage } from "@/modules/pages/entry-page";
import { getPageWithCurrent } from "@/modules/pages/content";
import { isRefused } from "@/modules/pages/rights";
import { isValidSlug } from "@/lib/slug";

// The /{slug}/iframe handler (ADR 0001): the page's real "show" rendering
// stripped of chrome — no top bar, no footer (the (bare) route group escapes
// the (site) layout), and no PageActions (no "Modifier/Supprimer" in a mere
// preview). It is what every in-iframe view loads (docs/entries-view.md,
// docs/component-builder.md), replacing the old /api/render/entry route and
// widening it to any page, entry or plain MDX.
//
// `?title=hidden` drops the page's own title for a container that names it
// itself (an unfolded Liste row, a modal's title bar): the stored title of a
// fiche (ADR 0020), the heading an MDX page opens with. What was taken off
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
  const { title } = await searchParams;

  const page = await getPageWithCurrent(slug);
  if (!page) notFound();

  // A frame onto a page the reader may not see shows the same refusal as the
  // page itself, in its compact form — this route is always loaded inside a
  // frame (docs/permissions.md § Liens et boutons vers l'inaccessible), and
  // WikiFrame sizes down to it (ADR 0022).
  if (isRefused(page)) {
    return (
      <div data-wiki-frame>
        <AccessRefused slug={slug} ownerName={page.ownerName} compact />
        <WikiFrameResizeEmitter />
      </div>
    );
  }

  const hidden = title === "hidden";
  const entry = isEntryPage(page);
  const content = page.current?.content ?? "";
  // Taken off the render, and handed to the container on the box.
  const lead = hidden && !entry ? leadingHeading(content) : null;
  let hiddenTitle: string | undefined;
  if (hidden && entry) {
    const stored = readEntryData(page.current?.data).title;
    hiddenTitle =
      typeof stored === "string" && stored.trim() ? stored : undefined;
  } else if (hidden) {
    hiddenTitle = lead?.title;
  }

  return (
    <div data-wiki-frame data-wiki-title={hiddenTitle}>
      <article>
        {entry ? (
          <EntryContent
            formId={page.formId}
            rawData={page.current?.data}
            hideTitle={hidden}
          />
        ) : (
          <Prose>{await renderMdx(lead ? lead.body : content)}</Prose>
        )}
      </article>
      <WikiFrameResizeEmitter />
    </div>
  );
}
