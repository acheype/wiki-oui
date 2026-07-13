import { FilePlus2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DoubleClickToEdit } from "@/components/page/double-click-to-edit";
import { EntryView } from "@/components/forms/entry-view";
import { PageActions } from "@/components/page/page-actions";
import { Button } from "@/components/ui/button";
import { renderTemplateSource } from "@/lib/entry-render";
import {
  type EntryData,
  formSourcedValues,
  parseFormDescriptor,
} from "@/lib/form-descriptor";
import { formatDateTime } from "@/lib/format";
import { renderMdx } from "@/lib/mdx";
import { getPageWithCurrent } from "@/lib/pages";
import { prisma } from "@/lib/prisma";
import { isValidSlug } from "@/lib/slug";

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
    <div>
      <PageActions slug={slug} tags={page.tags} />
      <DoubleClickToEdit slug={slug}>
        <article className="prose prose-neutral max-w-none dark:prose-invert">
          {page.formId ? await renderEntry(page.formId, page.current?.data) : await renderMdx(page.current?.content ?? "")}
        </article>
      </DoubleClickToEdit>
      <p className="mt-10 border-t pt-3 text-xs text-muted-foreground">
        Créée le {formatDateTime(page.createdAt)} par{" "}
        {page.ownerName ?? "Anonyme"}
        {page.current &&
          ` · dernière modification le ${formatDateTime(page.current.createdAt)}`}
      </p>
    </div>
  );
}

// Renders an entry (ADR 0014): the form's MDX template with {champ} values
// substituted (escaped) then compiled through the sandboxed pipeline, or the
// auto-generated default view when the form has no template.
async function renderEntry(
  formId: string,
  rawData: unknown
): Promise<React.ReactNode> {
  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) return null;
  const parsed = parseFormDescriptor(form.schema);
  if (!parsed.descriptor) return null;
  const data: EntryData =
    rawData !== null && typeof rawData === "object" && !Array.isArray(rawData)
      ? (rawData as EntryData)
      : {};

  if (form.template && form.template.trim() !== "") {
    return renderMdx(renderTemplateSource(form.template, parsed.descriptor, data));
  }

  // Resolve form-sourced option values (entry slugs) to their current titles
  // for the default view's wiki links; a deleted target keeps its raw slug.
  const referenced = formSourcedValues(parsed.descriptor, data);
  const targets = referenced.length
    ? await prisma.page.findMany({
        where: { slug: { in: referenced } },
        include: { current: true },
      })
    : [];
  const linkTitles: Record<string, string> = {};
  for (const target of targets) {
    const targetData = target.current?.data;
    if (targetData !== null && typeof targetData === "object" && !Array.isArray(targetData)) {
      const title = (targetData as EntryData).title;
      if (typeof title === "string") linkTitles[target.slug] = title;
    }
  }

  return (
    <EntryView
      descriptor={parsed.descriptor}
      data={data}
      linkTitles={linkTitles}
    />
  );
}

function PageNotYetCreated({ slug }: { slug: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center">
      <FilePlus2 className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">
          La page « {slug} » n&apos;existe pas encore
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
