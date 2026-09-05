import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DoubleClickToEdit } from "@/modules/pages/ui/double-click-to-edit";
import { EntryContent } from "@/modules/forms/entry-content";
import { AccessRefused } from "@/modules/pages/ui/access-refused";
import { PageNotFound, PageNotYetCreated } from "@/modules/pages/ui/missing-page";
import { PageActions } from "@/modules/pages/ui/page-actions";
import { Prose } from "@/components/ui/prose";
import { formatDateTime } from "@/lib/format";
import { renderMdx } from "@/modules/authoring/mdx";
import { isEntryPage } from "@/modules/pages/entry-page";
import { getPageWithCurrent } from "@/modules/pages/content";
import { isRefused, currentCanCreatePage } from "@/modules/pages/rights";
import { currentPermissions } from "@/modules/permissions/person";
import { isValidSlug } from "@/lib/slug";
import { displayName } from "@/modules/accounts/username";

// Wiki content is edited live; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${decodeURIComponent(slug)} — WikiOui` };
}

export default async function ShowPage({ params }: Props) {
  const slug = decodeURIComponent((await params).slug);

  // ADR 0001: uppercase variants redirect to the canonical lowercase slug.
  const lowercased = slug.toLowerCase();
  if (slug !== lowercased && isValidSlug(lowercased)) {
    redirect(`/${lowercased}`);
  }
  if (!isValidSlug(slug)) {
    notFound();
  }

  const page = await getPageWithCurrent(slug);
  if (!page) {
    return (await currentCanCreatePage()) ? (
      <PageNotYetCreated slug={slug} />
    ) : (
      <PageNotFound slug={slug} />
    );
  }
  if (isRefused(page)) {
    return <AccessRefused slug={slug} ownerName={page.ownerName} />;
  }

  const permissions = await currentPermissions(page);

  return (
    <div className="flex flex-1 flex-col">
      <PageActions slug={slug} tags={page.tags} permissions={permissions} />
      {/* flex-1: a short entry's blank area stays double-clickable. */}
      <DoubleClickToEdit slug={slug} enabled={permissions.write} className="flex-1">
        <article>
          {isEntryPage(page) ? (
            <EntryContent formId={page.formId} rawData={page.current?.data} />
          ) : (
            <Prose>{await renderMdx(page.current?.content ?? "")}</Prose>
          )}
        </article>
      </DoubleClickToEdit>
      <p className="mt-10 border-t pt-3 text-xs text-muted-foreground">
        Créée le {formatDateTime(page.createdAt)} par{" "}
        {displayName(page.owner)}
        {page.current &&
          ` · dernière modification le ${formatDateTime(page.current.createdAt)}`}
      </p>
    </div>
  );
}
