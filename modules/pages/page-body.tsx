import { notFound } from "next/navigation";
import { EntryContent } from "@/modules/forms/entry-content";
import { AccessRefused } from "@/modules/pages/ui/access-refused";
import { Prose } from "@/components/ui/prose";
import { leadingHeading, renderMdx } from "@/modules/authoring/mdx";
import { isEntryPage } from "@/modules/pages/entry-page";
import { getPageWithCurrent } from "@/modules/pages/content";
import { isRefused } from "@/modules/pages/rights";

// The chrome-free "show" of a page, read and rendered from its slug alone:
// the composition that used to live inside app/(bare)/[slug]/iframe (ADR
// 0022) — read, settle the reader's rights, branch fiche/MDX, render — now a
// root file so any surface that shows a page without its chrome can reuse it
// (the iframe route, the modal). A server component, so React streams it and
// an error boundary can catch a malformed template.
//
// `hideTitle` drops the page's own title for a container that names it
// itself: a fiche's stored title (ADR 0020), the heading an MDX page opens
// with. The default view honours it; a template is left to its author.
export async function PageBody({
  slug,
  hideTitle = false,
}: {
  slug: string;
  hideTitle?: boolean;
}): Promise<React.ReactNode> {
  const page = await getPageWithCurrent(slug);
  if (!page) notFound();

  // A page the reader may not see shows the same refusal as the page itself,
  // in its compact form (docs/permissions.md § Liens et boutons vers
  // l'inaccessible).
  if (isRefused(page)) {
    return <AccessRefused slug={slug} ownerName={page.ownerName} compact />;
  }

  if (isEntryPage(page)) {
    return (
      <article>
        <EntryContent
          formId={page.formId}
          rawData={page.current?.data}
          hideTitle={hideTitle}
        />
      </article>
    );
  }

  const content = page.current?.content ?? "";
  const lead = hideTitle ? leadingHeading(content) : null;
  return (
    <article>
      <Prose>{await renderMdx(lead ? lead.body : content)}</Prose>
    </article>
  );
}
