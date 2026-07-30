import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DoubleClickToEdit } from "@/components/page/double-click-to-edit";
import { EntryContent } from "@/components/forms/entry-content";
import { PageActions } from "@/components/page/page-actions";
import { Prose } from "@/components/page/prose";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { renderMdx } from "@/lib/mdx";
import { getPageWithCurrent } from "@/lib/pages";
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
    return <PageNotYetCreated slug={slug} />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageActions slug={slug} tags={page.tags} />
      {/* flex-1: a short entry's blank area stays double-clickable. */}
      <DoubleClickToEdit slug={slug} className="flex-1">
        <article>
          {page.formId ? (
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
