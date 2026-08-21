import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DoubleClickToEdit } from "@/modules/pages/ui/double-click-to-edit";
import { EntryContent } from "@/modules/forms/ui/entry-content";
import { AccessRefused } from "@/modules/pages/ui/access-refused";
import { PageActions } from "@/modules/pages/ui/page-actions";
import { Prose } from "@/components/ui/prose";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { renderMdx } from "@/lib/mdx";
import { isEntryPage } from "@/modules/pages/entry-page";
import { getPageWithCurrent } from "@/modules/pages/content";
import { isRefused, personCanCreatePage, personPermissions } from "@/modules/pages/rights";
import { isValidSlug } from "@/lib/slug";
import { displayName } from "@/lib/username";

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
    return (await personCanCreatePage()) ? (
      <PageNotYetCreated slug={slug} />
    ) : (
      <PageNotFound slug={slug} />
    );
  }
  if (isRefused(page)) {
    return <AccessRefused slug={slug} ownerName={page.ownerName} />;
  }

  const permissions = await personPermissions(page);

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

// The same address, to someone the wiki does not let create pages: the offer
// to create it would be the one thing they cannot take up (docs/permissions.md
// § Ce que voit qui n'a pas le droit — an action nobody can take informs
// nobody), so what is left is the plain fact that there is nothing here.
function PageNotFound({ slug }: { slug: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <FilePlus2 className="size-8 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">
        La page «&nbsp;{slug}&nbsp;» n&apos;existe pas
      </h1>
    </div>
  );
}

function PageNotYetCreated({ slug }: { slug: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <FilePlus2 className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">
          La page «&nbsp;{slug}&nbsp;» n&apos;existe pas encore
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vous pouvez la créer dès maintenant : elle sera enregistrée à sa
          première sauvegarde.
        </p>
      </div>
      <Button asChild>
        <Link href={`/${slug}/edit`}>Créer cette page</Link>
      </Button>
    </div>
  );
}
